// =============================================================================
// AI Director — Direttore Creativo che pianifica TUTTO il video.
// =============================================================================
//
// SISTEMA SENZA TEMPLATE: Claude Sonnet scrive descrizioni creative LIBERE
// per ogni motion graphic. Nessun menu di template, nessun vincolo compositivo.
// Claude è un vero Creative Director con libertà totale.
//
// La traduzione da descrizione a rendering spec (CSS/SVG/animazioni) avviene
// in un secondo step separato (mg-translator.ts).
//
// Input al direttore:
//   - Script italiano completo
//   - Word-level timestamps (AssemblyAI)
//   - Durata totale ms
//   - Theme/preset visivo selezionato
//
// Output (VideoPlan):
//   - Lista di motion graphics con DESCRIZIONI CREATIVE LIBERE + timestamp
//   - Lista di b-roll Pexels (queries INGLESI con fallback)
//   - Musica (mood + prompt ElevenLabs)
//   - Strategia overall

import Anthropic from "@anthropic-ai/sdk";
// Il filtro etnico per b-roll avviene post-ricerca nel auto-broll.ts
// via isPexelsVideoExcluded(), non piu come constraint nelle query.

// =============================================================================
// Public types
// =============================================================================

export type WordTs = { word: string; start: number; end: number; confidence?: number };

export type KeyMomentKind =
  | "stat"
  | "list"
  | "quote"
  | "concept"
  | "object"
  | "action"
  | "people";

export type KeyMoment = {
  startMs: number;
  endMs: number;
  kind: KeyMomentKind;
  text: string;
  importance: "high" | "med" | "low";
};

export type PlannedMG = {
  startMs: number;
  endMs: number;
  /** Descrizione creativa LIBERA di cosa deve apparire sullo schermo */
  description: string;
  themeName: string;
  reason: string;
};

export type PlannedBroll = {
  startMs: number;
  endMs: number;
  query: string;
  fallbackQueries: string[];
  reason: string;
};

export type PlannedMusic = {
  mood: string;
  prompt: string;
  duckingVolume: number;
  fullVolume: number;
  reason: string;
};

export type VideoPlan = {
  source: "claude" | "fallback-static";
  durationMs: number;
  themeName: string;
  keyMoments: KeyMoment[];
  motionGraphics: PlannedMG[];
  broll: PlannedBroll[];
  music: PlannedMusic;
  strategy: string;
};

export type DirectorInput = {
  script: string;
  words: WordTs[];
  durationMs: number;
  themeName: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  maxCutaways?: number;
  /** URL mockup prodotto (path relativo a public/, es. "generated/mockups/xxx/img.jpg") */
  mockupUrl?: string;
  /** Nome del prodotto estratto dal mockup */
  productName?: string;
};

// =============================================================================
// Density / spacing config
// =============================================================================

export function targetCutawaysForDuration(durationMs: number): number {
  const sec = durationMs / 1000;
  if (sec < 10) return 0;
  if (sec < 18) return 3;
  return Math.min(25, Math.floor(sec / 3.5));
}

const MIN_CUTAWAY_MS = 2500;
const MAX_CUTAWAY_MS = 4500;
const MIN_GAP_MS = 600;
const INTRO_GUARD_MS = 1200;
const OUTRO_GUARD_MS = 600;

// =============================================================================
// Anthropic client (singleton)
// =============================================================================

let _client: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// =============================================================================
// Prompt builders — SISTEMA SENZA TEMPLATE
// =============================================================================

