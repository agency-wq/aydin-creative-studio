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

// =============== Video generation (v2 — più stabile, esplicita Avatar III/IV) ===============
// Usiamo POST /v2/video/generate perché:
//  1. Ha il parametro esplicito use_avatar_iv_model (true=IV, false=III)
//  2. /v3/videos forza Avatar IV per default e fallisce con avatar legacy
//  3. Supporta tutti i tipi: text, audio (asset_id o url)

export type CreateVideoOptions = {
  avatarId: string;
  resolution?: "720p" | "1080p"; // mappato a dimension
  aspectRatio?: "9:16" | "16:9"; // mappato a dimension
  title?: string;
  // Voice source: UNO solo dei seguenti
  script?: string;
  voiceId?: string; // richiesto con script
  audioAssetId?: string; // alternativa: audio uploaded (es. ElevenLabs)
  audioUrl?: string; // alternativa: public URL
  // Engine: per default usiamo Avatar III (massima compatibilità)
  useAvatarIV?: boolean;
  voiceSettings?: {
    speed?: number;
    pitch?: number;
    locale?: string;
  };
};

function dimensionFor(resolution: "720p" | "1080p", aspectRatio: "9:16" | "16:9") {
  if (aspectRatio === "9:16") {
    return resolution === "1080p" ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
  }
  return resolution === "1080p" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}

export async function createAvatarVideo(opts: CreateVideoOptions): Promise<{
  video_id: string;
  status?: string;
}> {
  const character: Record<string, unknown> = {
    type: "avatar",
    avatar_id: opts.avatarId,
    avatar_style: "normal",
    use_avatar_iv_model: opts.useAvatarIV ?? false,
  };

  let voice: Record<string, unknown>;
  if (opts.audioAssetId) {
    voice = { type: "audio", audio_asset_id: opts.audioAssetId };
  } else if (opts.audioUrl) {
    voice = { type: "audio", audio_url: opts.audioUrl };
  } else if (opts.script && opts.voiceId) {
    voice = {
      type: "text",
      input_text: opts.script,
      voice_id: opts.voiceId,
      ...(opts.voiceSettings?.speed !== undefined ? { speed: opts.voiceSettings.speed } : {}),
      ...(opts.voiceSettings?.pitch !== undefined ? { pitch: opts.voiceSettings.pitch } : {}),
    };
  } else {
    throw new Error("createAvatarVideo: serve script+voiceId, audioAssetId o audioUrl");
  }

  const body: Record<string, unknown> = {
    video_inputs: [
      {
        character,
        voice,
        background: { type: "color", value: "#000000" },
      },
    ],
    dimension: dimensionFor(opts.resolution ?? "720p", opts.aspectRatio ?? "9:16"),
  };
  if (opts.title) body.title = opts.title;

  const r = await heygenFetch<{ data: { video_id: string } }>("/v2/video/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return r.data;
}

// =============== Video status (v1) ===============
// /v2/video/generate restituisce solo video_id; lo stato si polla su /v1/video_status.get

export type VideoStatus = {
  video_id: string;
  status: "pending" | "waiting" | "processing" | "completed" | "failed" | "error";
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  error?: { code: string; message: string };
};

export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
  const r = await heygenFetch<{ data: VideoStatus }>(
    `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`
  );
  return r.data;
}

// =============== Polling helper ===============

export async function pollVideoUntilDone(
  videoId: string,
  opts: { intervalMs?: number; maxAttempts?: number; onTick?: (s: VideoStatus, attempt: number) => void } = {}
): Promise<VideoStatus> {
  const intervalMs = opts.intervalMs ?? 10000;
  const maxAttempts = opts.maxAttempts ?? 60;
  const maxNetworkRetries = 5; // errori di rete consecutivi tollerati

  let networkFailures = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let status: VideoStatus;
    try {
      status = await getVideoStatus(videoId);
      networkFailures = 0; // reset al primo successo
    } catch (err) {
      networkFailures++;
      const msg = (err as Error).message ?? String(err);
      if (networkFailures >= maxNetworkRetries) {
        throw new Error(
          `HeyGen polling ${videoId}: ${maxNetworkRetries} errori di rete consecutivi, ultimo: ${msg}`
        );
      }
      // Errore di rete temporaneo — aspetta e riprova
      console.warn(
        `[heygen] polling ${videoId} errore rete (${networkFailures}/${maxNetworkRetries}): ${msg} — riprovo...`
      );
      await new Promise((r) => setTimeout(r, intervalMs * 2));
      continue;
    }

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
