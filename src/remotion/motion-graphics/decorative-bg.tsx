// Decorative animated backgrounds per motion graphics.
// Aggiungono personalità visiva ai template senza modificare il template stesso.
// Ogni "style" è un layer di forme geometriche / particelle / gradienti animati
// che si muovono durante la durata del clip, rendendo le MG più cinematografiche.
//
// La selezione è DETERMINISTICA: basata su themeIndex + clipIndex, così video
// uguali producono sempre lo stesso risultato, ma clip diversi nello stesso
// video hanno decorazioni diverse.

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import type { MGTheme } from "./themes";

type DecoStyle =
  | "floating-orbs"
  | "grid-pulse"
  | "diagonal-lines"
  | "bokeh-circles"
  | "corner-accents"
  | "scan-line"
  | "radial-burst"
  | "none";

const DECO_STYLES: DecoStyle[] = [
  "floating-orbs",
  "grid-pulse",
  "diagonal-lines",
  "bokeh-circles",
  "corner-accents",
  "scan-line",
  "radial-burst",
];

/**
 * Seleziona deterministicamente lo stile decorativo per un clip.
 * Combina clipIndex per variare tra clip e themeHash per variare tra temi.
 */
export function pickDecoStyle(clipIndex: number, themeName: string): DecoStyle {
  let hash = 0;
  for (let i = 0; i < themeName.length; i++) {
    hash = ((hash << 5) - hash + themeName.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash + clipIndex * 7) % DECO_STYLES.length;
  return DECO_STYLES[idx];
}

type Props = {
  style: DecoStyle;
  theme: MGTheme;
};

/**
 * Layer decorativo animato. Va posizionato SOTTO il template content (zIndex 0).
 * Opacità volutamente bassa per non distrarre dal contenuto.
 */
export const DecorativeBackground: React.FC<Props> = ({ style, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (style === "none") return null;

  const t = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: "clamp",
  });

  switch (style) {
    case "floating-orbs":
      return <FloatingOrbs t={t} frame={frame} theme={theme} />;
    case "grid-pulse":
      return <GridPulse t={t} frame={frame} theme={theme} />;
    case "diagonal-lines":
      return <DiagonalLines t={t} frame={frame} theme={theme} />;
    case "bokeh-circles":
      return <BokehCircles t={t} frame={frame} theme={theme} />;
    case "corner-accents":
      return <CornerAccents t={t} frame={frame} theme={theme} />;
    case "scan-line":
      return <ScanLine t={t} frame={frame} theme={theme} />;
    case "radial-burst":
      return <RadialBurst t={t} frame={frame} theme={theme} />;
    default:
      return null;
  }
};

// =============================================================================
// Individual decorative styles
// =============================================================================

type StyleProps = { t: number; frame: number; theme: MGTheme };

