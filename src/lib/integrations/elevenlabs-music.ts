// ElevenLabs Music API client.
// Genera una traccia musicale strumentale da un prompt testuale.
// Docs: https://elevenlabs.io/docs/api-reference/music/compose
//
// API shape (verificata 2026-04):
//   POST https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128
//   Header: xi-api-key: <ELEVENLABS_API_KEY>
//   Body JSON: { prompt, music_length_ms, force_instrumental: true, model_id }
//   Response: binary mp3 stream (NON JSON)
//
// NOTA: il piano ElevenLabs deve avere Music abilitato. Se non lo e', l'API
// risponde 403. In tal caso il worker continua senza musica (graceful).

import fs from "node:fs";
import path from "node:path";

const ELEVENLABS_MUSIC_URL = "https://api.elevenlabs.io/v1/music";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY non impostato");
  return key;
}

export type MusicComposeInput = {
  /** Prompt in INGLESE (ElevenLabs funziona meglio con l'inglese per la musica) */
  prompt: string;
  /** Durata in ms (3000-600000). Per un video di 60s passa 60000 */
  durationMs: number;
  /** Forza strumentale (default true: evitiamo vocals sotto all'avatar) */
  forceInstrumental?: boolean;
  /** Model id (default: music_v1) */
  modelId?: string;
};

export type MusicComposeResult = {
  /** Path locale del file mp3 scritto */
  filePath: string;
  /** Dimensione file in byte */
  bytes: number;
  /** Durata richiesta in ms (= input) */
  durationMs: number;
  /** Prompt usato */
  prompt: string;
};

/**
 * Compone una traccia musicale e la scrive in `outPath` (che deve essere il path
 * assoluto di un file .mp3 — la directory parent deve gia' esistere).
 *
 * In caso di errore API (403/500/ecc) rilancia Error con messaggio contenente
 * lo status code, cosi il worker puo' decidere se continuare senza musica o
 * failare l'intero render.
 */
export async function composeMusic(
  input: MusicComposeInput,
  outPath: string
): Promise<MusicComposeResult> {
  // Clamp durata nei bounds API (3s-600s)
  const durationMs = Math.max(3000, Math.min(600000, Math.round(input.durationMs)));
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("composeMusic: prompt vuoto");

  // Assicurati che la dir di output esista
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const url = `${ELEVENLABS_MUSIC_URL}?output_format=mp3_44100_128`;
  const body = {
    prompt,
    music_length_ms: durationMs,
    force_instrumental: input.forceInstrumental ?? true,
    model_id: input.modelId ?? "music_v1",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs music ${res.status}: ${text.slice(0, 200)}`);
  }

  // Stream binary body to disk
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);

  return {
    filePath: outPath,
    bytes: buf.length,
    durationMs,
    prompt,
  };
}
