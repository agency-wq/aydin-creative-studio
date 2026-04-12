// Libreria di SOFT transitions per i cutaway.
// Filosofia: tutte morbide (~14 frame fade), nessun slam/glitch/hard cut.
// Ogni variante differisce per come il contenuto si "presenta": opacity-only,
// slide-up/down/left/right, scale-in, zoom-out, blur-fade, ecc.
//
// Una transizione e' definita da una funzione che, dato (frame, totalFrames),
// ritorna un React.CSSProperties da applicare all'<AbsoluteFill> wrapper.
// Cosi e' cheap da computare, deterministica frame-by-frame, e non richiede
// componenti dedicati.
//
// Picker deterministico: cutawayIndex -> variante, cosi a parita' di video gli
// stessi cutaway hanno sempre la stessa transizione (riproducibile).

import { interpolate, Easing } from "remotion";
import type { CSSProperties } from "react";

// Quanti frame dura il fade-in / fade-out su entrambi i bordi.
// 10 frame @ 30fps = ~0.33s. Ridotto da 14 per evitare che clip corte
// abbiano il fade troncato (il fade mangiava troppo tempo).
export const SOFT_FADE_FRAMES = 10;

export type SoftTransition = {
  /** Nome univoco (debug/log) */
  name: string;
  /** Descrizione one-liner */
  description: string;
  /** Computa lo style del wrapper dato (frame corrente, durata totale clip) */
  computeStyle: (frame: number, totalFrames: number) => CSSProperties;
};

// =============================================================================
// Helpers di curve
// =============================================================================

/**
 * Curva 0 -> 1 -> 0 con easing cubic, dove la salita avviene nei primi
 * fadeLen frame e la discesa negli ultimi fadeLen frame.
 * fadeLen è proporzionale: max SOFT_FADE_FRAMES ma mai più del 15% della clip.
 * Questo evita che clip corte abbiano il fade troncato.
 */
function envelope(frame: number, totalFrames: number): number {
  const fadeLen = Math.min(SOFT_FADE_FRAMES, Math.floor(totalFrames * 0.15));
  const fadeIn = interpolate(frame, [0, fadeLen], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, totalFrames - fadeLen), totalFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    }
  );
  return Math.min(fadeIn, fadeOut);
}

/**
 * Una curva 0 -> 1 nei primi SOFT_FADE_FRAMES (entrata) che resta a 1, poi
 * 1 -> 0 negli ultimi SOFT_FADE_FRAMES (uscita). Distinta dalla envelope perche'
 * questa lavora a "zone" (entry vs exit) ed e' usata per le offset di
 * traslazione/scale che sono asimmetriche tra in e out.
 */
