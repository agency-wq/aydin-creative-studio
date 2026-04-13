// BullMQ worker per la pipeline avatar video.
// Eseguilo come processo separato:
//   pnpm tsx src/lib/workers/avatar-video.worker.ts
//
// Pipeline (Fase 5 minimale):
//  1. ElevenLabs TTS (se voiceProvider == "elevenlabs")
//  2. Upload audio su HeyGen come asset (se serve)
//  3. HeyGen createAvatarVideo (script+voice native, oppure audio_asset_id)
//  4. Polling fino a completed
//  5. Salva finalVideoUrl + thumbnailUrl sul Project
//
// Le fasi successive (transcribe, motion graphics, b-roll, music, render Remotion finale)
// verranno aggiunte come step della stessa pipeline.

// IMPORTANTE: dotenv con override:true perche la shell potrebbe avere
// ANTHROPIC_API_KEY="" gia esportato (es. da Claude Desktop), che bloccherebbe
// il caricamento del valore reale dal file .env.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import fs from "node:fs/promises";
import path from "node:path";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient, Prisma } from "../../generated/prisma";
import {
  createAvatarVideo,
  pollVideoUntilDone,
  uploadAudioAsset,
  getRemainingQuota,
} from "../integrations/heygen";
import { textToSpeech } from "../integrations/elevenlabs";
import { transcribeAudio } from "../integrations/assemblyai";
import { fetchBrollFromPlan } from "../auto-broll";
import { saveMotionGraphicsFromPlan } from "../auto-motion-graphics";
import { buildTimelineFromPlan } from "../timeline";
import { planVideoFromScript, type VideoPlan } from "../ai-director";
import { translateAllMGs } from "../mg-translator";
import { getTheme as getThemeData } from "../../remotion/motion-graphics/themes-data";
import { brandKitToTheme, type BrandKit } from "../brand-kit";
import { renderMainVideo } from "../remotion-render";
import { composeMusic } from "../integrations/elevenlabs-music";
import {
  validateVideoPlan,
  fixVideoPlan,
  generatePipelineReport,
} from "../qa-agent";
import type { MainVideoProps, MusicTrack, RemotionSegment } from "../../remotion/types";

const AVATAR_VIDEO_QUEUE = "avatar-video";

const prisma = new PrismaClient();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// Cartella locale dove salviamo i file generati (audio + MP4 backup)
const OUTPUT_DIR = path.resolve(process.cwd(), "..", "output");

// Cartella public di Next.js dove scriviamo gli asset che devono essere
// referenziati da Remotion. Remotion durante il render serve `public/` come
// root di `staticFile()`, quindi un mp3 qui dentro e' risolvibile via
// staticFile("generated/music/<id>.mp3"). NON si puo' usare file:// URL
// perche' il renderer li rifiuta (solo http/https o staticFile).
const REMOTION_PUBLIC_DIR = path.resolve(process.cwd(), "public");
const MUSIC_PUBLIC_SUBDIR = "generated/music";
const AVATAR_PUBLIC_SUBDIR = "generated/avatar";

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.join(REMOTION_PUBLIC_DIR, MUSIC_PUBLIC_SUBDIR), { recursive: true });
  await fs.mkdir(path.join(REMOTION_PUBLIC_DIR, AVATAR_PUBLIC_SUBDIR), { recursive: true });
}

type JobData = { projectId: string; retryRender?: boolean };

