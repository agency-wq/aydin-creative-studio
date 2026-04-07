// ElevenLabs API client
// Documentazione: https://elevenlabs.io/docs

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY non impostato");
  return key;
}

// =============== Voices ===============

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category: "premade" | "professional" | "cloned" | "generated";
  labels?: {
    gender?: string;
    age?: string;
    accent?: string;
    language?: string;
    use_case?: string;
    descriptive?: string;
  };
  description?: string;
  preview_url?: string;
  verified_languages?: Array<{
    language: string;
    model_id: string;
    accent?: string;
    locale?: string;
    preview_url?: string;
  }>;
};

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
    headers: { "xi-api-key": getApiKey() },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { voices: ElevenLabsVoice[] };
  return json.voices;
}

export async function listItalianVoices(): Promise<ElevenLabsVoice[]> {
  const all = await listVoices();
  return all.filter((v) =>
    (v.verified_languages ?? []).some(
      (vl) => (vl.language ?? "").toLowerCase() === "it"
    )
  );
}

// =============== Subscription / quota ===============

export type ElevenLabsSubscription = {
  tier: string;
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix: number;
  voice_slots_used: number;
  voice_limit: number;
};

export async function getSubscription(): Promise<ElevenLabsSubscription> {
  const res = await fetch(`${ELEVENLABS_BASE_URL}/user/subscription`, {
    headers: { "xi-api-key": getApiKey() },
  });
  if (!res.ok) throw new Error(`ElevenLabs sub ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ElevenLabsSubscription>;
}

// =============== TTS ===============

export type TTSOptions = {
  voiceId: string;
  text: string;
  modelId?: string; // default eleven_multilingual_v2
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  outputFormat?: string; // mp3_44100_128 | mp3_44100_192 | pcm_44100 | etc
};

export async function textToSpeech(opts: TTSOptions): Promise<Buffer> {
  const outputFormat = opts.outputFormat ?? "mp3_44100_128";
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${opts.voiceId}?output_format=${outputFormat}`;

  const body = {
    text: opts.text,
    model_id: opts.modelId ?? "eleven_multilingual_v2",
    voice_settings: opts.voiceSettings ?? {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