function entryProgress(frame: number, totalFrames?: number): number {
  const fadeLen = totalFrames != null
    ? Math.min(SOFT_FADE_FRAMES, Math.floor(totalFrames * 0.15))
    : SOFT_FADE_FRAMES;
  return interpolate(frame, [0, fadeLen], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
}

function exitProgress(frame: number, totalFrames: number): number {
  const fadeLen = Math.min(SOFT_FADE_FRAMES, Math.floor(totalFrames * 0.15));
  return interpolate(
    frame,
    [Math.max(0, totalFrames - fadeLen), totalFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    }
  );
}

/**
 * Sottile zoom respiro 1.0 -> 1.015 -> 1.0 lungo tutta la clip, da combinare
 * con le altre transizioni per dare vita al cutaway.
 */
function breathScale(frame: number, totalFrames: number): number {
  return interpolate(
    frame,
    [0, totalFrames / 2, totalFrames],
    [1.0, 1.015, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    }
  );
}

// =============================================================================
// Varianti
// =============================================================================

/**
 * 1. Crossfade puro: opacity 0 -> 1 -> 0 + breath. La piu' neutra.
 */
const crossfade: SoftTransition = {
  name: "crossfade",
  description: "Opacity-only fade in/out con breath zoom 1.5%",
  computeStyle: (frame, totalFrames) => ({
    opacity: envelope(frame, totalFrames),
    transform: `scale(${breathScale(frame, totalFrames)})`,
  }),
};

/**
 * 2. Slide up: il contenuto entra da 60px sotto traslando in alto, esce
 *    continuando a salire (esce verso l'alto) con opacity off.
 */
const slideUp: SoftTransition = {
  name: "slide-up",
  description: "Entra dal basso, esce verso l'alto",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const ty = (1 - ein) * 60 - eout * 60;
    return {
      opacity: envelope(frame, totalFrames),
      transform: `translateY(${ty}px) scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 3. Slide down: entra dall'alto, esce verso il basso.
 */
const slideDown: SoftTransition = {
  name: "slide-down",
  description: "Entra dall'alto, esce verso il basso",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const ty = (1 - ein) * -60 + eout * 60;
    return {
      opacity: envelope(frame, totalFrames),
      transform: `translateY(${ty}px) scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 4. Slide left: entra da destra, esce verso sinistra.
 */
const slideLeft: SoftTransition = {
  name: "slide-left",
  description: "Entra da destra, esce verso sinistra",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const tx = (1 - ein) * 80 - eout * 80;
    return {
      opacity: envelope(frame, totalFrames),
      transform: `translateX(${tx}px) scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 5. Slide right: entra da sinistra, esce verso destra.
 */
const slideRight: SoftTransition = {
  name: "slide-right",
  description: "Entra da sinistra, esce verso destra",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const tx = (1 - ein) * -80 + eout * 80;
    return {
      opacity: envelope(frame, totalFrames),
      transform: `translateX(${tx}px) scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 6. Scale in: il contenuto cresce da 0.92 -> 1.0 in entrata, e poi si rimpic-
 *    cioliscce a 0.96 in uscita. Effetto "punch" delicato.
 */
const scaleIn: SoftTransition = {
  name: "scale-in",
  description: "Cresce da 92% a 100%, esce a 96%",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const baseScale = 0.92 + ein * 0.08; // 0.92 -> 1.00
    const exitScale = 1 - eout * 0.04; // 1.00 -> 0.96
    const scale = baseScale * exitScale * breathScale(frame, totalFrames);
    return {
      opacity: envelope(frame, totalFrames),
      transform: `scale(${scale})`,
    };
  },
};

/**
 * 7. Zoom out: opposto di scale-in. Parte a 1.08 (gia' "dentro l'inquadratura")
 *    e si stabilizza a 1.0. Esce a 1.04. Sensazione di "messa a fuoco".
 */
const zoomOut: SoftTransition = {
  name: "zoom-out",
  description: "Parte a 108% e si stabilizza a 100% (focus pull)",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const baseScale = 1.08 - ein * 0.08; // 1.08 -> 1.00
    const exitScale = 1 + eout * 0.04; // 1.00 -> 1.04
    const scale = baseScale * exitScale * breathScale(frame, totalFrames);
    return {
      opacity: envelope(frame, totalFrames),
      transform: `scale(${scale})`,
    };
  },
};

/**
 * 8. Blur fade: il contenuto entra sfocato (blur 16px) e si mette a fuoco a
 *    blur(0). Esce sfumando con blur 12px. Effetto "ricordo".
 */
const blurFade: SoftTransition = {
  name: "blur-fade",
  description: "Entra sfocato (16px blur) e si mette a fuoco",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const blur = (1 - ein) * 16 + eout * 12;
    return {
      opacity: envelope(frame, totalFrames),
      filter: `blur(${blur}px)`,
      transform: `scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 9. Diagonal drift: il contenuto entra dal basso-destra in diagonale e esce
 *    verso alto-sinistra. Movimento ricco ma morbido (Ali Abdaal-style).
 */
const diagonalDrift: SoftTransition = {
  name: "diagonal-drift",
  description: "Entra in diagonale dal basso-destra, esce verso alto-sinistra",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const tx = (1 - ein) * 50 - eout * 50;
    const ty = (1 - ein) * 40 - eout * 40;
    return {
      opacity: envelope(frame, totalFrames),
      transform: `translate(${tx}px, ${ty}px) scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 10. Vertical wipe gradient: applica una mask gradient verticale che si
 *     muove dall'alto al basso in entrata e prosegue verso il basso in uscita.
 *     Effetto "tendina morbida" stile broadcast.
 */
const verticalWipe: SoftTransition = {
  name: "vertical-wipe",
  description: "Mask gradient verticale che scivola dall'alto al basso",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    // posizione del bordo del wipe da -10% a 110% in entrata, poi resta a 110%
    // durante la clip; in uscita scivola da 110% a -10% (sparisce dall'alto)
    const wipePos = ein * 120 - 10; // 0%entry -> 110%end
    const exitWipePos = 110 - eout * 120; // 1.0 -> -10%
    const pos = Math.min(wipePos, exitWipePos);
    return {
      opacity: envelope(frame, totalFrames),
      WebkitMaskImage: `linear-gradient(180deg, white 0%, white ${pos}%, transparent ${
        pos + 8
      }%, transparent 100%)`,
      maskImage: `linear-gradient(180deg, white 0%, white ${pos}%, transparent ${
        pos + 8
      }%, transparent 100%)`,
      transform: `scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 11. Radial reveal: il contenuto si rivela da un cerchio centrale che cresce.
 *     In uscita il cerchio si chiude verso il centro. Iris-style cinematic.
 */
const radialReveal: SoftTransition = {
  name: "radial-reveal",
  description: "Cerchio centrale che si apre/chiude (iris)",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    // raggio in % (0 -> 100 in entrata, 100 -> 0 in uscita)
    const inR = ein * 110;
    const outR = 110 - eout * 110;
    const r = Math.min(inR, outR);
    return {
      opacity: envelope(frame, totalFrames),
      WebkitMaskImage: `radial-gradient(circle at 50% 50%, white ${r}%, transparent ${
        r + 6
      }%)`,
      maskImage: `radial-gradient(circle at 50% 50%, white ${r}%, transparent ${
        r + 6
      }%)`,
      transform: `scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

/**
 * 12. Subtle drift up: come slide-up ma piu' delicato (offset 25px) e senza
 *     uscita asimmetrica — il contenuto torna al centro in uscita. Per cutaway
 *     dove vogliamo una transizione "quasi invisibile".
 */
const subtleDrift: SoftTransition = {
  name: "subtle-drift",
  description: "Drift verticale di 25px (entrata + uscita simmetriche)",
  computeStyle: (frame, totalFrames) => {
    const ein = entryProgress(frame);
    const eout = exitProgress(frame, totalFrames);
    const ty = (1 - ein) * 25 + eout * 15;
    return {
      opacity: envelope(frame, totalFrames),
      transform: `translateY(${ty}px) scale(${breathScale(frame, totalFrames)})`,
    };
  },
};

// =============================================================================
// Roster + picker
// =============================================================================

export const SOFT_TRANSITIONS: SoftTransition[] = [
  crossfade,
  slideUp,
  slideDown,
  slideLeft,
  slideRight,
  scaleIn,
  zoomOut,
  blurFade,
  diagonalDrift,
  verticalWipe,
  radialReveal,
  subtleDrift,
];

/**
 * Picker deterministico per cutawayIndex. Cosi cutaway #0 -> crossfade,
 * #1 -> slide-up, #2 -> slide-down, ecc., ciclando.
 */
export function pickSoftTransition(cutawayIndex: number): SoftTransition {
  return SOFT_TRANSITIONS[cutawayIndex % SOFT_TRANSITIONS.length];
}

/** Lista dei nomi (debug / preview UI) */
export function listSoftTransitionNames(): string[] {
  return SOFT_TRANSITIONS.map((t) => t.name);
}
