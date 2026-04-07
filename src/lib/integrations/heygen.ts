// HeyGen API client
// Documentazione: https://docs.heygen.com/

const HEYGEN_BASE_URL = "https://api.heygen.com";
const HEYGEN_UPLOAD_URL = "https://upload.heygen.com";

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY non impostato");
  return key;
}

async function heygenFetch<T>(
  path: string,
  init?: RequestInit & { baseUrl?: string }
): Promise<T> {
  const baseUrl = init?.baseUrl ?? HEYGEN_BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": getApiKey(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HeyGen API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// =============== Quota ===============

export type HeyGenQuota = {
  remaining_quota: number;
  details: {
    api: number;
    avatar_iv_free_credit: number;
    [k: string]: number;
  };
};

export async function getRemainingQuota(): Promise<HeyGenQuota> {
  const r = await heygenFetch<{ data: HeyGenQuota }>("/v2/user/remaining_quota");
  return r.data;
}

// =============== Avatars (v3) ===============

export type HeyGenLook = {
  id: string;
  name: string;
  gender: string;
  avatar_type: string;
  image_width: number;
  image_height: number;
  supported_api_engines: string[];
  default_voice_id: string;
  preview_image_url: string;
  preview_video_url: string;
  group_id: string;
};

export async function listAvatarLooks(opts?: {
  limit?: number;
  pageToken?: string;
}): Promise<{ data: HeyGenLook[]; has_more: boolean; next_token: string | null }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.pageToken) params.set("token", opts.pageToken);

  return heygenFetch(`/v3/avatars/looks?${params.toString()}`);
}

// =============== Asset upload (audio per ElevenLabs lip-sync) ===============

export type HeyGenAsset = {
  id: string;
  name: string;
  file_type: "audio" | "image" | "video";
  url: string;
};

export async function uploadAudioAsset(
  audioBuffer: Buffer | Uint8Array,
  contentType: string = "audio/mpeg"
): Promise<HeyGenAsset> {
  const res = await fetch(`${HEYGEN_UPLOAD_URL}/v1/asset`, {
    method: "POST",
    headers: {
      "X-Api-Key": getApiKey(),
      "Content-Type": contentType,
    },
    body: audioBuffer as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HeyGen asset upload ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data: HeyGenAsset };
  return json.data;
}

// =============== Video generation (v3) ===============

export type CreateVideoOptions = {
  avatarId: string;
  resolution?: "720p" | "1080p";
  aspectRatio?: "9:16" | "16:9";
  title?: string;
  // Voice source: usa UNO solo dei seguenti gruppi
  script?: string;
  voiceId?: string; // richiesto con script
  audioAssetId?: string; // alternativa: audio uploaded (e.g. ElevenLabs)
  audioUrl?: string; // alternativa: public URL
  voiceSettings?: {
    speed?: number;
    pitch?: number;
    locale?: string;
  };
};

export async function createAvatarVideo(opts: CreateVideoOptions): Promise<{
  video_id: string;
  status: string;
}> {
  const body: Record<string, unknown> = {
    type: "avatar",
    avatar_id: opts.avatarId,
    resolution: opts.resolution ?? "720p",
    aspect_ratio: opts.aspectRatio ?? "9:16",
  };
  if (opts.title) body.title = opts.title;

  if (opts.script && opts.voiceId) {
    body.script = opts.script;
    body.voice_id = opts.voiceId;
  } else if (opts.audioAssetId) {
    body.audio_asset_id = opts.audioAssetId;
  } else if (opts.audioUrl) {
    body.audio_url = opts.audioUrl;
  } else {
    throw new Error("createAvatarVideo: serve script+voiceId, audioAssetId o audioUrl");
  }

  if (opts.voiceSettings) body.voice_settings = opts.voiceSettings;

  const r = await heygenFetch<{ data: { video_id: string; status: string } }>(
    "/v3/videos",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return r.data;
}

// =============== Video status (v3) ===============

export type VideoStatus = {
  video_id: string;
  status: "pending" | "waiting" | "processing" | "completed" | "failed" | "error";
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  error?: { code: string; message: string };
};

export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
  const r = await heygenFetch<{ data: VideoStatus }>(`/v3/videos/${videoId}`);
  return r.data;
}

// =============== Polling helper ===============

export async function pollVideoUntilDone(
  videoId: string,
  opts: { intervalMs?: number; maxAttempts?: number; onTick?: (s: VideoStatus, attempt: number) => void } = {}
): Promise<VideoStatus> {
  const intervalMs = opts.intervalMs ?? 10000;
  const maxAttempts = opts.maxAttempts ?? 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getVideoStatus(videoId);
    opts.onTick?.(status, attempt);

    if (status.status === "completed") return status;
    if (status.status === "failed" || status.status === "error") {
      throw new Error(
        `HeyGen video ${videoId} failed: ${status.error?.message ?? "unknown"}`
      );
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`HeyGen video ${videoId} timeout dopo ${maxAttempts} tentativi`);
}