function buildSystemPrompt(): string {
  return [
    "Sei il CREATIVE DIRECTOR di un'agenzia italiana che produce short-form video verticali (9:16, ~60s) con avatar HeyGen + motion graphics Remotion.",
    "",
    "## IL TUO RUOLO",
    "",
    "Sei un MOTION DESIGNER con la libertà creativa di After Effects. Per ogni momento saliente del video, scrivi una DESCRIZIONE DETTAGLIATA di cosa deve apparire sullo schermo.",
    "",
    "NON hai template. NON hai menu. Ogni motion graphic è un progetto unico, pensato solo per QUEL momento di QUEL video. Descrivi esattamente cosa vuoi vedere: elementi visivi, layout, colori, effetti, animazioni, tipografia, mood.",
    "",
    "## COME DESCRIVERE UNA MOTION GRAPHIC",
    "",
    "Pensa come un art director che dà istruzioni a un motion designer. Sii SPECIFICO e CREATIVO:",
    "",
    "BUONO: 'Grande numero 47% al centro con effetto neon glow pulsante. Il numero appare con un punch-in deciso, scuotendosi leggermente prima di stabilizzarsi. Sotto, la scritta DELLE AZIENDE ITALIANE in maiuscolo, font body, colore testo con opacità 70%, che scivola dal basso con un fade ritardato di mezzo secondo. Tra numero e testo, una linea sottile color accent che si espande dal centro verso i lati.'",
    "",
    "CATTIVO: 'Mostra il numero 47%' (troppo vago)",
    "CATTIVO: 'BigNumber con value 47 e suffix %' (questo è un template, non una descrizione creativa)",
    "",
    "## EFFETTI E TECNICHE CHE PUOI DESCRIVERE",
    "",
    "Hai accesso COMPLETO a CSS e SVG. Puoi descrivere:",
    "- 3D transforms (prospettiva, rotazioni, profondità)",
    "- Effetti neon glow, text-shadow multipli",
    "- Glassmorphism (vetro smerigliato con blur di sfondo)",
    "- Gradienti animati (lineari, radiali, conici)",
    "- Clip-path reveal / wipe (rivela progressiva con forme geometriche)",
    "- SVG: grafici, forme complesse, path animati, stroke-drawing",
    "- Particelle, orbs fluttuanti, elementi decorativi",
    "- Split screen, layout asimmetrici, griglie creative",
    "- Blur, saturazione, filtri cinematici",
    "- Spring physics (rimbalzo, overshoot, elasticità)",
    "- Qualsiasi layout tu possa immaginare",
    "",
    "## VARIETÀ CREATIVA",
    "",
    "Ogni MG nel video DEVE essere visivamente DIVERSA dalle altre:",
    "- Mai lo stesso layout due volte",
    "- Alterna: numeri giganti, split screen, grafici, citazioni, griglie, elementi SVG",
    "- Varia le animazioni: spring pop, slide, clip-path reveal, blur-in, scale-rotate",
    "- Varia i mood: dramatico, minimale, energetico, elegante, audace",
    "- SINTETIZZA il testo. Le MG sono POSTER ANIMATI, non sottotitoli. Max 6-8 parole per MG.",
    "",
    "## REGOLE DI TIMING E DENSITÀ",
    "",
    "1) Timing: cutaway 2.5-4.5 secondi, gap minimo 0.6s, no cutaway nei primi 1.2s / ultimi 0.6s.",
    "2) Densità: ~1 cutaway ogni 3.5 secondi. DEVI raggiungere il target.",
    "3) MIX MG + BROLL OBBLIGATORIO: almeno 60% MG, ma SEMPRE almeno 20% b-roll real footage.",
    "4) Numeri/percentuali/prezzi → SEMPRE MG. Mai b-roll per numeri.",
    "5) Oggetti CONCRETI nel mondo reale → b-roll Pexels.",
    "",
    "## MOCKUP PRODOTTO",
    "",
    "Se è disponibile un mockup del prodotto (copertina guida, lead magnet, ecc.):",
    "- Quando lo script MENZIONA il prodotto per nome, DESCRIVI una MG che include il mockup",
    "- Nella description scrivi: 'MOCKUP: immagine del prodotto in prospettiva 3D con ombra, ruotata leggermente, che entra con spring pop' (o qualsiasi animazione creativa)",
    "- Puoi combinare il mockup con testo, badge, CTA — sii creativo",
    "- Il mockup è un'IMMAGINE, non testo. Descrivila come elemento visivo.",
    "- NON inserire il mockup in OGNI MG, solo quando lo script parla del prodotto",
    "",
    "## REGOLE B-ROLL",
    "",
    "6) B-roll CON persone: la query DEVE includere 'italian' come keyword. Esempio: 'italian woman morning routine bathroom', 'italian man cooking kitchen'. MAI usare 'african', 'asian', 'indian', 'arab', 'black', 'chinese'. Se possibile EVITA b-roll con persone e preferisci oggetti, paesaggi, ambienti, close-up mani/dettagli.",
    "7) Query Pexels: INGLESE, specifiche, 4-7 parole. NESSUN tag extra, solo le keyword di ricerca.",
    "8) Fallback: 2-3 query più generiche. Se la prima include persone e le fallback possono essere senza persone, preferisci fallback senza persone.",
    "",
    "## MUSICA",
    "",
    "9) Mood + prompt INGLESE 4-8 parole strumentale. duckingVolume 0.15-0.25, fullVolume 0.5-0.7.",
    "",
    "## OUTPUT",
    "",
    "10) SOLO JSON valido, NESSUN preambolo, NESSUN markdown, NESSUN backtick.",
  ].join("\n");
}

