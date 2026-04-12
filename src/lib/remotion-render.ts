// Helper server-side per fare il render Remotion → MP4.
// Bundle + selectComposition + renderMedia.
//
// Va chiamato SOLO da processi server (worker BullMQ), MAI dal browser.
//
// IMPORTANTE: il bundle viene cachato per performance (~15s di bundling).
// I file generati dalla pipeline (avatar MP4, musica MP3) vengono copiati
// nella cartella public/ del bundle PRIMA di ogni render via syncGeneratedFiles().

import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import type { MainVideoProps } from "../remotion/types";

let cachedBundleUrl: string | null = null;

async function getBundleUrl(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;

  const entry = path.resolve(process.cwd(), "src/remotion/index.ts");
  console.log(`[remotion] bundling entry ${entry}`);
  const url = await bundle({
    entryPoint: entry,
    publicDir: path.resolve(process.cwd(), "public"),
  });
  cachedBundleUrl = url;
  console.log(`[remotion] bundle ready: ${url}`);
  return url;
}

/**
 * Sincronizza i file dalla cartella `public/generated/` del progetto nella
 * cartella `public/generated/` del bundle Remotion temp. Questo è necessario
 * perché il bundle viene creato UNA volta e cachato, ma i file avatar/musica
 * vengono generati DURANTE la pipeline (dopo il bundling).
 *
 * Senza questa sync, staticFile("generated/avatar/xxx.mp4") ritorna 404
 * perché il file non esisteva quando il bundle è stato creato.
 */
async function syncGeneratedFiles(bundlePath: string): Promise<void> {
  const srcBase = path.resolve(process.cwd(), "public", "generated");
  const dstBase = path.join(bundlePath, "public", "generated");

  try {
    await copyDirRecursive(srcBase, dstBase);
  } catch (err) {
    // Se la cartella sorgente non esiste, non c'è nulla da sincronizzare
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`[remotion] nessun file generato da sincronizzare`);
      return;
    }
    throw err;
  }
}

/**
 * Copia ricorsiva di una directory. Sovrascrive i file esistenti.
 */
async function copyDirRecursive(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, dstPath);
    } else {
      // Copia solo se il file non esiste nel dst O se il sorgente è più recente
      try {
        const srcStat = await fs.stat(srcPath);
        let dstStat;
        try {
          dstStat = await fs.stat(dstPath);
        } catch {
          dstStat = null;
        }
        if (!dstStat || srcStat.mtimeMs > dstStat.mtimeMs) {
          await fs.copyFile(srcPath, dstPath);
          console.log(`[remotion] synced: ${entry.name} (${(srcStat.size / 1024 / 1024).toFixed(1)} MB)`);
        }
      } catch (e) {
        console.warn(`[remotion] sync warning for ${entry.name}: ${(e as Error).message}`);
      }
    }
  }
}

export async function renderMainVideo(opts: {
  inputProps: MainVideoProps;
  outputPath: string;
  onProgress?: (p: { progress: number; renderedFrames: number; encodedFrames: number }) => void;
}): Promise<{ outputPath: string }> {
  const serveUrl = await getBundleUrl();

  // Sincronizza i file generati dalla pipeline (avatar, musica) nel bundle
  // PRIMA di renderizzare, altrimenti staticFile() ritorna 404.
  await syncGeneratedFiles(serveUrl);

  const composition = await selectComposition({
    serveUrl,
    id: "MainVideo",
    inputProps: opts.inputProps,
  });

  console.log(
    `[remotion] composition ${composition.id} ${composition.width}x${composition.height} ` +
      `${composition.durationInFrames}f @${composition.fps}fps`
  );

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: opts.outputPath,
    inputProps: opts.inputProps,
    imageFormat: "jpeg",
    jpegQuality: 90,
    concurrency: null, // auto = CPU cores
    audioCodec: "aac",
    // Timeout alto: backup nel caso la sync fallisca e si usi URL remoto
    timeoutInMilliseconds: 120_000,
    onProgress: ({ progress, renderedFrames, encodedFrames }) =>
      opts.onProgress?.({ progress, renderedFrames, encodedFrames }),
  });

  return { outputPath: opts.outputPath };
}
