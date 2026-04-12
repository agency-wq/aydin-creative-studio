// Tipi condivisi tra Remotion e il worker.
// Tutti i campi sono serializzabili (passati come inputProps al renderer).

import type { RenderSpec } from "./motion-graphics/dynamic/render-spec";

export type RemotionWord = {
  word: string;
  start: number; // ms
  end: number; // ms
};

// Un cutaway puo essere:
//   - "broll": un mp4 esterno (Pexels o fal.ai b-roll), si usa clipUrl
//   - "motion-graphics": MG dinamica con RenderSpec (CSS/SVG/animazioni libere)
//     generato dall'AI Director (descrizione creativa) + mg-translator (RenderSpec)
export type RemotionSegment =
  | { type: "AVATAR"; startMs: number; endMs: number }
  | {
      type: "CUTAWAY";
      startMs: number;
      endMs: number;
      clipKind: "broll";
      clipUrl: string;
    }
  | {
      type: "CUTAWAY";
      startMs: number;
      endMs: number;
      clipKind: "motion-graphics";
      /** Descrizione creativa libera dall'AI Director */
      description: string;
      /** RenderSpec tradotto da mg-translator — CSS/SVG/animazioni complete */
      renderSpec?: RenderSpec;
      themeName?: string | null;
    };

/**
 * Traccia musicale di background (ElevenLabs Music).
 * Volume costante per tutto il video (niente ducking automatico, suonava male
 * con transizioni rapide). `duckingVolume` e' il volume fisso usato (~0.15-0.20).
 * `fullVolume` mantenuto per compat ma ignorato dal renderer.
 */
export type MusicTrack = {
  url: string;
  /** Volume costante della musica (0-1). Usato come livello uniforme. */
  duckingVolume: number;
  /** Non usato dal renderer (era per auto-ducking, rimosso). Mantenuto per compat. */
  fullVolume: number;
};

export type MainVideoProps = {
  avatarVideoUrl: string;
  durationMs: number;
  segments: RemotionSegment[];
  words: RemotionWord[];
  /**
   * Nome del componente captions da renderizzare. Corrisponde al campo
   * `CaptionsPreset.remotionComponent` salvato nel DB (es. "Karaoke",
   * "TikTokBold", "WordStack", ...). I preset non ancora implementati
   * fanno fallback a Karaoke (il dispatcher logga un warning).
   */
  captionPreset: string;
  /**
   * Musica di background opzionale (AI-planned + ElevenLabs-composed).
   * Se null/undefined, il video gira senza musica (solo audio avatar).
   */
  music?: MusicTrack | null;
  width: number;
  height: number;
  fps: number;
};