function buildUserPrompt(input: DirectorInput, target: number): string {
  const wordsCompact = input.words
    .slice(0, 600)
    .map((w) => `${w.word}@${Math.round(w.start)}-${Math.round(w.end)}`)
    .join(" ");

  // Mockup info (se disponibile)
  const mockupLines: string[] = [];
  if (input.mockupUrl) {
    mockupLines.push(
      "",
      "MOCKUP PRODOTTO DISPONIBILE:",
      `  URL immagine: ${input.mockupUrl}`,
      input.productName ? `  Nome prodotto: "${input.productName}"` : "",
      "  → Quando lo script menziona questo prodotto, includi il mockup in una MG creativa!",
      "",
    );
  }

  return [
    `Tema visivo: "${input.themeName}"`,
    `Aspect ratio: ${input.aspectRatio}`,
    `Durata totale: ${input.durationMs} ms (${(input.durationMs / 1000).toFixed(1)}s)`,
    `Numero target di cutaway totali (MG + broll): ${target}`,
    "",
    ...mockupLines,
    "Script italiano del video:",
    `"""\n${input.script}\n"""`,
    "",
    "Word-level timestamps (formato: parola@startMs-endMs):",
    wordsCompact,
    "",
    "Ritorna ESATTAMENTE questo JSON (nessun altro testo):",
    "{",
    '  "strategy": "spiegazione one-liner della strategia overall (max 30 parole)",',
    '  "keyMoments": [',
    '    { "startMs": 4200, "endMs": 6800, "kind": "stat|list|quote|concept|object|action|people", "text": "estratto dallo script", "importance": "high|med|low" }',
    "  ],",
    '  "motionGraphics": [',
    '    {',
    '      "startMs": 4200,',
    '      "endMs": 6800,',
    '      "description": "Grande numero 47% al centro con effetto neon glow pulsante color accent. Il numero appare con spring pop deciso. Sotto, DELLE AZIENDE in maiuscolo, font body, colore testo opacità 70%, slide-up ritardato. Tra i due, linea accent che si espande dal centro.",',
    '      "reason": "dato numerico d\'impatto, serve visual shock"',
    "    }",
    "  ],",
    '  "broll": [',
    '    { "startMs": 9100, "endMs": 12500, "query": "european businessman modern office laptop", "fallbackQueries": ["modern office workspace close up", "laptop screen hands typing"], "reason": "contesto lavorativo" }',
    "  ],",
    '  "music": {',
    '    "mood": "cinematic-uplifting",',
    '    "prompt": "uplifting corporate motivational instrumental piano strings",',
    '    "duckingVolume": 0.2,',
    '    "fullVolume": 0.6,',
    '    "reason": "tono motivazionale"',
    "  }",
    "}",
    "",
    "VINCOLI HARD:",
    `- motionGraphics + broll combinati = ESATTAMENTE ${target} elementi.`,
    `- MIX: almeno ${Math.max(2, Math.ceil(target * 0.2))} broll, almeno ${Math.ceil(target * 0.55)} MG. MAI 0 broll.`,
    `- ogni cutaway: durata ${MIN_CUTAWAY_MS}-${MAX_CUTAWAY_MS} ms`,
    `- gap minimo tra cutaway: ${MIN_GAP_MS} ms`,
    `- nessun cutaway nei primi ${INTRO_GUARD_MS} ms / ultimi ${OUTRO_GUARD_MS} ms`,
    "- timestamp allineato ai confini di parola",
    "- per b-roll persone: query DEVE contenere 'italian'. Meglio evitare persone se possibile.",
    "- music.prompt OBBLIGATORIO, INGLESE, 4-8 parole, strumentale",
    "- music.duckingVolume [0.10, 0.30], music.fullVolume [0.40, 0.80]",
    "- OGNI description MG deve essere DETTAGLIATA (almeno 30 parole): layout, colori, effetti, animazioni, tipografia",
    "- OGNI description MG deve essere DIVERSA dalle altre — mai lo stesso layout due volte",
  ].join("\n");
}

