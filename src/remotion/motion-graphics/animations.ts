// Helpers di animazione condivisi tra i template motion graphics.
// L'idea: ogni template puo invocare un helper unico che cambia comportamento
// in base al theme (popInOvershoot, motionStyle, ecc.) cosi i preset hanno
// "carattere" senza dover duplicare la logica spring in ogni template.

import { spring, interpolate, type SpringConfig } from "remotion";
import type { MGTheme } from "./themes";

/**
 * Pop-in con overshoot stile The Infographics Show / MrBeast:
 * scale parte da 0, va a 1.12, torna a 1.0 con un piccolo bounce.
 * Se il theme NON ha popInOvershoot attivo, ritorna un normale spring smooth.
 *
 * Ritorna { scale, opacity } gia pronti per essere applicati al transform.
 */
export function popInOvershoot(opts: {
  frame: number;
  fps: number;
  theme: MGTheme;
  delayFrames?: number;
}): { scale: number; opacity: number } {
  const { frame, fps, theme, delayFrames = 0 } = opts;
  const localFrame = frame - delayFrames;

  if (theme.popInOvershoot) {
    // Pop-in morbido con leggero overshoot: 0.6 -> 1.06 -> 1.0
    // Damping piu alto = meno wobble, sensazione "soft snap" invece di "hard pop"
    const overshootSpring = spring({
      frame: localFrame,
      fps,
      config: {
        damping: 14,
        stiffness: 180,
        mass: 0.8,
        overshootClamping: false,
      } as Partial<SpringConfig>,
    });
    const scale = interpolate(
      overshootSpring,
      [0, 0.7, 1],
      [0.6, 1.06, 1.0],
      { extrapolateRight: "clamp" }
    );
    const opacity = interpolate(overshootSpring, [0, 0.5], [0, 1], {
      extrapolateRight: "clamp",
    });
    return { scale, opacity };
  }

  // Default: smooth spring 0.85 -> 1
  const normalSpring = spring({
    frame: localFrame,
    fps,
    config: {
      damping: theme.motionStyle === "bounce" ? 10 : 18,
      stiffness: theme.motionStyle === "snap" ? 220 : 140,
      mass: 0.7,
    },
  });
  const scale = interpolate(normalSpring, [0, 1], [0.85, 1]);
  const opacity = interpolate(normalSpring, [0, 1], [0, 1]);
  return { scale, opacity };
}

/**
 * Slide-up con fade per testo / sub-elementi.
 * Override: se popInOvershoot e attivo, usa una entrata piu "snap" (meno translateY ma piu rapida).
 */
export function slideUpFade(opts: {
  frame: number;
  fps: number;
  theme: MGTheme;
  delayFrames?: number;
  distance?: number;
}): { translateY: number; opacity: number } {
  const { frame, fps, theme, delayFrames = 0, distance = 28 } = opts;
  const localFrame = frame - delayFrames;
  const isSnap = theme.popInOvershoot || theme.motionStyle === "snap";
  const sp = spring({
    frame: localFrame,
    fps,
    config: {
      damping: theme.motionStyle === "bounce" ? 10 : 18,
      stiffness: isSnap ? 240 : 150,
      mass: 0.6,
    },
  });
  const opacity = interpolate(sp, [0, 1], [0, 1]);
  const translateY = interpolate(sp, [0, 1], [distance, 0]);
  return { translateY, opacity };
}
