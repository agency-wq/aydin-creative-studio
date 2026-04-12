// Picker deterministico per le transizioni: dato un index (cutaway position
// nel timeline), ritorna il "kit" {presentation, timing} da usare. Cosi i 4-6
// cutaway in un video usano transizioni diverse senza random.
//
// Le transizioni sono parametrizzate dal theme corrente per ereditare la
// palette del preset (Infographics Show -> rosso/teal, MrBeast -> rosso, ecc.).

import {
  linearTiming,
  springTiming,
  type TransitionPresentation,
  type TransitionTiming,
} from "@remotion/transitions";
import type { MGTheme } from "../themes";
import {
  colorBurst,
  diagonalReveal,
  stripedSlam,
  verticalShutter,
  zoomPunch,
} from "./presentations";

export type TransitionKit = {
  name: string;
  presentation: TransitionPresentation<Record<string, never>>;
  timing: TransitionTiming;
  /**
   * Quanti frame "consuma" questa transizione. La sequence che la circonda
   * deve essere lunga almeno questo numero di frame.
   */
  durationInFrames: number;
};

/**
 * Costruisce il roster di 6 transizioni con i colori del theme.
 * Estrai i colori dal theme: l'accent diventa il "glow", il bgColor (o un dark
 * neutro se il theme e light) diventa la base scura.
 */
function buildRoster(theme: MGTheme): TransitionKit[] {
  // Se il theme e light (bg quasi bianco), uso textColor come "primary"
  // (e tipicamente scuro), altrimenti uso il bgColor scuro.
  const isLightBg = isLightColor(theme.bgColor);
  const primary = isLightBg ? theme.textColor : theme.bgColor;
  const accent = theme.accentColor;
  const colors = { primary, accent };

  // NOTA: durate bumped da ~14 a 22-28 frames per ammorbidire i tagli (era
  // troppo "scattoso" — feedback utente). Rimosso glitch-slam dal roster
  // perche' troppo aggressivo / brutto in playback.
  return [
    {
      name: "striped-slam",
      presentation: stripedSlam(colors, 8),
      timing: linearTiming({ durationInFrames: 26 }),
      durationInFrames: 26,
    },
    {
      name: "zoom-punch",
      presentation: zoomPunch(),
      timing: springTiming({ config: { damping: 200 }, durationInFrames: 24 }),
      durationInFrames: 24,
    },
    {
      name: "diagonal-reveal",
      presentation: diagonalReveal(colors),
      timing: linearTiming({ durationInFrames: 24 }),
      durationInFrames: 24,
    },
    {
      name: "color-burst",
      presentation: colorBurst(colors),
      timing: linearTiming({ durationInFrames: 22 }),
      durationInFrames: 22,
    },
    {
      name: "vertical-shutter",
      presentation: verticalShutter(colors, 7),
      timing: linearTiming({ durationInFrames: 22 }),
      durationInFrames: 22,
    },
  ];
}

/** Picker deterministico ciclico per indice clip. */
export function pickTransition(theme: MGTheme, index: number): TransitionKit {
  const roster = buildRoster(theme);
  return roster[index % roster.length];
}

/** Picker per la transizione "in uscita": offset cosi e diversa dalla in. */
export function pickOutgoingTransition(theme: MGTheme, index: number): TransitionKit {
  const roster = buildRoster(theme);
  return roster[(index + 2) % roster.length];
}

// Helper: detect light bg
function isLightColor(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length !== 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // luminance perceived
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.7;
}
