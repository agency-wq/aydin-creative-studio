// AssemblyAI client — trascrizione con word-level timestamps in italiano.
// API: https://www.assemblyai.com/docs/api-reference/transcripts
// Modello: Universal-2 (italiano nativo, accuratezza top 2026)

const AAI_BASE_URL = "https://api.assemblyai.com/v2";

function getApiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY non impostato");
  return key;
}

function authHeaders(): Record<string, string> {
  return { authorization: getApiKey() };
}

// =============================================================================
// 1. Upload audio (per audio non pubblici)
// =============================================================================

export async function uploadAudio(audioBuffer: Buffer | Uint8Array): Promise<string> {
  const res = await fetch(`${AAI_BASE_URL}/upload`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "application/octet-stream",
    },
    body: audioBuffer as BodyInit,
  });
  if (!res.ok) throw new Error(`AssemblyAI upload ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { upload_url: string };
  return json.upload_url;
}

// =============================================================================
// 2. Submit transcription job
// =============================================================================

export type TranscribeOptions = {
  audioUrl: string; // public URL oppure upload_url da uploadAudio
  languageCode?: string; // default "it"
  punctuate?: boolean;
  formatText?: boolean;
  wordBoost?: string[]; // parole da aiutare il modello a riconoscere
};

export type TranscriptSubmitResponse = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
};

export async function submitTranscript(opts: TranscribeOptions): Promise<TranscriptSubmitResponse> {
  const body = {
    audio_url: opts.audioUrl,
    language_code: opts.languageCode ?? "it",
    punctuate: opts.punctuate ?? true,
    format_text: opts.formatText ?? true,
    // Universal-3 Pro supporta italiano nativamente; fallback a Universal-2
    speech_models: ["universal-3-pro", "universal-2"],
    word_boost: opts.wordBoost,
  };

  const res = await fetch(`${AAI_BASE_URL}/transcript`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AssemblyAI submit ${res.status}: ${await res.text()}`);
  return (await res.json()) as TranscriptSubmitResponse;
}

// =============================================================================
// 3. Poll status / fetch result
// =============================================================================

export type TranscriptWord = {
  text: string;
  start: number; // millisecondi
  end: number; // millisecondi
  confidence: number;
};

export type Transcript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  language_code?: string;
  audio_duration?: number;
  words?: TranscriptWord[];
  error?: string;
};

export async function getTranscript(transcriptId: string): Promise<Transcript> {
  const res = await fetch(`${AAI_BASE_URL}/transcript/${transcriptId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`AssemblyAI get ${res.status}: ${await res.text()}`);
  return (await res.json()) as Transcript;
}

export async function pollTranscriptUntilDone(
  transcriptId: string,
  opts: { intervalMs?: number; maxAttempts?: number; onTick?: (t: Transcript, attempt: number) => void } = {}
): Promise<Transcript> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 100; // 5 min max

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t = await getTranscript(transcriptId);
    opts.onTick?.(t, attempt);
    if (t.status === "completed") return t;
    if (t.status === "error") throw new Error(`AssemblyAI error: ${t.error ?? "unknown"}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`AssemblyAI timeout dopo ${maxAttempts} tentativi`);
}

// =============================================================================
// High-level helper
// =============================================================================

export type TranscriptResult = {
  text: string;
  language: string;
  durationMs?: number;
  words: Array<{ word: string; start: number; end: number; confidence: number }>;
};

/**
 * Trascrive un audio (URL pubblico o Buffer) e ritorna word-level timestamps.
 * Tutti i timestamp sono in millisecondi.
 */
export async function transcribeAudio(input: {
  audioUrl?: string;
  audioBuffer?: Buffer | Uint8Array;
  languageCode?: string;
  onTick?: (t: Transcript, attempt: number) => void;
}): Promise<TranscriptResult> {
  let url = input.audioUrl;
  if (!url && input.audioBuffer) {
    url = await uploadAudio(input.audioBuffer);
  }
  if (!url) throw new Error("transcribeAudio: serve audioUrl o audioBuffer");

  const submitted = await submitTranscript({
    audioUrl: url,
    languageCode: input.languageCode ?? "it",
  });

  const final = await pollTranscriptUntilDone(submitted.id, { onTick: input.onTick });

  return {
    text: final.text ?? "",
    language: final.language_code ?? "it",
    durationMs: final.audio_duration ? final.audio_duration * 1000 : undefined,
    words: (final.words ?? []).map((w) => ({
      word: w.text,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    })),
  };
}
