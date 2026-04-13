// Wrapper transizioni per i cutaway. Sistema MISTO che alterna:
//   - Soft transitions (CSS opacity/transform/mask, 12 varianti) per entrate/uscite morbide
//   - Hard transitions (presentation-based, 6 varianti) per transizioni cinematiche piu marcate
//
// Il picker deterministico seleziona la transizione in base a `cutawayIndex`.
// Le hard transitions usano i componenti da `presentations.tsx` (stripedSlam,
// zoomPunch, diagonalReveal, colorBurst, verticalShutter, glitchSlam) simulando
// manualmente il ciclo entering/showing/exiting che @remotion/transitions farebbe.
//
// Cosi ogni video ha un mix naturale: soft per i cutaway "informativi" (MG dati)
// e hard per i cutaway "cinematici" (b-roll, quote), con varieta massima.

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import type { TransitionPresentation } from "@remotion/transitions";
import type { MGTheme } from "../themes";
import { pickSoftTransition } from "./soft-transitions";
import {
  stripedSlam,
  zoomPunch,
  diagonalReveal,
  colorBurst,
  verticalShutter,
  glitchSlam,
} from "./presentations";

type CutawayWithTransitionsProps = {
  /** Durata totale del segmento in frame */
  totalFrames: number;
  /** Theme corrente del cutaway */
  theme: MGTheme;
  /** Indice del cutaway nel timeline (per picker deterministico) */
  cutawayIndex: number;
  /** Il contenuto del cutaway (CinematicShot, MotionGraphicsClip, ecc.) */
  children: React.ReactNode;
};

// =============================================================================
// Hard transition definitions — factory wrappers per le 6 presentations
// =============================================================================

type HardTransitionDef = {
  name: string;
  /** Crea il presentation dati i colori del theme */
  create: (theme: MGTheme) => TransitionPresentation<Record<string, never>>;
};

const HARD_TRANSITIONS: HardTransitionDef[] = [
  {
    name: "striped-slam",
    create: (theme) =>
      stripedSlam({ primary: theme.bgColor, accent: theme.accentColor }, 8),
  },
  {
    name: "zoom-punch",
    create: () => zoomPunch(),
  },
  {
    name: "diagonal-reveal",
    create: (theme) =>
      diagonalReveal({ primary: theme.bgColor, accent: theme.accentColor }),
  },
  {
    name: "color-burst",
    create: (theme) =>
      colorBurst({ primary: theme.bgColor, accent: theme.accentColor }),
  },
  {
    name: "vertical-shutter",
    create: (theme) =>
      verticalShutter({ primary: theme.bgColor, accent: theme.accentColor }, 7),
  },
  {
    name: "glitch-slam",
    create: () => glitchSlam(),
  },
];

// =============================================================================
// Transition length for hard transitions
// =============================================================================

const HARD_TRANSITION_FRAMES = 12;

// =============================================================================
// Picker: alterna soft e hard in pattern 2:1 (2 soft, 1 hard, 2 soft, 1 hard...)
// Cosi ogni 3 cutaway c'e' una transizione "forte" che rompe la monotonia.
// =============================================================================

type TransitionChoice =
  | { kind: "soft"; softIndex: number }
  | { kind: "hard"; hardIndex: number };

function pickTransition(cutawayIndex: number): TransitionChoice {
  // Pattern: soft, soft, HARD, soft, soft, HARD, ...
  const cycle = cutawayIndex % 3;
  if (cycle === 2) {
    // Hard transition — cicla le 6 varianti
    const hardSlot = Math.floor(cutawayIndex / 3);
    return { kind: "hard", hardIndex: hardSlot % HARD_TRANSITIONS.length };
  }
  // Soft transition — cicla le 12 varianti
  return { kind: "soft", softIndex: cutawayIndex };
}

// =============================================================================
// Hard transition renderer — simula entering/exiting manualmente
// =============================================================================

const HardTransitionWrapper: React.FC<{
  frame: number;
  totalFrames: number;
  theme: MGTheme;
  hardIndex: number;
  children: React.ReactNode;
}> = ({ frame, totalFrames, theme, hardIndex, children }) => {
  const def = HARD_TRANSITIONS[hardIndex % HARD_TRANSITIONS.length];
  const presentation = def.create(theme);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp = presentation.component as React.ComponentType<any>;

  // Guard: almeno 1 frame per la transizione, e totalFrames deve essere > 2*transLen
  const transLen = Math.max(1, Math.min(HARD_TRANSITION_FRAMES, Math.floor(totalFrames * 0.2)));
  // Se il segmento e' troppo corto per avere entry+exit, mostra tutto senza transizione
  if (totalFrames < transLen * 2 + 1) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // Calcola la fase e il progress
  let presentationProgress: number;
  let presentationDirection: "entering" | "exiting";

  if (frame < transLen) {
    // Fase entering: progress 0 -> 1
    presentationDirection = "entering";
    presentationProgress = interpolate(frame, [0, transLen], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  } else if (frame > totalFrames - transLen) {
    // Fase exiting: progress 0 -> 1
    presentationDirection = "exiting";
    presentationProgress = interpolate(
      frame,
      [totalFrames - transLen, totalFrames],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      }
    );
  } else {
    // Fase showing: fully entered
    presentationDirection = "entering";
    presentationProgress = 1;
  }

  return (
    <Comp
      presentationProgress={presentationProgress}
      presentationDirection={presentationDirection}
      passedProps={{} as Record<string, never>}
    >
      {children}
    </Comp>
  );
};

// =============================================================================
// Main component
// =============================================================================

export const CutawayWithTransitions: React.FC<CutawayWithTransitionsProps> = ({
  totalFrames,
  theme,
  cutawayIndex,
  children,
}) => {
  const frame = useCurrentFrame();
  const choice = pickTransition(cutawayIndex);

  if (choice.kind === "hard") {
    return (
      <HardTransitionWrapper
        frame={frame}
        totalFrames={totalFrames}
        theme={theme}
        hardIndex={choice.hardIndex}
      >
        {children}
      </HardTransitionWrapper>
    );
  }

  // Soft transition
  const transition = pickSoftTransition(choice.softIndex);
  const style = transition.computeStyle(frame, totalFrames);
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