async function processProject(job: Job<JobData>) {
  const { projectId, retryRender } = job.data;
  console.log(`\n[worker] picking up project ${projectId}${retryRender ? " (RETRY RENDER — skip HeyGen)" : ""}`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) throw new Error(`Project ${projectId} non trovato`);

  // Crea un RenderJob di tracking
  const renderJob = await prisma.renderJob.create({
    data: {
      projectId: project.id,
      step: "init",
      status: "RUNNING",
      startedAt: new Date(),
      bullJobId: String(job.id),
    },
  });

  const updateRender = (data: Parameters<typeof prisma.renderJob.update>[0]["data"]) =>
    prisma.renderJob.update({ where: { id: renderJob.id }, data });

  try {
    await ensureOutputDir();

    // Variabili condivise tra HeyGen-mode e retry-mode
    let heygenVideoUrl: string;
    let localMp4Path: string | undefined;
    let avatarStaticPath: string | undefined;
    let elevenlabsAudioPath: string | undefined;

    if (retryRender) {
      // ===================================================================
      // RETRY RENDER MODE — Salta HeyGen, usa il video gia generato
      // ===================================================================
      // Il progetto deve avere gia un finalVideoUrl (raw HeyGen).
      // Lo ri-scarichiamo in public/ per Remotion e ri-eseguiamo step 6-9.
      const existingUrl = project.finalVideoUrl;
      if (!existingUrl || !existingUrl.startsWith("http")) {
        throw new Error("Retry render: il progetto non ha un video HeyGen valido da ri-renderizzare");
      }
      heygenVideoUrl = existingUrl;
      console.log(`[worker] RETRY MODE: riuso video HeyGen esistente`);
      await updateRender({ step: "retry_download" });

      // Pulisci i vecchi MG/broll dal DB per evitare duplicati
      await prisma.motionGraphicsClip.deleteMany({ where: { projectId: project.id } });
      await prisma.brollClip.deleteMany({ where: { projectId: project.id } });
      console.log(`[worker]   ✓ vecchi MG/broll eliminati`);

      // Ri-scarica in public/ per Remotion
      try {
        const mp4Res = await fetch(heygenVideoUrl);
        if (mp4Res.ok) {
          const buf = Buffer.from(await mp4Res.arrayBuffer());
          localMp4Path = path.join(OUTPUT_DIR, `${project.id}.mp4`);
          await fs.writeFile(localMp4Path, buf);

          const avatarRelPath = `${AVATAR_PUBLIC_SUBDIR}/${project.id}.mp4`;
          const avatarAbsPath = path.join(REMOTION_PUBLIC_DIR, avatarRelPath);
          await fs.writeFile(avatarAbsPath, buf);
          avatarStaticPath = avatarRelPath;

          console.log(`[worker]   ✓ avatar ri-scaricato (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
        }
      } catch (err) {
        console.warn(`[worker]   ⚠ download MP4 fallito (continuo con URL remoto): ${(err as Error).message}`);
      }
    } else {
      // ===================================================================
      // NORMAL MODE — Pipeline completa con HeyGen
      // ===================================================================

      // STEP 1 — Audio (solo se voiceProvider == elevenlabs)
      let heygenAudioAssetId: string | undefined;

      if (project.voiceProvider === "elevenlabs") {
        console.log(`[worker] step 1/4 - generating ElevenLabs audio (voice ${project.voiceId})`);
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "GENERATING_AUDIO" },
        });
        await updateRender({ step: "elevenlabs_tts" });

        const voice = await prisma.voice.findUnique({
          where: { provider_id: { provider: "elevenlabs", id: project.voiceId } },
        });
        const recommended =
          (voice?.recommendedSettings as Record<string, number | boolean> | null) ?? undefined;

        const audioBuf = await textToSpeech({
          voiceId: project.voiceId,
          text: project.script,
          voiceSettings: recommended as
            | {
                stability?: number;
                similarity_boost?: number;
                style?: number;
                use_speaker_boost?: boolean;
              }
            | undefined,
        });

        elevenlabsAudioPath = path.join(OUTPUT_DIR, `${project.id}-audio.mp3`);
        await fs.writeFile(elevenlabsAudioPath, audioBuf);
        console.log(`[worker]   ✓ audio salvato (${(audioBuf.length / 1024).toFixed(1)} KB)`);

        console.log(`[worker] step 2/4 - upload audio su HeyGen`);
        await updateRender({ step: "heygen_upload_audio", elevenlabsAudioPath });

        const asset = await uploadAudioAsset(audioBuf, "audio/mpeg");
        heygenAudioAssetId = asset.id;
        console.log(`[worker]   ✓ asset HeyGen ${asset.id}`);

        await updateRender({ heygenAudioAssetId });
      }

      // STEP 3 — HeyGen avatar video
      const avatar = await prisma.avatar.findUnique({
        where: { id: project.avatarId },
        select: { quality: true, supportedEngines: true, name: true },
      });

      const useAvatarIV = false;

      console.log(
        `[worker] step 3/4 - generating HeyGen video (avatar ${project.avatarId} "${avatar?.name ?? "?"}", engine=III)`
      );
      await prisma.project.update({
        where: { id: project.id },
        data: { status: "GENERATING_AVATAR" },
      });
      await updateRender({ step: "heygen_create_video" });

      const videoOpts = {
        avatarId: project.avatarId,
        title: project.title,
        resolution: (project.resolution as "720p" | "1080p") ?? "720p",
        aspectRatio: (project.aspectRatio as "9:16" | "16:9") ?? "9:16",
        useAvatarIV,
        ...(heygenAudioAssetId
          ? { audioAssetId: heygenAudioAssetId }
          : { script: project.script, voiceId: project.voiceId }),
      };

      const { video_id } = await createAvatarVideo(videoOpts);
      console.log(`[worker]   ✓ heygen video_id ${video_id} (engine=III)`);
      await updateRender({ heygenVideoId: video_id, step: "heygen_polling" });

      // STEP 4 — Polling
      const finalStatus = await pollVideoUntilDone(video_id, {
        intervalMs: 8000,
        maxAttempts: 90,
        onTick: (s, attempt) => {
          if (attempt % 3 === 0) {
            console.log(`[worker]   polling [${attempt}] status=${s.status}`);
          }
        },
      });

      if (!finalStatus.video_url) {
        throw new Error("HeyGen ha completato ma video_url assente");
      }

      heygenVideoUrl = finalStatus.video_url;
      console.log(`[worker]   ✓ video pronto: ${heygenVideoUrl}`);

      // STEP 5 — Download MP4 locale + copia in public/ per Remotion
      try {
        const mp4Res = await fetch(heygenVideoUrl);
        if (mp4Res.ok) {
          const buf = Buffer.from(await mp4Res.arrayBuffer());
          localMp4Path = path.join(OUTPUT_DIR, `${project.id}.mp4`);
          await fs.writeFile(localMp4Path, buf);

          const avatarRelPath = `${AVATAR_PUBLIC_SUBDIR}/${project.id}.mp4`;
          const avatarAbsPath = path.join(REMOTION_PUBLIC_DIR, avatarRelPath);
          await fs.writeFile(avatarAbsPath, buf);
          avatarStaticPath = avatarRelPath;

          console.log(`[worker]   ✓ avatar locale ${localMp4Path} (${(buf.length / 1024 / 1024).toFixed(1)} MB) + public/${avatarRelPath}`);
        }
      } catch (err) {
        console.warn(`[worker]   ⚠ download MP4 fallito (continuo): ${(err as Error).message}`);
      }
    }

    // ===========================================================
    // STEP 6 — Trascrizione AssemblyAI (best-effort, non-blocking)
    // ===========================================================
    let transcriptData: Record<string, unknown> | null = null;
    if (process.env.ASSEMBLYAI_API_KEY) {
      try {
        console.log(`[worker] step 6 - trascrizione AssemblyAI`);
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "TRANSCRIBING" },
        });
        await updateRender({ step: "assemblyai_transcribe" });

        // Preferiamo trascrivere il file audio sorgente quando disponibile
        // (best quality + no compression del muxing HeyGen).
        // Altrimenti AssemblyAI puo trascrivere direttamente il video URL.
        const audioUrlForAai = elevenlabsAudioPath
          ? undefined // useremo il buffer locale
          : heygenVideoUrl;

        const audioBufferForAai = elevenlabsAudioPath
          ? await fs.readFile(elevenlabsAudioPath)
          : undefined;

        const result = await transcribeAudio({
          audioUrl: audioUrlForAai,
          audioBuffer: audioBufferForAai,
          languageCode: "it",
          onTick: (t, attempt) => {
            if (attempt % 3 === 0) {
              console.log(`[worker]   transcribe [${attempt}] status=${t.status}`);
            }
          },
        });

        transcriptData = {
          text: result.text,
          language: result.language,
          durationMs: result.durationMs,
          words: result.words,
        };
        console.log(
          `[worker]   ✓ trascritto: ${result.text.slice(0, 60)}… (${result.words.length} parole)`
        );

        await prisma.renderJob.update({
          where: { id: renderJob.id },
          data: { assemblyaiTranscriptId: result.text.slice(0, 32) },
        });
      } catch (err) {
        console.warn(
          `[worker]   ⚠ trascrizione fallita (continuo): ${(err as Error).message}`
        );
      }
    } else {
      console.log(`[worker] step 6 - skip transcribe (ASSEMBLYAI_API_KEY mancante)`);
    }

    // Persist transcript ASAP cosi e visibile anche se i prossimi step falliscono
    if (transcriptData) {
      await prisma.project.update({
        where: { id: project.id },
        data: { transcript: transcriptData as Prisma.InputJsonValue },
      });
    }

    // ===========================================================
    // STEP 7 — AI Director (UNICA chiamata Claude che pianifica TUTTO)
    //          + Salvataggio MG nel DB
    //          + Fetch b-roll Pexels guidato dal piano
    // ===========================================================
    //
    // Flusso plan-driven (vedi lib/ai-director.ts):
    //   1. Claude legge script + word-timestamps + theme + template registry
    //   2. Restituisce un VideoPlan con motionGraphics[] e broll[] gia'
    //      coordinati e con timestamp esatti, senza overlap
    //   3. saveMotionGraphicsFromPlan() salva i record MG nel DB
    //   4. fetchBrollFromPlan() scarica i video Pexels usando le query
    //      semantiche del director
    //   5. timeline.ts (step 9) fonde mgRecords + brRecords e costruisce
    //      i segmenti AVATAR/CUTAWAY contigui
    let videoPlan: VideoPlan | null = null;
    let mgRecords: Awaited<ReturnType<typeof saveMotionGraphicsFromPlan>>["records"] = [];
    let brRecords: Awaited<ReturnType<typeof fetchBrollFromPlan>>["records"] = [];
    let mgGenerated = 0;
    let brGenerated = 0;

    if (transcriptData) {
      // Risolvi il tema: priorità al brand kit del client, fallback al preset
      let themeName = "default";
      if (project.motionPresetId) {
        const mp = await prisma.motionGraphicsPreset.findUnique({
          where: { id: project.motionPresetId },
        });
        if (mp?.name) themeName = mp.name;
      }

      // Carica il client per brand kit + mockup
      const clientData = await prisma.client.findUnique({
        where: { id: project.clientId },
        select: {
          name: true,
          brandColors: true,
          mockupUrls: true,
          productName: true,
        },
      });

      // Se il client ha un brand kit estratto dal mockup, usiamo quello al posto dei preset
      const clientBrandKit = clientData?.brandColors as BrandKit | null;
      if (clientBrandKit?.accentColor) {
        // Sovrascriviamo il themeName con "Custom Brand" (il tema sarà costruito dinamicamente)
        themeName = `Brand ${clientData?.name ?? "Custom"}`;
        console.log(`[worker]   brand kit client: accent=${clientBrandKit.accentColor} mood=${clientBrandKit.mood ?? "n/a"}`);
      }

      // Mockup URL (primo disponibile) e nome prodotto
      const mockupUrl = clientData?.mockupUrls?.[0] ?? undefined;
      const productName = clientData?.productName ?? undefined;
      if (mockupUrl) {
        console.log(`[worker]   mockup: ${mockupUrl} · prodotto: "${productName ?? "n/a"}"`);
      }

      const aspect: "9:16" | "16:9" | "1:1" =
        project.aspectRatio === "16:9" ? "16:9" :
        project.aspectRatio === "1:1" ? "1:1" : "9:16";

      const wordsForDirector = Array.isArray(transcriptData.words)
        ? (transcriptData.words as Array<{ word: string; start: number; end: number; confidence?: number }>)
        : [];
      const durationMsForDirector = (transcriptData.durationMs as number) ?? 0;

      try {
        console.log(`[worker] step 7 - AI Director (Claude unified planner)`);
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "GENERATING_MOTION_GRAPHICS" },
        });
        await updateRender({ step: "ai_director" });

        videoPlan = await planVideoFromScript(
          {
            script: project.script,
            words: wordsForDirector,
            durationMs: durationMsForDirector,
            themeName,
            aspectRatio: aspect,
            mockupUrl,
            productName,
          },
          { log: (m) => console.log(`[worker]   ${m}`) }
        );
        console.log(
          `[worker]   ✓ piano (${videoPlan.source}): ${videoPlan.motionGraphics.length} MG + ${videoPlan.broll.length} broll · "${videoPlan.strategy.slice(0, 80)}"`
        );
      } catch (err) {
        console.warn(`[worker]   ⚠ AI Director fallito (continuo senza cutaway): ${(err as Error).message}`);
      }

      // STEP 7.05 — QA Agent: valida e auto-correggi il piano video
      if (videoPlan) {
        try {
          console.log(`[worker] step 7.05 - QA Agent: validazione piano video`);
          await updateRender({ step: "qa_validate_plan" });

          const qaReport = validateVideoPlan(videoPlan);
          if (qaReport.issues.length > 0) {
            console.log(
              `[worker]   QA found ${qaReport.issues.length} issues, applying auto-fix…`
            );
            const { plan: fixedPlan, fixesApplied } = fixVideoPlan(videoPlan);
            videoPlan = fixedPlan;
            console.log(
              `[worker]   ✓ QA auto-fix: ${fixesApplied} fixes applied (${videoPlan.motionGraphics.length} MG, ${videoPlan.broll.length} broll)`
            );

            // Re-validate after fix
            const recheck = validateVideoPlan(videoPlan);
            if (!recheck.passed) {
              console.warn(
                `[worker]   ⚠ QA post-fix still has errors: ${recheck.issues.filter((i) => i.severity === "error").length} errors`
              );
            }

            // Log full QA report
            const report = generatePipelineReport(null, {
              ...qaReport,
              fixesApplied,
            });
            console.log(report);
          } else {
            console.log(`[worker]   ✓ QA validation passed — no issues`);
          }
        } catch (err) {
          console.warn(
            `[worker]   ⚠ QA validation failed (continuando): ${(err as Error).message}`
          );
        }
      }

      // STEP 7.1 — Salva motion graphics dal piano nel DB
      if (videoPlan && videoPlan.motionGraphics.length > 0) {
        try {
          console.log(`[worker] step 7.1 - salvo ${videoPlan.motionGraphics.length} MG dal piano`);
          await updateRender({ step: "save_motion_graphics" });
          const r = await saveMotionGraphicsFromPlan({
            prisma,
            projectId: project.id,
            presetId: project.motionPresetId,
            plan: videoPlan,
            log: (m) => console.log(`[worker]   ${m}`),
          });
          mgRecords = r.records;
          mgGenerated = r.savedCount;
        } catch (err) {
          console.warn(`[worker]   ⚠ save-MG fallito (continuo): ${(err as Error).message}`);
        }
      }

      // STEP 7.2 — Traduzione MG descriptions → RenderSpec (CSS/SVG/animazioni)
      // Ogni descrizione creativa viene tradotta da Claude Sonnet in un RenderSpec
      // con accesso completo a CSS, SVG e animazioni keyframe.
      if (mgRecords.length > 0 && process.env.ANTHROPIC_API_KEY) {
        try {
          console.log(`[worker] step 7.2 - mg-translator: traduco ${mgRecords.length} MG descriptions → RenderSpec`);
          await updateRender({ step: "mg_translate" });

          // Usa brand kit dinamico del client se disponibile, altrimenti preset
          const mgTheme = clientBrandKit?.accentColor
            ? brandKitToTheme(clientBrandKit, clientData?.name)
            : getThemeData(themeName);
          console.log(`[worker]   tema MG: ${mgTheme.name} (accent=${mgTheme.accentColor})`);

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
            mockupUrl,
            log: (m) => console.log(`[worker]   ${m}`),
          });

          // Associa ogni RenderSpec al record corrispondente
          for (let j = 0; j < mgRecords.length; j++) {
            mgRecords[j].renderSpec = renderSpecs[j];
          }

          const successCount = renderSpecs.filter(
            (r) => r.elements.length > 1 || (r.elements[0]?.children?.length ?? 0) > 0
          ).length;
          console.log(
            `[worker]   ✓ mg-translator: ${successCount}/${mgRecords.length} traduzioni riuscite`
          );
        } catch (err) {
          console.warn(`[worker]   ⚠ mg-translator fallito (continuo con fallback): ${(err as Error).message}`);
        }
      }

      // STEP 8 — Pexels b-roll guidato dal piano
      if (videoPlan && videoPlan.broll.length > 0 && process.env.PEXELS_API_KEY) {
        try {
          console.log(`[worker] step 8 - Pexels b-roll plan-driven (${videoPlan.broll.length} clip)`);
          await prisma.project.update({
            where: { id: project.id },
            data: { status: "GENERATING_BROLL" },
          });
          await updateRender({ step: "fetch_broll" });

          const orientation =
            project.aspectRatio === "16:9" ? "landscape" :
            project.aspectRatio === "1:1" ? "square" : "portrait";

          const r = await fetchBrollFromPlan({
            prisma,
            projectId: project.id,
            plan: videoPlan,
            orientation,
            log: (m) => console.log(`[worker]   ${m}`),
          });
          brRecords = r.records;
          brGenerated = r.savedCount;
        } catch (err) {
          console.warn(`[worker]   ⚠ fetch-broll fallito (continuo): ${(err as Error).message}`);
        }
      } else if (videoPlan && videoPlan.broll.length > 0 && !process.env.PEXELS_API_KEY) {
        console.warn(`[worker]   ⚠ piano contiene ${videoPlan.broll.length} broll ma PEXELS_API_KEY mancante, skip`);
      }
    }

    // ===========================================================
    // STEP 8.5 — Musica background (ElevenLabs Music API)
    // ===========================================================
    // Il mood + il prompt inglese sono decisi dall'AI Director (step 7).
    // Qui chiamiamo ElevenLabs per generare la mp3 alla durata totale del
    // video, la salviamo in OUTPUT_DIR, e costruiamo la MusicTrack per
    // Remotion (file:// URL + volumi ducking/full decisi dall'AI Director).
    //
    // E' best-effort: se la API key manca o il piano ElevenLabs non ha Music
    // abilitato (403), il render prosegue senza musica.
    let musicTrack: MusicTrack | null = null;
    if (videoPlan && transcriptData && process.env.ELEVENLABS_API_KEY) {
      try {
        console.log(
          `[worker] step 8.5 - ElevenLabs Music compose (mood="${videoPlan.music.mood}")`
        );
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "GENERATING_MUSIC" },
        });
        await updateRender({ step: "elevenlabs_music" });

        const musicDurationMs = (transcriptData.durationMs as number) ?? 0;
        if (musicDurationMs < 3000) {
          console.warn(`[worker]   ⚠ durata video ${musicDurationMs}ms < 3s, skip musica`);
        } else {
          // Path ASSOLUTO (dove scriviamo il file dal worker Node) e path
          // RELATIVO a public/ (come Remotion lo risolvera' via staticFile).
          const musicRelPath = `${MUSIC_PUBLIC_SUBDIR}/${project.id}.mp3`;
          const musicAbsPath = path.join(REMOTION_PUBLIC_DIR, musicRelPath);
          const musicRes = await composeMusic(
            {
              prompt: videoPlan.music.prompt,
              durationMs: musicDurationMs,
              forceInstrumental: true,
            },
            musicAbsPath
          );
          console.log(
            `[worker]   ✓ musica composta (${(musicRes.bytes / 1024).toFixed(1)} KB @ ${musicRes.durationMs}ms): ${videoPlan.music.prompt}`
          );

          musicTrack = {
            // Path relativo a public/. MainVideo.tsx fa staticFile(url) per
            // trasformarlo nell'URL servito da Remotion durante il render.
            url: musicRelPath,
            duckingVolume: videoPlan.music.duckingVolume,
            fullVolume: videoPlan.music.fullVolume,
          };

          await updateRender({ musicUrl: musicAbsPath });
        }
      } catch (err) {
        console.warn(
          `[worker]   ⚠ musica fallita (continuo senza): ${(err as Error).message}`
        );
      }
    } else if (videoPlan && !process.env.ELEVENLABS_API_KEY) {
      console.log(`[worker] step 8.5 - skip musica (ELEVENLABS_API_KEY mancante)`);
    }

    // ===========================================================
    // STEP 9 — Timeline planning + Remotion render
    // ===========================================================
    let renderedFinalPath: string | undefined;
    if (transcriptData) {
      try {
        console.log(`[worker] step 9 - timeline planning + Remotion render`);
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "RENDERING" },
        });
        await updateRender({ step: "remotion_render" });

        const durationMs = (transcriptData.durationMs as number) ?? 0;

        // Converti le words AssemblyAI (start/end in ms) nel formato RemotionWord
        const rawWords = Array.isArray(transcriptData.words)
          ? (transcriptData.words as Array<{ word: string; start: number; end: number }>)
          : [];
        const words = rawWords.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }));

        // Plan-driven: i timestamp dei cutaway sono gia' nei mgRecords/brRecords
        // (li ha decisi l'AI Director). Il timeline builder li fonde + costruisce
        // segmenti AVATAR/CUTAWAY.
        const plan = buildTimelineFromPlan({
          durationMs,
          mgRecords,
          brollRecords: brRecords,
        });
        console.log(
          `[worker]   timeline: ${plan.cutawayCount} cutaway, ${plan.avatarCount} avatar segments`
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
          // motion-graphics: MG dinamica con RenderSpec (CSS/SVG/animazioni)
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

        // Risolvi captions preset selezionato dall'utente nel form (DB).
        // Default sicuro: Karaoke. Se l'id punta a un preset non implementato
        // in MainVideo.tsx (CaptionsRenderer), il dispatcher Remotion fa
        // fallback a Karaoke comunque, ma loggiamo qui cosa abbiamo passato.
        let captionPresetName = "Karaoke";
        if (project.captionPresetId) {
          const cp = await prisma.captionsPreset.findUnique({
            where: { id: project.captionPresetId },
          });
          if (cp?.remotionComponent) {
            captionPresetName = cp.remotionComponent;
            console.log(`[worker]   captions preset: ${cp.name} (${cp.remotionComponent})`);
          } else {
            console.warn(
              `[worker]   captionPresetId ${project.captionPresetId} non trovato in DB, fallback Karaoke`
            );
          }
        }

        // Usa il file locale (staticFile) se disponibile — MOLTO più veloce
        // e affidabile del download remoto HeyGen (37+ MB via proxy Remotion).
        const avatarUrl = avatarStaticPath ?? heygenVideoUrl;
        if (avatarStaticPath) {
          console.log(`[worker]   usando avatar locale: staticFile("${avatarStaticPath}")`);
        } else {
          console.warn(`[worker]   ⚠ avatar locale non disponibile, usando URL remoto HeyGen (rischio timeout)`);
        }

        const inputProps: MainVideoProps = {
          avatarVideoUrl: avatarUrl,
          durationMs,
          segments: remotionSegments,
          words,
          captionPreset: captionPresetName,
          music: musicTrack,
          width: targetW,
          height: targetH,
          fps: 30,
        };

        const outPath = path.join(OUTPUT_DIR, `${project.id}-final.mp4`);
        await renderMainVideo({
          inputProps,
          outputPath: outPath,
          onProgress: ({ progress }) => {
            if (Math.round(progress * 10) !== Math.round((progress - 0.1) * 10)) {
              console.log(`[worker]   render ${(progress * 100).toFixed(0)}%`);
            }
          },
        });
        renderedFinalPath = outPath;
        console.log(`[worker]   ✓ Remotion render salvato: ${outPath}`);
      } catch (err) {
        console.error(`[worker]   ❌ Remotion render FALLITO:`);
        console.error(err);
      }
    }

    // ===========================================================
    // Persist final state
    // ===========================================================
    // Se Remotion ha renderizzato, esponiamo via /api/projects/[id]/final-video
    // (la route streama il file con Range support). Altrimenti fallback al video HeyGen.
    const finalVideoUrl = renderedFinalPath
      ? `/api/projects/${project.id}/final-video`
      : heygenVideoUrl;

    if (!renderedFinalPath) {
      console.warn(
        `[worker]   ⚠⚠⚠ ATTENZIONE: Remotion render non disponibile, usando video HeyGen GREZZO (senza MG/captions/broll/musica)`
      );
    }

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: "COMPLETED",
        finalVideoUrl,
      },
    });

    await updateRender({
      status: "COMPLETED",
      step: "done",
      finishedAt: new Date(),
      finalRenderPath: renderedFinalPath ?? localMp4Path,
    });

    console.log(
      `[worker] ✅ project ${projectId} COMPLETED · MG=${mgGenerated} BR=${brGenerated} render=${!!renderedFinalPath}`
    );
    return { videoUrl: finalVideoUrl };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`[worker] ❌ project ${projectId} FAILED: ${message}`);

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "FAILED" },
    });
    await updateRender({
      status: "FAILED",
      errorMessage: message,
      finishedAt: new Date(),
    });
    throw err;
  }
}

async function main() {
  console.log(`[worker] starting BullMQ worker for queue "${AVATAR_VIDEO_QUEUE}"`);
  console.log(`[worker] redis: ${redisUrl}`);
  console.log(`[worker] output dir: ${OUTPUT_DIR}`);

  const worker = new Worker<JobData>(AVATAR_VIDEO_QUEUE, processProject, {
    connection,
    concurrency: 2,
  });

  worker.on("ready", () => console.log("[worker] ready ✓"));
  worker.on("completed", (job) => console.log(`[worker] job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`[worker] job ${job?.id} failed:`, err.message)
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[worker] shutting down…");
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
