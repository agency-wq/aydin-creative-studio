// fal.ai client — multi-model image-to-video.
// Default: Kling 2.6 Pro (miglior rapporto qualita/prezzo a 2026-04-07).
// Modelli disponibili:
//   kling-2.6-pro    $0.07/sec  no-audio, 9:16, qualita top
//   wan-2.5-720p     $0.10/sec  720p, ottimo per stilizzato
//   wan-2.5-480p     $0.05/sec  480p, low-cost prototipi
//   ltx-2.0          $0.04/sec  velocissimo, qualita media
//   veo-3.1-fast     $0.10/sec  720p Google Veo, fast tier
//
// API queue di fal: submit -> poll -> result.

const FAL_BASE_URL = "https://queue.fal.run";

function getApiKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY non impostato in .env");
  return key;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

// =============================================================================
// Model registry
// =============================================================================

export type FalModelKey =
  | "kling-2.6-pro"
  | "wan-2.5-720p"
  | "wan-2.5-480p"
  | "ltx-2.0"
  | "veo-3.1-fast";

type ModelConfig = {
  endpoint: string;
  costPerSecondUsd: number;
  supportedDurations: number[];
  supportedAspects: string[];
  buildBody: (input: GenerateInput) => Record<string, unknown>;
};

const MODELS: Record<FalModelKey, ModelConfig> = {
  // ---- DEFAULT — miglior rapporto qualita/prezzo per motion graphics ----
  "kling-2.6-pro": {
    endpoint: "fal-ai/kling-video/v2.6/pro/image-to-video",
    costPerSecondUsd: 0.07,
    supportedDurations: [5, 10],
    supportedAspects: ["16:9", "9:16", "1:1"],
    buildBody: (i) => ({
      prompt: i.prompt,
      start_image_url: i.imageUrls[0],
      duration: String(i.duration ?? 5),
      aspect_ratio: i.aspectRatio ?? "9:16",
      generate_audio: false,
      ...(i.negativePrompt ? { negative_prompt: i.negativePrompt } : {}),
    }),
  },

  // ---- Wan 2.5 720p — qualita simile a Kling, leggermente piu costoso ----
  "wan-2.5-720p": {
    endpoint: "fal-ai/wan-25-preview/image-to-video",
    costPerSecondUsd: 0.1,
    supportedDurations: [5, 10],
    supportedAspects: ["16:9", "9:16", "1:1"],
    buildBody: (i) => ({
      prompt: i.prompt,
      image_url: i.imageUrls[0],
      duration: String(i.duration ?? 5),
      resolution: "720p",
      ...(i.negativePrompt ? { negative_prompt: i.negativePrompt } : {}),
    }),
  },

  // ---- Wan 2.5 480p — il piu economico per prototipi ----
  "wan-2.5-480p": {
    endpoint: "fal-ai/wan-25-preview/image-to-video",
    costPerSecondUsd: 0.05,
    supportedDurations: [5, 10],
    supportedAspects: ["16:9", "9:16", "1:1"],
    buildBody: (i) => ({
      prompt: i.prompt,
      image_url: i.imageUrls[0],
      duration: String(i.duration ?? 5),
      resolution: "480p",
      ...(i.negativePrompt ? { negative_prompt: i.negativePrompt } : {}),
    }),
  },

  // ---- LTX 2.0 — velocissimo, qualita meno cinematica ----
  "ltx-2.0": {
    endpoint: "fal-ai/ltx-video-v2/image-to-video",
    costPerSecondUsd: 0.04,
    supportedDurations: [5, 8],
    supportedAspects: ["16:9", "9:16", "1:1"],
    buildBody: (i) => ({
      prompt: i.prompt,
      image_url: i.imageUrls[0],
      num_frames: (i.duration ?? 5) * 24,
      aspect_ratio: i.aspectRatio ?? "9:16",
    }),
  },

  // ---- Veo 3.1 Fast — Google, supporta multi-reference ----
  "veo-3.1-fast": {
    endpoint: "fal-ai/veo3.1/reference-to-video/fast",
    costPerSecondUsd: 0.1,
    supportedDurations: [4, 6, 8],
    supportedAspects: ["16:9", "9:16", "1:1"],
    buildBody: (i) => ({
      prompt: i.prompt,
      image_urls: i.imageUrls.slice(0, 3),
      duration: i.duration ?? 6,
      aspect_ratio: i.aspectRatio ?? "9:16",
      generate_audio: false,
    }),
  },
};

// Modello di default per tutto il sistema
export const DEFAULT_MODEL: FalModelKey =
  (process.env.FAL_DEFAULT_MODEL as FalModelKey) || "kling-2.6-pro";

export function listFalModels(): Array<{
  key: FalModelKey;
  endpoint: string;
  costPerSecondUsd: number;
  supportedDurations: number[];
  supportedAspects: string[];
}> {
  return (Object.keys(MODELS) as FalModelKey[]).map((key) => ({
    key,
    ...MODELS[key],
    buildBody: undefined as never,
  }));
}

export function estimateClipCostUsd(model: FalModelKey, duration: number): number {
  return Number((MODELS[model].costPerSecondUsd * duration).toFixed(3));
}

