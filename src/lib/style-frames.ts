// Risolvi gli style frames per un MotionGraphicsPreset, validando ogni URL
// con HEAD request e fallback a Pexels Photos search se gli YT thumb sono morti.

import { extractYouTubeId, youtubeBestThumbnail } from "./youtube";
import { searchPhotos } from "./integrations/pexels";

export async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function resolveStyleFrames(opts: {
  presetName: string;
  cachedFrameUrls: string[];
  styleReferenceUrl: string | null;
  log?: (msg: string) => void;
}): Promise<string[]> {
  const log = opts.log ?? (() => {});

  // 1. cachedFrameUrls validati
  for (const url of opts.cachedFrameUrls) {
    if (await isUrlReachable(url)) {
      log(`style frame: cached OK per ${opts.presetName}`);
      return [url];
    }
  }

  // 2. YouTube thumbnail derivato da styleReferenceUrl
  if (opts.styleReferenceUrl) {
    const ytId = extractYouTubeId(opts.styleReferenceUrl);
    if (ytId) {
      const ytThumb = youtubeBestThumbnail(ytId);
      if (await isUrlReachable(ytThumb)) {
        log(`style frame: YT thumb OK per ${opts.presetName}`);
        return [ytThumb];
      }
      log(`style frame: YT thumb 404 per ${opts.presetName}, provo Pexels Photos`);
    }
  }

  // 3. Fallback Pexels Photos
  if (process.env.PEXELS_API_KEY) {
    try {
      const r = await searchPhotos({
        query: `${opts.presetName} style aesthetic`,
        orientation: "portrait",
        perPage: 5,
      });
      const photo = r.photos[0];
      if (photo) {
        log(`style frame: Pexels Photo "${photo.photographer}" per ${opts.presetName}`);
        return [photo.src.portrait ?? photo.src.large];
      }
    } catch (e) {
      log(`style frame: Pexels fallback fallito: ${(e as Error).message}`);
    }
  }

  return [];
}