// =============================================================================
// Claude call — sistema senza template
// =============================================================================

async function planWithClaude(input: DirectorInput): Promise<VideoPlan> {
  const client = getAnthropic();
  if (!client) throw new Error("ANTHROPIC_API_KEY non impostato");

  const target = input.maxCutaways ?? targetCutawaysForDuration(input.durationMs);

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(input, target) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude director: nessun JSON trovato: ${text.slice(0, 200)}`);

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`Claude director: JSON parse fallito: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== "object") throw new Error("Claude director: output non è un oggetto");

  const r = raw as {
    strategy?: unknown;
    keyMoments?: unknown;
    motionGraphics?: unknown;
    broll?: unknown;
    music?: unknown;
  };

  // Parse keyMoments
  const keyMoments: KeyMoment[] = Array.isArray(r.keyMoments)
    ? (r.keyMoments as unknown[]).flatMap((km) => {
        if (!km || typeof km !== "object") return [];
        const m = km as Record<string, unknown>;
        const startMs = typeof m.startMs === "number" ? m.startMs : Number(m.startMs);
        const endMs = typeof m.endMs === "number" ? m.endMs : Number(m.endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
        return [{
          startMs, endMs,
          kind: String(m.kind ?? "concept") as KeyMomentKind,
          text: String(m.text ?? "").slice(0, 200),
          importance: (m.importance === "high" || m.importance === "low" ? m.importance : "med") as "high" | "med" | "low",
        }];
      })
    : [];

  // Parse motionGraphics — ORA con description libera, NIENTE templateName
  const motionGraphics: PlannedMG[] = Array.isArray(r.motionGraphics)
    ? (r.motionGraphics as unknown[]).flatMap((mg) => {
        if (!mg || typeof mg !== "object") return [];
        const m = mg as Record<string, unknown>;
        const startMs = typeof m.startMs === "number" ? m.startMs : Number(m.startMs);
        const endMs = typeof m.endMs === "number" ? m.endMs : Number(m.endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
        const description = String(m.description ?? "").trim();
        if (description.length < 10) return []; // skip descrizioni troppo brevi
        return [{
          startMs,
          endMs,
          description,
          themeName: input.themeName,
          reason: String(m.reason ?? "").slice(0, 200),
        }];
      })
    : [];

  // Parse broll
  const broll: PlannedBroll[] = Array.isArray(r.broll)
    ? (r.broll as unknown[]).flatMap((b) => {
        if (!b || typeof b !== "object") return [];
        const m = b as Record<string, unknown>;
        const startMs = typeof m.startMs === "number" ? m.startMs : Number(m.startMs);
        const endMs = typeof m.endMs === "number" ? m.endMs : Number(m.endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
        const query = String(m.query ?? "").trim();
        if (!query) return [];
        const fallbacks: string[] = Array.isArray(m.fallbackQueries)
          ? (m.fallbackQueries as unknown[]).map((q) => String(q).trim()).filter(Boolean).slice(0, 4)
          : [];
        return [{
          startMs, endMs,
          query,
          fallbackQueries: fallbacks,
          reason: String(m.reason ?? "").slice(0, 200),
        }];
      })
    : [];

  // Clamp + merge dedup
  const mgClamped = clampOnly(motionGraphics, input.durationMs, input.words);
  const brClamped = clampOnly(broll, input.durationMs, input.words);
  const { mg: mgFinal, br: brFinal } = mergeDedupe(mgClamped, brClamped);

  const music = parseMusic(r.music);

  return {
    source: "claude",
    durationMs: input.durationMs,
    themeName: input.themeName,
    keyMoments,
    motionGraphics: mgFinal,
    broll: brFinal,
    music,
    strategy: String(r.strategy ?? "").slice(0, 300),
  };
}

// =============================================================================
// Music parser
// =============================================================================

function parseMusic(raw: unknown): PlannedMusic {
  const fallback: PlannedMusic = {
    mood: "cinematic-uplifting",
    prompt: "cinematic uplifting corporate instrumental with piano and strings",
    duckingVolume: 0.2,
    fullVolume: 0.6,
    reason: "default",
  };

  if (!raw || typeof raw !== "object") return fallback;
  const m = raw as Record<string, unknown>;
  const prompt = String(m.prompt ?? "").trim();
  if (!prompt) return fallback;

  const clamp01 = (v: unknown, lo: number, hi: number, def: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
  };

  return {
    mood: String(m.mood ?? "cinematic").slice(0, 60),
    prompt: prompt.slice(0, 300),
    duckingVolume: clamp01(m.duckingVolume, 0.05, 0.5, 0.2),
    fullVolume: clamp01(m.fullVolume, 0.3, 1.0, 0.6),
    reason: String(m.reason ?? "").slice(0, 200),
  };
}

// =============================================================================
// Validation / sanitization
// =============================================================================

function clampOnly<T extends { startMs: number; endMs: number }>(
  items: T[],
  durationMs: number,
  words: WordTs[]
): T[] {
  const usableStart = INTRO_GUARD_MS;
  const usableEnd = Math.max(usableStart + MIN_CUTAWAY_MS, durationMs - OUTRO_GUARD_MS);

  const snap = (ms: number): number => {
    if (words.length === 0) return ms;
    let best = words[0].start;
    let bestDist = Math.abs(words[0].start - ms);
    for (const w of words) {
      for (const c of [w.start, w.end]) {
        const d = Math.abs(c - ms);
        if (d < bestDist) { best = c; bestDist = d; }
      }
    }
    return best;
  };

  const cleaned: T[] = [];
  for (const it of items) {
    let s = Math.max(usableStart, Math.min(usableEnd - MIN_CUTAWAY_MS, it.startMs));
    let e = Math.max(s + MIN_CUTAWAY_MS, Math.min(usableEnd, it.endMs));
    if (e - s > MAX_CUTAWAY_MS) e = s + MAX_CUTAWAY_MS;
    s = snap(s);
    e = snap(e);
    if (e - s < MIN_CUTAWAY_MS) e = s + MIN_CUTAWAY_MS;
    if (e > usableEnd) { e = usableEnd; s = Math.max(usableStart, e - MIN_CUTAWAY_MS); }
    if (e <= s) continue;
    cleaned.push({ ...it, startMs: s, endMs: e });
  }
  return cleaned;
}

function clampAndDedupe<T extends { startMs: number; endMs: number }>(
  items: T[],
  durationMs: number,
  words: WordTs[]
): T[] {
  const cleaned = clampOnly(items, durationMs, words);
  cleaned.sort((a, b) => a.startMs - b.startMs);
  const out: T[] = [];
  for (const it of cleaned) {
    const last = out[out.length - 1];
    if (last && it.startMs < last.endMs + MIN_GAP_MS) continue;
    out.push(it);
  }
  return out;
}

function mergeDedupe(
  mg: PlannedMG[],
  br: PlannedBroll[]
): { mg: PlannedMG[]; br: PlannedBroll[] } {
  type Tagged =
    | { kind: "mg"; item: PlannedMG; startMs: number; endMs: number; priority: 0 }
    | { kind: "br"; item: PlannedBroll; startMs: number; endMs: number; priority: 1 };

  const combined: Tagged[] = [
    ...mg.map((m) => ({ kind: "mg" as const, item: m, startMs: m.startMs, endMs: m.endMs, priority: 0 as const })),
    ...br.map((b) => ({ kind: "br" as const, item: b, startMs: b.startMs, endMs: b.endMs, priority: 1 as const })),
  ];

  combined.sort((a, b) => a.startMs !== b.startMs ? a.startMs - b.startMs : a.priority - b.priority);

  const kept: Tagged[] = [];
  for (const it of combined) {
    const last = kept[kept.length - 1];
    if (last && it.startMs < last.endMs + MIN_GAP_MS) continue;
    kept.push(it);
  }

  const mgOut: PlannedMG[] = [];
  const brOut: PlannedBroll[] = [];
  for (const k of kept) {
    if (k.kind === "mg") mgOut.push(k.item);
    else brOut.push(k.item);
  }
  return { mg: mgOut, br: brOut };
}

// =============================================================================
// Static fallback
// =============================================================================

function staticFallback(input: DirectorInput): VideoPlan {
  const target = input.maxCutaways ?? targetCutawaysForDuration(input.durationMs);
  const defaultMusic: PlannedMusic = {
    mood: "cinematic-uplifting",
    prompt: "cinematic uplifting corporate instrumental with piano and strings",
    duckingVolume: 0.2,
    fullVolume: 0.6,
    reason: "fallback statico",
  };
  if (target === 0) {
    return {
      source: "fallback-static", durationMs: input.durationMs, themeName: input.themeName,
      keyMoments: [], motionGraphics: [], broll: [], music: defaultMusic,
      strategy: "fallback statico, video troppo corto",
    };
  }

  const usableStart = INTRO_GUARD_MS;
  const usableEnd = input.durationMs - OUTRO_GUARD_MS;
  const slot = (usableEnd - usableStart) / target;

  const sentences = input.script.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);

  // Descrizioni creative predefinite per il fallback
  const fallbackDescriptions = [
    "Testo grande al centro con il titolo della sezione, font display bold enorme, colore accent. Appare con spring pop dal basso. Sotto, una linea sottile color support che si espande dal centro.",
    "Numero grande con effetto count-up al centro, colore accent, glow neon sottile. Sotto una label in maiuscolo font body, colore testo opacità 80%, fade-in ritardato.",
    "Citazione tra virgolette grandi color accent. Testo centrato, font body, colore testo. Le virgolette appaiono prima con spring pop, poi il testo scivola dal basso.",
    "Tre punti chiave in colonna, ognuno con un cerchio accent + testo a destra. Appaiono uno dopo l'altro con slide-right staggerato. Sfondo con gradient sottile da bg a bgSecondary.",
    "Split screen orizzontale: lato sinistro con PRIMA in desaturato, lato destro con DOPO in colori vivaci. La linea di divisione si muove da sinistra a destra come un wipe reveal.",
    "Card glassmorphism al centro con backdrop-blur. Dentro: emoji grande, valore numerico, label sotto. Appare con scale-in e leggero rotateY 3D.",
    "Due barre orizzontali che crescono da sinistra, con label e percentuale. La barra superiore è color accent, l'inferiore color support. Entrano con stagger di 0.3s.",
    "Griglia 2x2 di metriche: ogni cella con icona emoji, valore numerico, micro-label. Appaiono con spring pop staggerato in diagonale (top-left, top-right, bottom-left, bottom-right).",
  ];

  const motionGraphics: PlannedMG[] = [];
  const broll: PlannedBroll[] = [];

  for (let i = 0; i < target; i++) {
    const center = usableStart + slot * (i + 0.5);
    const startMs = Math.round(center - 1500);
    const endMs = Math.round(center + 1500);
    const sentence = sentences[i % sentences.length] ?? input.script.slice(0, 80);

    if (i % 2 === 0) {
      // MG con descrizione dal fallback + testo dallo script
      const baseDesc = fallbackDescriptions[Math.floor(i / 2) % fallbackDescriptions.length];
      motionGraphics.push({
        startMs, endMs,
        description: `${baseDesc} Contenuto testuale: "${sentence.split(/\s+/).slice(0, 8).join(" ")}"`,
        themeName: input.themeName,
        reason: "fallback statico",
      });
    } else {
      broll.push({
        startMs, endMs,
        query: "modern european business workspace",
        fallbackQueries: [
          "italian city street daily life",
          "aerial drone landscape europe",
        ],
        reason: "fallback statico",
      });
    }
  }

  return {
    source: "fallback-static",
    durationMs: input.durationMs,
    themeName: input.themeName,
    keyMoments: [],
    motionGraphics: clampAndDedupe(motionGraphics, input.durationMs, input.words),
    broll: clampAndDedupe(broll, input.durationMs, input.words),
    music: defaultMusic,
    strategy: "fallback statico (Claude non disponibile)",
  };
}

// =============================================================================
// Public entry
// =============================================================================

export async function planVideoFromScript(
  input: DirectorInput,
  opts: { log?: (msg: string) => void } = {}
): Promise<VideoPlan> {
  const log = opts.log ?? (() => {});

  if (!process.env.ANTHROPIC_API_KEY) {
    log("ai-director: ANTHROPIC_API_KEY mancante, uso fallback statico");
    return staticFallback(input);
  }

  try {
    const plan = await planWithClaude(input);
    log(
      `ai-director: Claude ha pianificato ${plan.motionGraphics.length} MG + ${plan.broll.length} broll · strategia="${plan.strategy.slice(0, 80)}"`
    );
    return plan;
  } catch (e) {
    log(`ai-director: Claude fallita (${(e as Error).message}), fallback statico`);
    return staticFallback(input);
  }
}