// =============================================================================
// Submit / poll / result
// =============================================================================

export type GenerateInput = {
  prompt: string;
  imageUrls: string[]; // 1+ reference frames (i modelli single-image usano [0])
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  negativePrompt?: string;
};

export type FalQueueJob = {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url: string;
};

export async function submitJob(model: FalModelKey, input: GenerateInput): Promise<FalQueueJob> {
  const cfg = MODELS[model];
  if (!cfg) throw new Error(`Modello fal sconosciuto: ${model}`);
  const body = cfg.buildBody(input);

  const res = await fetch(`${FAL_BASE_URL}/${cfg.endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai submit ${model} ${res.status}: ${text}`);
  }
  return (await res.json()) as FalQueueJob;
}

export type FalJobStatus = {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  queue_position?: number;
  logs?: Array<{ message: string; timestamp: string }>;
};

// IMPORTANTE: i polling URL li ritorna fal direttamente nel submit response.
// NON ricostruirli a mano dall'endpoint, perche per alcuni modelli (es. Kling)
// l'app slug e diverso dal model endpoint (es. status URL = "fal-ai/kling-video/...",
// model endpoint = "fal-ai/kling-video/v2.6/pro/image-to-video/..."), e ricostruirli
// produce un 405 Method Not Allowed.

export async function getJobStatus(statusUrl: string): Promise<FalJobStatus> {
  const res = await fetch(statusUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error(`fal.ai status ${res.status}: ${await res.text()}`);
  return (await res.json()) as FalJobStatus;
}

export type FalVideoResult = {
  video: { url: string; content_type?: string; file_size?: number };
  seed?: number;
};

export async function getJobResult(responseUrl: string): Promise<FalVideoResult> {
  const res = await fetch(responseUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error(`fal.ai result ${res.status}: ${await res.text()}`);
  return (await res.json()) as FalVideoResult;
}

export async function pollJobUntilDone(
  job: FalQueueJob,
  opts: { intervalMs?: number; maxAttempts?: number; onTick?: (s: FalJobStatus, attempt: number) => void } = {}
): Promise<FalVideoResult> {
  const intervalMs = opts.intervalMs ?? 5000;
  const maxAttempts = opts.maxAttempts ?? 120;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const s = await getJobStatus(job.status_url);
    opts.onTick?.(s, attempt);
    if (s.status === "COMPLETED") return getJobResult(job.response_url);
    if (s.status === "FAILED") throw new Error(`fal.ai job ${job.request_id} failed`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`fal.ai job ${job.request_id} timeout dopo ${maxAttempts} tentativi`);
}

// =============================================================================
// High-level helper
// =============================================================================

export async function generateMotionGraphicsClip(opts: {
  prompt: string;
  styleFrameUrls: string[];
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  model?: FalModelKey;
  onTick?: (s: FalJobStatus, attempt: number) => void;
}): Promise<{ videoUrl: string; requestId: string; seed?: number; model: FalModelKey; estimatedCostUsd: number }> {
  const model = opts.model ?? DEFAULT_MODEL;
  const duration = opts.duration ?? MODELS[model].supportedDurations[0];

  const job = await submitJob(model, {
    prompt: opts.prompt,
    imageUrls: opts.styleFrameUrls,
    duration,
    aspectRatio: opts.aspectRatio ?? "9:16",
  });

  const result = await pollJobUntilDone(job, { onTick: opts.onTick });

  return {
    videoUrl: result.video.url,
    requestId: job.request_id,
    seed: result.seed,
    model,
    estimatedCostUsd: estimateClipCostUsd(model, duration),
  };
}

// =============================================================================
// fal.storage upload — usato per caricare frame locali (estratti da yt-dlp + ffmpeg)
// senza dover configurare Backblaze. fal.media URL sono pubblici e cachable.
// =============================================================================

const FAL_STORAGE_INITIATE = "https://rest.alpha.fal.ai/storage/upload/initiate";

type FalStorageInitiateResponse = {
  upload_url: string;
  file_url: string;
};

/**
 * Carica un file binario su fal.storage e ritorna l'URL pubblico.
 * Flow a 2 step:
 *   1. POST /storage/upload/initiate -> ritorna { upload_url, file_url }
 *   2. PUT upload_url con il body binario -> file e online su file_url
 */
export async function uploadFileToFalStorage(opts: {
  bytes: Uint8Array | Buffer;
  contentType: string;
  fileName: string;
}): Promise<{ fileUrl: string }> {
  // Step 1: initiate
  const initRes = await fetch(FAL_STORAGE_INITIATE, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      file_name: opts.fileName,
      content_type: opts.contentType,
    }),
  });
  if (!initRes.ok) {
    throw new Error(`fal.storage initiate ${initRes.status}: ${await initRes.text()}`);
  }
  const init = (await initRes.json()) as FalStorageInitiateResponse;

  // Step 2: PUT binary
  const putRes = await fetch(init.upload_url, {
    method: "PUT",
    headers: { "Content-Type": opts.contentType },
    body: opts.bytes as BodyInit,
  });
  if (!putRes.ok) {
    throw new Error(`fal.storage PUT ${putRes.status}: ${await putRes.text()}`);
  }

  return { fileUrl: init.file_url };
}
