// Helper per estrarre il video ID da un URL YouTube e ricavare i thumbnail.
// Useremo i frame del thumbnail come "style reference" per Veo 3.1 Fast.

const YT_REGEX =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(YT_REGEX);
  return m?.[1] ?? null;
}

// YouTube espone diversi thumbnail di diverse risoluzioni
//   maxresdefault.jpg (1280x720) — non sempre presente
//   sddefault.jpg     (640x480)
//   hqdefault.jpg     (480x360)
//   mqdefault.jpg     (320x180)
export function youtubeThumbnailUrls(videoId: string): string[] {
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];
}

export function youtubeBestThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
