// Timeline builder — VERSIONE PLAN-DRIVEN.
//
// Non distribuisce piu' i cutaway in slot uniformi: riceve gia' i timestamp
// esatti dal VideoPlan dell'AI Director (lib/ai-director.ts) e si limita a:
//   1. Fondere MG records + broll records ordinati per startMs
//   2. Costruire i segmenti contigui AVATAR / CUTAWAY a copertura piena di [0..durationMs]
//   3. Validare gap minimo / clamp / drop overlap (di solito gia' fatto a monte
//      dal director.clampAndDedupe, ma qui lo rifacciamo come safety net)
//
// Mantiene le costanti di density per coerenza con l'AI Director.

import type { SavedMGRecord } from "./auto-motion-graphics";
import type { SavedBrollRecord } from "./auto-broll";
import type { RenderSpec } from "../remotion/motion-graphics/dynamic/render-spec";

export type WordTs = { word: string; start: number; end: number; confidence?: number };

export type CutawaySource =
  | {
      id: string;
      kind: "broll";
      videoUrl: string;
      durationSec: number;
    }
  | {
      id: string;
      kind: "motion-graphics";
      durationSec: number;
      /** Descrizione creativa libera */
      description: string;
      /** RenderSpec tradotto da mg-translator (CSS/SVG/animazioni) */
      renderSpec?: RenderSpec;
      themeName?: string | null;
    };

export type Segment =
  | { type: "AVATAR"; startMs: number; endMs: number }
  | { type: "CUTAWAY"; startMs: number; endMs: number; clip: CutawaySource };

export type TimelinePlan = {
  totalMs: number;
  segments: Segment[];
  cutawayCount: number;
  avatarCount: number;
};

const MIN_CUTAWAY_MS = 2000;
const MIN_GAP_MS = 1200;
const INTRO_GUARD_MS = 1500;
const OUTRO_GUARD_MS = 800;

// =============================================================================
// PLAN-DRIVEN BUILDER (preferito)
// =============================================================================

export function buildTimelineFromPlan(opts: {
  durationMs: number;
  mgRecords: SavedMGRecord[];
  brollRecords: SavedBrollRecord[];
}): TimelinePlan {
  const { durationMs, mgRecords, brollRecords } = opts;

  // Trasforma in cutaway items con timestamp e clip source
  type Item = { startMs: number; endMs: number; clip: CutawaySource };
  const items: Item[] = [];

  for (const mg of mgRecords) {
    items.push({
      startMs: mg.startMs,
      endMs: mg.endMs,
      clip: {
        id: mg.id,
        kind: "motion-graphics",
        durationSec: Math.max(1, Math.round((mg.endMs - mg.startMs) / 1000)),
        description: mg.description,
        renderSpec: mg.renderSpec,
        themeName: mg.themeName,
      },
    });
  }
  for (const br of brollRecords) {
    items.push({
      startMs: br.startMs,
      endMs: br.endMs,
      clip: {
        id: br.id,
        kind: "broll",
        videoUrl: br.videoUrl,
        durationSec: br.durationSec,
      },
    });
  }

  if (items.length === 0) {
    return {
      totalMs: durationMs,
      segments: [{ type: "AVATAR", startMs: 0, endMs: durationMs }],
      cutawayCount: 0,
      avatarCount: 1,
    };
  }

  // Ordina per startMs e applica safety net (clamp + drop overlap)
  items.sort((a, b) => a.startMs - b.startMs);

  const usableStart = INTRO_GUARD_MS;
  const usableEnd = Math.max(usableStart + MIN_CUTAWAY_MS, durationMs - OUTRO_GUARD_MS);
  const safe: Item[] = [];
  for (const it of items) {
    let s = Math.max(usableStart, it.startMs);
    let e = Math.min(usableEnd, it.endMs);
    if (e - s < MIN_CUTAWAY_MS) e = s + MIN_CUTAWAY_MS;
    if (e > usableEnd) e = usableEnd;
    if (e <= s) continue;

    const last = safe[safe.length - 1];
    if (last && s < last.endMs + MIN_GAP_MS) {
      // troppo vicino al precedente, droppa
      continue;
    }
    safe.push({ startMs: s, endMs: e, clip: it.clip });
  }

  // Costruisci segmenti contigui AVATAR / CUTAWAY
  const segments: Segment[] = [];
  let cursor = 0;
  for (const c of safe) {
    if (c.startMs > cursor) {
      segments.push({ type: "AVATAR", startMs: cursor, endMs: c.startMs });
    }
    segments.push({ type: "CUTAWAY", startMs: c.startMs, endMs: c.endMs, clip: c.clip });
    cursor = c.endMs;
  }
  if (cursor < durationMs) {
    segments.push({ type: "AVATAR", startMs: cursor, endMs: durationMs });
  }

  return {
    totalMs: durationMs,
    segments,
    cutawayCount: safe.length,
    avatarCount: segments.filter((s) => s.type === "AVATAR").length,
  };
}

