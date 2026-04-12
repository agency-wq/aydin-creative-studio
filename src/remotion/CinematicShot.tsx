// Wrapper cinematografico per cutaway clip (motion graphics + b-roll).
// Aggiunge:
//   - Ken Burns (zoom + pan lento) deterministico per indice clip
//   - Easing cinematic
//   - Punch-in opening per gli "stinger" (variant)
//   - objectFit: cover (gestisce automaticamente clip non-9:16)
//
// Tutto deterministico frame-by-frame (Remotion-friendly): nessun random,
// nessun setState. La variante e scelta in base all'indice della clip.

import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

export type CinematicVariant =
  | "kenburns-zoom-in"
  | "kenburns-zoom-out"
  | "kenburns-pan-left"
  | "kenburns-pan-right"
  | "punch-in"
  | "drift-up";

const VARIANTS: CinematicVariant[] = [
  "kenburns-zoom-in",
  "kenburns-pan-right",
  "kenburns-zoom-out",
  "kenburns-pan-left",
  "punch-in",
  "drift-up",
];

export function pickVariant(index: number): CinematicVariant {
  return VARIANTS[index % VARIANTS.length];
}

const cinematicEase = Easing.bezier(0.25, 0.1, 0.25, 1);

type CinematicShotProps = {
  src: string;
  variant?: CinematicVariant;
  muted?: boolean;
};

export const CinematicShot: React.FC<CinematicShotProps> = ({
  src,
  variant = "kenburns-zoom-in",
  muted = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Progress 0 → 1 lungo la durata della Sequence wrapping (parent provides via durationInFrames)
  const t = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: cinematicEase,
  });

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  switch (variant) {
    case "kenburns-zoom-in":
      // 1.00 → 1.10
      scale = interpolate(t, [0, 1], [1.0, 1.1]);
      break;
    case "kenburns-zoom-out":
      // 1.12 → 1.00
      scale = interpolate(t, [0, 1], [1.12, 1.0]);
      break;
    case "kenburns-pan-left":
      // pan da destra a sinistra, leggero zoom 1.06
      scale = 1.06;
      translateX = interpolate(t, [0, 1], [2.5, -2.5]);
      break;
    case "kenburns-pan-right":
      scale = 1.06;
      translateX = interpolate(t, [0, 1], [-2.5, 2.5]);
      break;
    case "punch-in":
      // zoom rapido nei primi 8 frame poi tiene 1.0
      scale = interpolate(t, [0, 0.12, 1], [1.15, 1.0, 1.0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: cinematicEase,
      });
      break;
    case "drift-up":
      scale = 1.06;
      translateY = interpolate(t, [0, 1], [2, -2]);
      break;
  }

  const transform = `scale(${scale.toFixed(4)}) translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform, transformOrigin: "center center" }}>
        <OffthreadVideo
          src={src}
          muted={muted}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
