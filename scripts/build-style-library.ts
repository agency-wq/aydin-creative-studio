// Build style library: per ogni MotionGraphicsPreset scarica il video YouTube
// reference, estrae N frame distribuiti uniformemente con ffmpeg, li carica
// su fal.storage e popola preset.cachedFrameUrls.
//
// Idempotente: se cachedFrameUrls e gia popolato (>=4 URL) salta il preset
// (passa --force per riprocessare tutto).
//
// Requisiti:
//   - yt-dlp in PATH
//   - ffmpeg in PATH
//   - FAL_KEY in .env
//
// Run:
//   pnpm tsx scripts/build-style-library.ts          (skip presets gia processati)
//   pnpm tsx scripts/build-style-library.ts --force  (riprocessa tutti)
//   pnpm tsx scripts/build-style-library.ts VOX      (solo un preset per nome)

import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { uploadFileToFalStorage } from "../src/lib/integrations/falai";

const prisma = new PrismaClient();

const FRAMES_PER_PRESET = 12;
const SKIP_HEAD_SECONDS = 2; // ignora i primi 2s (titoli/logo)
const SKIP_TAIL_SECONDS = 2; // ignora gli ultimi 2s (subscribe/outro)
const VIDEO_FORMAT =
  "best[height<=480][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/bestvideo[height<=720]+bestaudio/best";

// =============================================================================
// Helpers
// =============================================================================

function spawnCmd(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exit ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function downloadYouTubeVideo(url: string, outDir: string): Promise<string> {
  const outTemplate = path.join(outDir, "video.%(ext)s");

  // Tentativo 1: native downloader (veloce per progressive mp4)
  try {
    await spawnCmd("yt-dlp", [
      "--no-warnings",
      "--no-playlist",
      "-f",
      VIDEO_FORMAT,
      "-o",
      outTemplate,
      "--merge-output-format",
      "mp4",
      url,
    ]);
  } catch (e) {
    // Fallback: ffmpeg downloader (funziona con HLS-only videos di YouTube)
    console.log(`    ⚠ native downloader fallito, retry con ffmpeg downloader…`);
    await spawnCmd("yt-dlp", [
      "--no-warnings",
      "--no-playlist",
      "--downloader",
      "ffmpeg",
      "-f",
      "best[ext=mp4]/best",
      "-o",
      outTemplate,
      url,
    ]);
  }

  // yt-dlp puo nominare il file in modi diversi (.mp4, .mkv, .webm)
  const files = await fs.readdir(outDir);
  const video = files.find((f) => f.startsWith("video."));
  if (!video) throw new Error(`yt-dlp non ha prodotto alcun file in ${outDir}`);
  return path.join(outDir, video);
}

async function getVideoDurationSec(videoPath: string): Promise<number> {
  const { stdout } = await spawnCmd("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  return Number(stdout.trim()) || 0;
}

/**
 * Estrae N frame distribuiti uniformemente nel range [skipHead, duration-skipTail].
 * Salva in outDir come frame-001.jpg, frame-002.jpg, ...
 */
async function extractFrames(opts: {
  videoPath: string;
  outDir: string;
  count: number;
  durationSec: number;
}): Promise<string[]> {
  const usableStart = Math.max(0, SKIP_HEAD_SECONDS);
  const usableEnd = Math.max(usableStart + 1, opts.durationSec - SKIP_TAIL_SECONDS);
  const usableLen = usableEnd - usableStart;
  const step = usableLen / (opts.count + 1);

  const framePaths: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const t = usableStart + step * (i + 1);
    const framePath = path.join(opts.outDir, `frame-${String(i + 1).padStart(3, "0")}.jpg`);
    await spawnCmd("ffmpeg", [
      "-y",
      "-ss",
      t.toFixed(3),
      "-i",
      opts.videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-vf",
      // Resize per ridurre upload (max 1080 sul lato lungo, mantiene aspect)
      "scale='if(gt(iw,ih),1080,-2)':'if(gt(iw,ih),-2,1080)'",
      framePath,
    ]);
    framePaths.push(framePath);
  }
  return framePaths;
}

async function uploadFrames(frames: string[], presetSlug: string): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const fp = frames[i];
    const bytes = await fs.readFile(fp);
    const fileName = `${presetSlug}-${path.basename(fp)}`;
    const { fileUrl } = await uploadFileToFalStorage({
      bytes,
      contentType: "image/jpeg",
      fileName,
    });
    urls.push(fileUrl);
    process.stdout.write(`    ↑ ${i + 1}/${frames.length} → ${fileUrl.slice(0, 80)}\n`);
  }
  return urls;
}

// =============================================================================
// Main
// =============================================================================

async function processPreset(opts: {
  preset: { id: string; name: string; styleReferenceUrl: string | null };
  force: boolean;
}): Promise<void> {
  const { preset, force } = opts;
  console.log(`\n→ ${preset.name}`);

  if (!preset.styleReferenceUrl) {
    console.log("  ⊘ nessuno styleReferenceUrl, skip");
    return;
  }

  // Skip se gia processato (a meno di --force)
  if (!force) {
    const existing = await prisma.motionGraphicsPreset.findUnique({
      where: { id: preset.id },
      select: { cachedFrameUrls: true },
    });
    if (existing && existing.cachedFrameUrls.length >= 4) {
      console.log(`  ⊙ gia processato (${existing.cachedFrameUrls.length} frame in cache), skip`);
      return;
    }
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `style-lib-${slugify(preset.name)}-`));
  try {
    console.log(`  ↓ download ${preset.styleReferenceUrl}`);
    const videoPath = await downloadYouTubeVideo(preset.styleReferenceUrl, tmpRoot);
    const durationSec = await getVideoDurationSec(videoPath);
    console.log(`    durata: ${durationSec.toFixed(1)}s`);

    console.log(`  ✂ estrazione ${FRAMES_PER_PRESET} frame`);
    const framesDir = path.join(tmpRoot, "frames");
    await fs.mkdir(framesDir, { recursive: true });
    const frames = await extractFrames({
      videoPath,
      outDir: framesDir,
      count: FRAMES_PER_PRESET,
      durationSec,
    });

    console.log(`  ☁ upload su fal.storage`);
    const urls = await uploadFrames(frames, slugify(preset.name));

    await prisma.motionGraphicsPreset.update({
      where: { id: preset.id },
      data: {
        cachedFrameUrls: urls as Prisma.MotionGraphicsPresetUpdateInput["cachedFrameUrls"],
      },
    });
    console.log(`  ✓ ${urls.length} URL salvati nel DB`);
  } finally {
    // Cleanup tmp
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filterName = args.find((a) => !a.startsWith("--"));

  const where = filterName ? { name: filterName } : {};
  const presets = await prisma.motionGraphicsPreset.findMany({
    where,
    select: { id: true, name: true, styleReferenceUrl: true },
    orderBy: { name: "asc" },
  });

  if (presets.length === 0) {
    console.log("Nessun preset trovato.");
    return;
  }

  console.log(
    `Build style library per ${presets.length} preset${force ? " (FORCE: riprocessa tutti)" : ""}\n`
  );

  let ok = 0;
  let fail = 0;
  for (const p of presets) {
    try {
      await processPreset({ preset: p, force });
      ok++;
    } catch (e) {
      console.error(`  ✗ FAIL: ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