/** Sfere luminose floating che si muovono lentamente */
const FloatingOrbs: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const orbs = [
    { cx: 15, cy: 20, r: 180, speed: 0.8, phase: 0 },
    { cx: 80, cy: 70, r: 140, speed: 1.2, phase: 2 },
    { cx: 50, cy: 85, r: 200, speed: 0.6, phase: 4 },
    { cx: 30, cy: 50, r: 120, speed: 1.0, phase: 1 },
  ];

  return (
    <AbsoluteFill style={{ zIndex: 0, opacity: 0.15, pointerEvents: "none" }}>
      {orbs.map((orb, i) => {
        const x = orb.cx + Math.sin(frame * 0.02 * orb.speed + orb.phase) * 8;
        const y = orb.cy + Math.cos(frame * 0.015 * orb.speed + orb.phase) * 6;
        const scale = 1 + Math.sin(frame * 0.03 + orb.phase) * 0.15;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: orb.r,
              height: orb.r,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${theme.accentColor}60 0%, transparent 70%)`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              filter: "blur(40px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Griglia sottile che pulsa con effetto wave */
const GridPulse: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const lines = 8;
  const opacity = interpolate(frame, [0, 12], [0, 0.08], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ zIndex: 0, opacity, pointerEvents: "none" }}>
      {/* Linee orizzontali */}
      {Array.from({ length: lines }, (_, i) => {
        const y = ((i + 1) / (lines + 1)) * 100;
        const wave = Math.sin(frame * 0.04 + i * 0.8) * 2;
        const lineOpacity = 0.3 + Math.sin(frame * 0.05 + i) * 0.2;
        return (
          <div
            key={`h-${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${y + wave}%`,
              height: 1,
              backgroundColor: theme.accentColor,
              opacity: lineOpacity,
            }}
          />
        );
      })}
      {/* Linee verticali */}
      {Array.from({ length: 5 }, (_, i) => {
        const x = ((i + 1) / 6) * 100;
        const wave = Math.cos(frame * 0.03 + i * 1.2) * 2;
        const lineOpacity = 0.2 + Math.sin(frame * 0.04 + i + 3) * 0.15;
        return (
          <div
            key={`v-${i}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${x + wave}%`,
              width: 1,
              backgroundColor: theme.supportColor,
              opacity: lineOpacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Linee diagonali che scorrono */
const DiagonalLines: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const lineCount = 6;
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const scroll = frame * 1.5;

  return (
    <AbsoluteFill style={{ zIndex: 0, opacity: opacity * 0.06, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: lineCount }, (_, i) => {
        const basePos = (i / lineCount) * 140 - 20; // -20 to 120%
        const yPos = ((basePos + scroll * 0.3) % 160) - 30; // continuous scroll
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "-20%",
              right: "-20%",
              top: `${yPos}%`,
              height: 2,
              backgroundColor: theme.accentColor,
              transform: "rotate(-35deg)",
              transformOrigin: "center",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Cerchi bokeh sfocati che fluttuano */
const BokehCircles: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const circles = [
    { x: 10, y: 15, size: 80, speed: 0.5 },
    { x: 85, y: 25, size: 60, speed: 0.7 },
    { x: 25, y: 75, size: 100, speed: 0.4 },
    { x: 70, y: 80, size: 50, speed: 0.9 },
    { x: 50, y: 40, size: 70, speed: 0.6 },
    { x: 90, y: 55, size: 40, speed: 1.1 },
  ];

  const fadeIn = interpolate(frame, [0, 15], [0, 0.12], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ zIndex: 0, opacity: fadeIn, pointerEvents: "none" }}>
      {circles.map((c, i) => {
        const px = c.x + Math.sin(frame * 0.01 * c.speed + i * 2) * 5;
        const py = c.y + Math.cos(frame * 0.012 * c.speed + i * 3) * 4;
        const pulse = 1 + Math.sin(frame * 0.04 + i * 1.5) * 0.2;
        const color = i % 2 === 0 ? theme.accentColor : theme.supportColor;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${px}%`,
              top: `${py}%`,
              width: c.size * pulse,
              height: c.size * pulse,
              borderRadius: "50%",
              border: `2px solid ${color}30`,
              background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
              transform: "translate(-50%, -50%)",
              filter: "blur(4px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Accent angles/brackets negli angoli */
const CornerAccents: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const drawProgress = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const accentLen = 120 * drawProgress;
  const thickness = 4;
  const margin = 60;
  const opacity = 0.25;
  const color = theme.accentColor;

  const corners = [
    { top: margin, left: margin, rotH: 0, rotV: 0 },
    { top: margin, right: margin, rotH: 0, rotV: 0 },
    { bottom: margin, left: margin, rotH: 0, rotV: 0 },
    { bottom: margin, right: margin, rotH: 0, rotV: 0 },
  ];

  return (
    <AbsoluteFill style={{ zIndex: 0, pointerEvents: "none", opacity }}>
      {corners.map((pos, i) => {
        const style: React.CSSProperties = { position: "absolute", ...pos };
        const isRight = i % 2 === 1;
        const isBottom = i >= 2;
        return (
          <div key={i} style={style}>
            {/* Horizontal line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                [isRight ? "right" : "left"]: 0,
                width: accentLen,
                height: thickness,
                backgroundColor: color,
                borderRadius: 2,
              }}
            />
            {/* Vertical line */}
            <div
              style={{
                position: "absolute",
                [isBottom ? "bottom" : "top"]: 0,
                left: 0,
                width: thickness,
                height: accentLen,
                backgroundColor: color,
                borderRadius: 2,
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Linea scan orizzontale che scorre dall'alto in basso */
const ScanLine: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const scanY = interpolate(t, [0, 1], [-5, 105]);
  const opacity = interpolate(frame, [0, 8], [0, 0.2], { extrapolateRight: "clamp" });
  const glowSize = 60 + Math.sin(frame * 0.1) * 20;

  return (
    <AbsoluteFill style={{ zIndex: 0, opacity, pointerEvents: "none", overflow: "hidden" }}>
      {/* Main scan line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${scanY}%`,
          height: 2,
          backgroundColor: theme.accentColor,
          boxShadow: `0 0 ${glowSize}px ${glowSize / 2}px ${theme.accentColor}40`,
          transform: "translateY(-50%)",
        }}
      />
      {/* Subtle trail */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${scanY - 3}%`,
          height: "6%",
          background: `linear-gradient(to bottom, transparent, ${theme.accentColor}08, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Raggi radiali che si espandono dal centro (più sottile di IconBurst) */
const RadialBurst: React.FC<StyleProps> = ({ t, frame, theme }) => {
  const rayCount = 16;
  const expandProgress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeIn = interpolate(frame, [0, 8, 25], [0, 0.1, 0.05], {
    extrapolateRight: "clamp",
  });
  const rotation = frame * 0.15;

  return (
    <AbsoluteFill style={{ zIndex: 0, pointerEvents: "none" }}>
      <svg
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          width: "120%",
          height: "120%",
          opacity: fadeIn,
        }}
        viewBox="0 0 1000 1000"
      >
        {Array.from({ length: rayCount }, (_, i) => {
          const angle = (i / rayCount) * 360;
          const length = 150 + 350 * expandProgress;
          const rad = (angle * Math.PI) / 180;
          return (
            <line
              key={i}
              x1="500"
              y1="500"
              x2={500 + Math.cos(rad) * length}
              y2={500 + Math.sin(rad) * length}
              stroke={theme.accentColor}
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.4}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
