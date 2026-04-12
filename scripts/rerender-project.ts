// Re-render di un project ESISTENTE saltando audio/avatar/transcribe.
// Esegue solo gli step 7-9 (AI Director, save MG, fetch broll, Remotion render).
//
// Uso:
//   pnpm tsx scripts/rerender-project.ts <projectId> [--skip-broll] [--reuse-plan]
//
// Pre-requisiti:
//   - Il project deve avere transcript valido (durationMs + words)
//   - Il project deve avere finalVideoUrl/heygen video gia generato (per OffthreadVideo base)
//
// --skip-broll: non chiama Pexels (riusa b-roll gia presenti nel DB se ci sono)
// --reuse-plan: NON richiama l'AI Director, riusa MG e b-roll gia salvati nel
//               DB dal run precedente. Utile per iterare sul render Remotion
//               senza spendere altri token Claude o richiamare Pexels.

// IMPORTANTE: dotenv con override:true perche la shell potrebbe avere
// ANTHROPIC_API_KEY="" gia esportato (es. da Claude Desktop), che bloccherebbe
// il caricamento del valore reale dal file .env.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma";
import { saveMotionGraphicsFromPlan, type SavedMGRecord } from "../src/lib/auto-motion-graphics";
import { fetchBrollFromPlan, type SavedBrollRecord } from "../src/lib/auto-broll";
import { buildTimelineFromPlan } from "../src/lib/timeline";
import { planVideoFromScript, type VideoPlan } from "../src/lib/ai-director";
import { translateAllMGs } from "../src/lib/mg-translator";
import { getTheme as getThemeData } from "../src/remotion/motion-graphics/themes-data";
import { renderMainVideo } from "../src/lib/remotion-render";
import type { MainVideoProps, RemotionSegment } from "../src/remotion/types";

const prisma = new PrismaClient();
const OUTPUT_DIR = path.resolve(process.cwd(), "..", "output");