// =============================================================================
// LEGACY API (mantenuta per compat con script vecchi che ancora la chiamano)
// =============================================================================
// La vecchia `planTimeline` distribuiva i cutaway uniformemente e snappava ai
// confini di parola. Il nuovo flow plan-driven non la usa piu', ma scripts
// esterni potrebbero ancora referenziarla; il body e' un thin wrapper che
// posiziona i clip in slot uniformi (vecchio comportamento) per non rompere.
//
// PREFERISCI `buildTimelineFromPlan` per nuovo codice.

const LEGACY_MIN_CUTAWAY_MS = 2500;
const LEGACY_MAX_CUTAWAY_MS = 4000;
const LEGACY_MIN_GAP_MS = 1500;

function legacySnapToWord(targetMs: number, words: WordTs[]): number {
  if (words.length === 0) return targetMs;
  let best = words[0].start;
  let bestDist = Math.abs(words[0].start - targetMs);
  for (const w of words) {
    const d = Math.abs(w.start - targetMs);
    if (d < bestDist) {
      best = w.start;
      bestDist = d;
    }
  }
  return best;
}

function legacyTargetCount(durationMs: number): number {
  const sec = durationMs / 1000;
  if (sec < 15) return 0;
  if (sec < 30) return 2;
  if (sec < 60) return 4;
  if (sec < 90) return 6;
  if (sec < 120) return 8;
  return Math.floor(sec / 12);
}

export function planTimeline(opts: {
  durationMs: number;
  words: WordTs[];
  motionGraphicsClips: CutawaySource[];
  brollClips: CutawaySource[];
}): TimelinePlan {
  const { durationMs, words, motionGraphicsClips, brollClips } = opts;
  const target = legacyTargetCount(durationMs);
  const usable = Math.min(target, motionGraphicsClips.length + brollClips.length);

  // Alterna MG/broll
  const sources: CutawaySource[] = [];
  let mgIdx = 0;
  let brIdx = 0;
  let preferMg = true;
  while (sources.length < usable) {
    if (preferMg && mgIdx < motionGraphicsClips.length) sources.push(motionGraphicsClips[mgIdx++]);
    else if (brIdx < brollClips.length) sources.push(brollClips[brIdx++]);
    else if (mgIdx < motionGraphicsClips.length) sources.push(motionGraphicsClips[mgIdx++]);
    else break;
    preferMg = !preferMg;
  }

  if (sources.length === 0) {
    return {
      totalMs: durationMs,
      segments: [{ type: "AVATAR", startMs: 0, endMs: durationMs }],
      cutawayCount: 0,
      avatarCount: 1,
    };
  }

  const usableStart = INTRO_GUARD_MS;
  const usableEnd = durationMs - OUTRO_GUARD_MS;
  const usableDur = usableEnd - usableStart;
  if (usableDur <= 0) {
    return {
      totalMs: durationMs,
      segments: [{ type: "AVATAR", startMs: 0, endMs: durationMs }],
      cutawayCount: 0,
      avatarCount: 1,
    };
  }

  const slot = usableDur / sources.length;
  const cutaways: { startMs: number; endMs: number; clip: CutawaySource }[] = [];
  for (let i = 0; i < sources.length; i++) {
    const slotCenter = usableStart + slot * (i + 0.5);
    const clip = sources[i];
    const clipMs = Math.max(
      LEGACY_MIN_CUTAWAY_MS,
      Math.min(LEGACY_MAX_CUTAWAY_MS, Math.floor(clip.durationSec * 1000))
    );
    let startMs = slotCenter - clipMs / 2;
    let endMs = startMs + clipMs;
    startMs = legacySnapToWord(startMs, words);
    endMs = legacySnapToWord(endMs, words);
    if (endMs - startMs < LEGACY_MIN_CUTAWAY_MS) endMs = startMs + LEGACY_MIN_CUTAWAY_MS;
    if (endMs > usableEnd) endMs = usableEnd;
    if (startMs < usableStart) startMs = usableStart;
    cutaways.push({ startMs, endMs, clip });
  }

  // Risolvi overlap shiftando in avanti
  for (let i = 1; i < cutaways.length; i++) {
    const prev = cutaways[i - 1];
    const cur = cutaways[i];
    const minStart = prev.endMs + LEGACY_MIN_GAP_MS;
    if (cur.startMs < minStart) {
      const shift = minStart - cur.startMs;
      cur.startMs += shift;
      cur.endMs += shift;
    }
    if (cur.endMs > usableEnd) {
      cur.endMs = usableEnd;
      if (cur.endMs - cur.startMs < LEGACY_MIN_CUTAWAY_MS) {
        cutaways.splice(i, 1);
        i--;
      }
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const c of cutaways) {
    if (c.startMs > cursor) {
      segments.push({ type: "AVATAR", startMs: cursor, endMs: c.startMs });
    }
    segments.push({ type: "CUTAWAY", startMs: c.startMs, endMs: c.endMs, clip: c.clip });
    cursor = c.endMs;
  }
  if (cursor < durationMs) {
    segments.push({ type: "AVATAR", startMs: cursor, endMs: durationMs });
  }

  return {
    totalMs: durationMs,
    segments,
    cutawayCount: cutaways.length,
    avatarCount: segments.filter((s) => s.type === "AVATAR").length,
  };
}
