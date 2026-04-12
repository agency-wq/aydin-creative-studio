// Pexels Videos API client — b-roll stock gratis e illimitato.
// Docs: https://www.pexels.com/api/documentation/#videos
//
// Header: Authorization: <PEXELS_API_KEY>
// Endpoint: GET https://api.pexels.com/videos/search?query=...&orientation=portrait&size=medium&per_page=15

const PEXELS_BASE_URL = "https://api.pexels.com/videos";
const PEXELS_PHOTOS_URL = "https://api.pexels.com/v1";

function getApiKey(): string {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY non impostato in .env");
  return key;
}

function authHeaders(): Record<string, string> {
  return { Authorization: getApiKey() };
}

// =============================================================================
// Tipi
// =============================================================================

export type PexelsVideoFile = {
  id: number;
  quality: "hd" | "sd" | "uhd" | string;
  file_type: string; // "video/mp4"
  width: number;
  height: number;
  fps?: number;
  link: string; // URL diretto al .mp4
};

export type PexelsVideoPicture = {
  id: number;
  picture: string; // URL preview JPG
  nr: number;
};

export type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration: number; // secondi
  url: string; // pagina pexels.com
  image: string; // thumbnail principale
  user: { id: number; name: string; url: string };
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
};

export type PexelsSearchResponse = {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: PexelsVideo[];
  next_page?: string;
};

// =============================================================================
// API
// =============================================================================

export type PexelsOrientation = "landscape" | "portrait" | "square";
export type PexelsSize = "large" | "medium" | "small"; // 4K+ / FullHD+ / HD+

export async function searchVideos(opts: {
  query: string;
  orientation?: PexelsOrientation;
  size?: PexelsSize;
  perPage?: number;
  page?: number;
  locale?: string; // "it-IT" per query in italiano
}): Promise<PexelsSearchResponse> {
  const url = new URL(`${PEXELS_BASE_URL}/search`);
  url.searchParams.set("query", opts.query);
  if (opts.orientation) url.searchParams.set("orientation", opts.orientation);
  if (opts.size) url.searchParams.set("size", opts.size);
  url.searchParams.set("per_page", String(opts.perPage ?? 15));
  if (opts.page) url.searchParams.set("page", String(opts.page));
  if (opts.locale) url.searchParams.set("locale", opts.locale);

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Pexels search ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PexelsSearchResponse;
}

// Sceglie il file mp4 migliore per un video, preferendo HD verticale.
export function pickBestFile(
  video: PexelsVideo,
  prefer: { orientation?: PexelsOrientation; minHeight?: number } = {}
): PexelsVideoFile | null {
  const mp4s = video.video_files.filter((f) => f.file_type === "video/mp4");
  if (mp4s.length === 0) return null;

  const wantPortrait = prefer.orientation === "portrait";
  const minH = prefer.minHeight ?? 720;

  // Filtra per orientation se richiesto
  let candidates = mp4s;
  if (wantPortrait) {
    candidates = mp4s.filter((f) => f.height >= f.width);
    if (candidates.length === 0) candidates = mp4s;
  }

  // Ordina: preferisci HD (>=720) ma non UHD spreco
  candidates.sort((a, b) => {
    const aOk = a.height >= minH ? 0 : 1;
    const bOk = b.height >= minH ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    // tra quelli OK, scegli il piu vicino a 1080
    return Math.abs(a.height - 1080) - Math.abs(b.height - 1080);
  });

  return candidates[0] ?? null;
}

// =============================================================================
// Photos API (per fallback style image quando lo YT thumbnail e morto)
// =============================================================================

export type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    portrait: string;
    landscape: string;
  };
};

export type PexelsPhotosResponse = {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
};

export async function searchPhotos(opts: {
  query: string;
  orientation?: PexelsOrientation;
  perPage?: number;
}): Promise<PexelsPhotosResponse> {
  const url = new URL(`${PEXELS_PHOTOS_URL}/search`);
  url.searchParams.set("query", opts.query);
  if (opts.orientation) url.searchParams.set("orientation", opts.orientation);
  url.searchParams.set("per_page", String(opts.perPage ?? 5));

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Pexels photos search ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PexelsPhotosResponse;
}

// Estrae query keywords da uno script italiano (semplice, no NLP).
// Rimuove stopwords e tiene solo nomi/aggettivi candidati.
export function extractKeywords(script: string, max = 5): string[] {
  const stopwords = new Set([
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in",
    "con", "su", "per", "tra", "fra", "e", "ed", "o", "ma", "se", "che", "chi", "cui",
    "non", "ne", "ci", "vi", "si", "mi", "ti", "lo", "la", "li", "le", "ne", "del",
    "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai", "agli",
    "alle", "dal", "dallo", "dalla", "dai", "dagli", "dalle", "nel", "nello", "nella",
    "nei", "negli", "nelle", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "col",
    "coi", "essere", "avere", "fare", "questo", "questa", "questi", "queste", "quel",
    "quella", "quelli", "quelle", "molto", "poco", "tanto", "tutto", "tutta", "tutti",
    "tutte", "anche", "ancora", "gia", "piu", "meno", "come", "quando", "dove", "perche",
    "quindi", "infatti", "pero", "allora", "cosi", "ora", "poi", "sempre", "mai",
  ]);
  return Array.from(
    new Set(
      script
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !stopwords.has(w))
    )
  ).slice(0, max);
}