// Tiny HTTP server: serve un singolo file mp4 con Range support cosi Remotion
// puo scaricarlo (Remotion non accetta file:// URLs).
function startLocalFileServer(filePath: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const stat = statSync(filePath);
        const total = stat.size;
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const chunkSize = end - start + 1;
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": "video/mp4",
          });
          createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            "Content-Length": total,
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
          });
          createReadStream(filePath).pipe(res);
        }
      } catch (e) {
        res.writeHead(500);
        res.end((e as Error).message);
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr !== "object" || !addr) return reject(new Error("no addr"));
      const url = `http://127.0.0.1:${addr.port}/heygen.mp4`;
      resolve({
        url,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function main() {
  const projectId = process.argv[2];
  const skipBroll = process.argv.includes("--skip-broll");
  const reusePlan = process.argv.includes("--reuse-plan");
  if (!projectId) {
    console.error("Uso: pnpm tsx scripts/rerender-project.ts <projectId> [--skip-broll] [--reuse-plan]");
    process.exit(1);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project ${projectId} non trovato`);

  console.log(`\n[rerender] project ${projectId} · "${project.title}"`);
  console.log(`[rerender] aspectRatio=${project.aspectRatio} status=${project.status}`);

  const transcriptData = project.transcript as Record<string, unknown> | null;
  if (!transcriptData) throw new Error("Project senza transcript: impossibile re-renderare");

  const durationMs = (transcriptData.durationMs as number) ?? 0;
  if (!durationMs) throw new Error("Transcript senza durationMs");
  console.log(`[rerender] durationMs=${durationMs} (${(durationMs / 1000).toFixed(1)}s)`);

  const rawWords = Array.isArray(transcriptData.words)
    ? (transcriptData.words as Array<{ word: string; start: number; end: number; confidence?: number }>)
    : [];
  const words = rawWords.map((w) => ({ word: w.word, start: w.start, end: w.end }));

  // Heygen video URL: usa il backup mp4 locale ma servilo via HTTP locale
  // (Remotion accetta solo http/https, non file://).
  const localBackup = path.join(OUTPUT_DIR, `${projectId}.mp4`);
  try {
    await fs.access(localBackup);
  } catch {
    throw new Error(`Nessun backup HeyGen trovato per ${projectId}. Atteso: ${localBackup}`);
  }
  const fileServer = await startLocalFileServer(localBackup);
  const avatarVideoUrl = fileServer.url;
  console.log(`[rerender] backup HeyGen servito su ${avatarVideoUrl}`);

  // Risolvi themeName dal MotionGraphicsPreset
  let themeName = "default";
  if (project.motionPresetId) {
    const mp = await prisma.motionGraphicsPreset.findUnique({
      where: { id: project.motionPresetId },
    });
    if (mp?.name) themeName = mp.name;
  }

  const aspect: "9:16" | "16:9" | "1:1" =
    project.aspectRatio === "16:9" ? "16:9" :
    project.aspectRatio === "1:1" ? "1:1" : "9:16";

  let mgRecords: SavedMGRecord[] = [];
  let brRecords: SavedBrollRecord[] = [];

  if (reusePlan) {
    // ===========================================================
    // Riusa MG e b-roll gia presenti nel DB (no Claude, no Pexels)
    // ===========================================================
    console.log(`[rerender] step 7+8 — REUSE: leggo MG/broll esistenti dal DB`);
    const [mgClips, brClips] = await Promise.all([
      prisma.motionGraphicsClip.findMany({
        where: { projectId, status: "COMPLETED" },
        orderBy: { createdAt: "asc" },
      }),
      prisma.brollClip.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
      }),
    ]);
    // ATTENZIONE: in modalita reuse non abbiamo i timestamp originali del piano
    // (non sono in DB). Ricostruiamo distribuzione uniforme degli MG e dei
    // broll nei loro slot, snappata al transcript. Funziona solo se il
    // numero/ordine sono coerenti col run precedente.
    const total = mgClips.length + brClips.length;
    if (total > 0) {
      const usableStart = 1500;
      const usableEnd = durationMs - 800;
      const slot = (usableEnd - usableStart) / total;
      let idx = 0;
      mgRecords = mgClips
        .filter((c) => Boolean(c.templateName))
        .map((c) => {
          const center = usableStart + slot * (idx + 0.5);
          idx++;
          // Ricostruisci la description dalla templateProps legacy o dal prompt
          const propsJson = (c.templateProps ?? {}) as Record<string, unknown>;
          const description = typeof propsJson.description === "string"
            ? propsJson.description
            : c.prompt?.replace(/^\[.*?\]\s*/, "") ?? "Testo centrato con colori del tema";
          return {
            id: c.id,
            startMs: Math.round(center - 1500),
            endMs: Math.round(center + 1500),
            description,
            themeName: c.themeName,
          };
        });
      brRecords = brClips.map((c) => {
        const center = usableStart + slot * (idx + 0.5);
        idx++;
        return {
          id: c.id,
          startMs: Math.round(center - 1500),
          endMs: Math.round(center + 1500),
          videoUrl: c.videoUrl,
          durationSec: c.durationSec ?? 5,
        };
      });
    }
    console.log(
      `[rerender]   reuse: ${mgRecords.length} MG + ${brRecords.length} broll dal DB`
    );
  } else {
    // ===========================================================
    // STEP 7 — AI Director (UNICA chiamata Claude)
    // ===========================================================
    console.log(`[rerender] step 7 — AI Director (Claude unified planner)`);
    let videoPlan: VideoPlan | null = null;
    try {
      videoPlan = await planVideoFromScript(
        {
          script: project.script,
          words,
          durationMs,
          themeName,
          aspectRatio: aspect,
        },
        { log: (m) => console.log(`  ${m}`) }
      );
      console.log(
        `[rerender]   ✓ piano (${videoPlan.source}): ${videoPlan.motionGraphics.length} MG + ${videoPlan.broll.length} broll`
      );
    } catch (e) {
      console.warn(`[rerender]   ⚠ AI Director failed: ${(e as Error).message}`);
    }

    // STEP 7.1 — Salva MG dal piano nel DB
    if (videoPlan && videoPlan.motionGraphics.length > 0) {
      console.log(`[rerender] step 7.1 — salvo ${videoPlan.motionGraphics.length} MG dal piano`);
      const r = await saveMotionGraphicsFromPlan({
        prisma,
        projectId,
        presetId: project.motionPresetId,
        plan: videoPlan,
        log: (m) => console.log(`  ${m}`),
      });
      mgRecords = r.records;
      console.log(`[rerender]   MG: ${r.savedCount} ok, ${r.failedCount} failed`);
    }

    // STEP 8 — Pexels b-roll plan-driven
    if (!skipBroll && videoPlan && videoPlan.broll.length > 0 && process.env.PEXELS_API_KEY) {
      console.log(`[rerender] step 8 — Pexels b-roll plan-driven (${videoPlan.broll.length} clip)`);
      const orientation =
        project.aspectRatio === "16:9" ? "landscape" :
        project.aspectRatio === "1:1" ? "square" : "portrait";
      try {
        const r = await fetchBrollFromPlan({
          prisma,
          projectId,
          plan: videoPlan,
          orientation,
          log: (m) => console.log(`  ${m}`),
        });
        brRecords = r.records;
        console.log(`[rerender]   broll: ${r.savedCount} saved`);
      } catch (e) {
        console.warn(`[rerender]   broll failed: ${(e as Error).message}`);
      }
    } else if (skipBroll) {
      console.log(`[rerender] step 8 — skip broll (--skip-broll)`);
    } else if (!process.env.PEXELS_API_KEY) {
      console.log(`[rerender] step 8 — skip broll (PEXELS_API_KEY mancante)`);
    }
  }

  // ===========================================================
  // STEP 7.2 — Traduzione MG descriptions → RenderSpec
  // ===========================================================
  if (mgRecords.length > 0 && process.env.ANTHROPIC_API_KEY) {
    console.log(`[rerender] step 7.2 — mg-translator: traduco ${mgRecords.length} MG → RenderSpec`);
    try {
      const mgTheme = getThemeData(themeName);
      const targetW = project.aspectRatio === "16:9" ? 1920 : project.aspectRatio === "1:1" ? 1080 : 1080;
      const targetH = project.aspectRatio === "16:9" ? 1080 : project.aspectRatio === "1:1" ? 1080 : 1920;

      const descriptions = mgRecords.map((r, i) => ({
        description: r.description,
        index: i,
      }));

      const renderSpecs = await translateAllMGs({
        descriptions,
        theme: mgTheme,
        width: targetW,
        height: targetH,
        log: (m) => console.log(`  ${m}`),
      });

      for (let j = 0; j < mgRecords.length; j++) {
        mgRecords[j].renderSpec = renderSpecs[j];
      }

      const successCount = renderSpecs.filter(
        (r) => r.elements.length > 1 || (r.elements[0]?.children?.length ?? 0) > 0
      ).length;
      console.log(`[rerender]   ✓ ${successCount}/${mgRecords.length} traduzioni riuscite`);
    } catch (e) {
      console.warn(`[rerender]   ⚠ mg-translator failed (continuo con fallback): ${(e as Error).message}`);
    }
  }

  // ===========================================================
  // STEP 9 — Timeline + Remotion render
  // ===========================================================
  console.log(`[rerender] step 9 — timeline planning + Remotion render`);
  const plan = buildTimelineFromPlan({
    durationMs,
    mgRecords,
    brollRecords: brRecords,
  });
  console.log(
    `[rerender]   timeline: ${plan.cutawayCount} cutaway, ${plan.avatarCount} avatar segments`
  );

  const remotionSegments: RemotionSegment[] = plan.segments.map((s) => {
    if (s.type === "AVATAR") return { type: "AVATAR", startMs: s.startMs, endMs: s.endMs };
    if (s.clip.kind === "broll") {
      return {
        type: "CUTAWAY",
        startMs: s.startMs,
        endMs: s.endMs,
        clipKind: "broll",
        clipUrl: s.clip.videoUrl,
      };
    }
    return {
      type: "CUTAWAY",
      startMs: s.startMs,
      endMs: s.endMs,
      clipKind: "motion-graphics",
      description: s.clip.description,
      renderSpec: s.clip.renderSpec,
      themeName: s.clip.themeName ?? null,
    };
  });

  const targetW = project.aspectRatio === "16:9" ? 1920 : project.aspectRatio === "1:1" ? 1080 : 1080;
  const targetH = project.aspectRatio === "16:9" ? 1080 : project.aspectRatio === "1:1" ? 1080 : 1920;

  // Risolvi captions preset dal DB (vedi nota nel worker)
  let captionPresetName = "Karaoke";
  if (project.captionPresetId) {
    const cp = await prisma.captionsPreset.findUnique({
      where: { id: project.captionPresetId },
    });
    if (cp?.remotionComponent) {
      captionPresetName = cp.remotionComponent;
      console.log(`[rerender]   captions preset: ${cp.name} (${cp.remotionComponent})`);
    }
  }

  const inputProps: MainVideoProps = {
    avatarVideoUrl,
    durationMs,
    segments: remotionSegments,
    words,
    captionPreset: captionPresetName,
    width: targetW,
    height: targetH,
    fps: 30,
  };

  const outPath = path.join(OUTPUT_DIR, `${projectId}-final.mp4`);
  try {
    await renderMainVideo({
      inputProps,
      outputPath: outPath,
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 10 === 0) {
          process.stdout.write(`\r[rerender]   render ${pct}%`);
        }
      },
    });
  } finally {
    await fileServer.close();
  }
  process.stdout.write("\n");
  console.log(`[rerender] ✅ render salvato: ${outPath}`);
}

main()
  .catch((err) => {
    console.error("[rerender] FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
