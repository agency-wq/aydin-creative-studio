// MotionGraphicsClip — wrapper che renderizza una MG dinamica (RenderSpec) con
// tre livelli di varietà visiva aggiuntivi:
//   1. Decorative Background — forme animate (orbs, grid, bokeh, scan-line, ecc.)
//   2. Entrance Effect — animazione d'ingresso del contenuto (iris, glitch, clip-reveal, ecc.)
//   3. Ken Burns camera move — zoom/drift/punch cinematografico
//
// Non ci sono template predefiniti: ogni MG è un RenderSpec unico generato da
// Claude (AI Director → mg-translator). Se il RenderSpec non è disponibile,
// viene usato un fallback testuale basato sulla description.
//
// Tutto deterministico (basato su cameraIndex) così video uguali = risultato uguale,
// ma clip diversi nello stesso video hanno combinazioni diverse.

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { getTheme } from "./themes";
import { DecorativeBackground, pickDecoStyle } from "./decorative-bg";
import { EntranceEffect, pickEntranceEffect } from "./entrance-effects";
import { DynamicMG } from "./DynamicMG";
import type { RenderSpec } from "./dynamic/render-spec";
import { fallbackRenderSpec } from "./dynamic/render-spec";

export type MGCameraVariant =
  | "slow-zoom-in"
  | "slow-zoom-out"
  | "drift-right"
  | "drift-left"
  | "drift-up"
  | "drift-down"
  | "punch-in"
  | "tilt-right"
  | "parallax-up";

const MG_CAMERA_VARIANTS: MGCameraVariant[] = [
  "slow-zoom-in",
  "drift-right",
  "slow-zoom-out",
  "drift-left",
  "punch-in",
  "drift-up",
  "tilt-right",
  "drift-down",
  "parallax-up",
];

export function pickMGCameraVariant(index: number): MGCameraVariant {
  return MG_CAMERA_VARIANTS[index % MG_CAMERA_VARIANTS.length];
}

const cinematicEase = Easing.bezier(0.25, 0.1, 0.25, 1);

export type MotionGraphicsClipProps = {
  /** Descrizione creativa libera (dall'AI Director) */
  description: string;
  /** RenderSpec tradotto (da mg-translator) */
  renderSpec?: RenderSpec;
  themeName?: string | null;
  /** Indice del clip nel timeline, usato per scegliere varianti deterministiche. */
  cameraIndex?: number;
};

export const MotionGraphicsClip: React.FC<MotionGraphicsClipProps> = ({
  description,
  renderSpec,
  themeName,
  cameraIndex = 0,
}) => {
  const theme = getTheme(themeName);
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Se non c'è un renderSpec tradotto, usa il fallback testuale
  const spec: RenderSpec = renderSpec ?? fallbackRenderSpec(description, theme);

  // --- Camera move (Ken Burns) ---
  const variant = pickMGCameraVariant(cameraIndex);
  const t = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: cinematicEase,
  });

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let rotate = 0;
  switch (variant) {
    case "slow-zoom-in":
      scale = interpolate(t, [0, 1], [1.0, 1.06]);
      break;
    case "slow-zoom-out":
      scale = interpolate(t, [0, 1], [1.07, 1.0]);
      break;
    case "drift-right":
      scale = 1.04;
      translateX = interpolate(t, [0, 1], [-1.5, 1.5]);
      break;
    case "drift-left":
      scale = 1.04;
      translateX = interpolate(t, [0, 1], [1.5, -1.5]);
      break;
    case "drift-up":
      scale = 1.04;
      translateY = interpolate(t, [0, 1], [1.2, -1.2]);
      break;
    case "drift-down":
      scale = 1.04;
      translateY = interpolate(t, [0, 1], [-1.2, 1.2]);
      break;
    case "punch-in":
      scale = interpolate(t, [0, 0.18, 1], [1.12, 1.0, 1.0], {
        extrapolateRight: "clamp",
        easing: cinematicEase,
      });
      break;
    case "tilt-right":
      scale = 1.03;
      rotate = interpolate(t, [0, 1], [-0.5, 0.5]);
      translateX = interpolate(t, [0, 1], [-0.8, 0.8]);
      break;
    case "parallax-up":
      scale = interpolate(t, [0, 1], [1.08, 1.02]);
      translateY = interpolate(t, [0, 1], [2, -1]);
      break;
  }

  // --- Decorative style & entrance effect (deterministici per index) ---
  const decoStyle = pickDecoStyle(cameraIndex, themeName ?? "VOX");
  const entranceEffect = pickEntranceEffect(cameraIndex);

  const cameraTransform = [
    `scale(${scale.toFixed(4)})`,
    `translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`,
    rotate !== 0 ? `rotate(${rotate.toFixed(2)}deg)` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Layer 0: Decorative background */}
      <DecorativeBackground style={decoStyle} theme={theme} />

      {/* Layer 1: Entrance effect wrapping camera + DynamicMG */}
      <EntranceEffect effect={entranceEffect}>
        <AbsoluteFill style={{ transform: cameraTransform, transformOrigin: "center center" }}>
          <DynamicMG spec={spec} theme={theme} />
        </AbsoluteFill>
      </EntranceEffect>
    </AbsoluteFill>
  );
};
