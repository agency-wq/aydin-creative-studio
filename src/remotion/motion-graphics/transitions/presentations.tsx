// Libreria di TransitionPresentation custom adattate dal catalogo Ashad
// (ashad001/remotion-transitions, MIT) e parametrizzate per accettare i colori
// del theme corrente, cosi ogni cutaway puo "firmare" la sua transizione con
// la palette del preset (Infographics Show, MrBeast, Skymography, ecc.).
//
// Tutte le transizioni:
//   - usano `presentationProgress` (0 -> 1), MAI useCurrentFrame al loro interno
//   - sono factory che ritornano { component, props: {} }
//   - vanno instanziate al module level per evitare re-mount
//
// Ref: ~/.claude/skills/remotion-transitions/references/transition-catalog.md

import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type { TransitionPresentation } from "@remotion/transitions";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

type ColorPair = {
  /** Colore "scuro" / di base (es. accentColor o bgColor del theme) */
  primary: string;
  /** Colore di accent / glow */
  accent: string;
};

// =============================================================================
// 1. Striped Slam — N bande slammate dai due lati, poi retract
// =============================================================================

export function stripedSlam(
  colors: ColorPair,
  stripes = 8,
): TransitionPresentation<Record<string, never>> {
  const STRIPE_COLORS = [colors.primary, colors.accent];
  const component: React.FC<{
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }> = ({ presentationProgress, presentationDirection, children }) => {
    const bars = Array.from({ length: stripes }, (_, i) => {
      const h = 100 / stripes;
      const color = STRIPE_COLORS[i % STRIPE_COLORS.length];
      const fromLeft = i % 2 === 0;
      const stagger = (i / stripes) * 0.3;
      const p = Math.max(0, Math.min(1, (presentationProgress - stagger) / (1 - stagger)));
      const pe = 1 - Math.pow(1 - p, 3);

      let x: number;
      if (presentationDirection === "exiting") {
        x = fromLeft
          ? interpolate(pe, [0, 1], [-112, 0])
          : interpolate(pe, [0, 1], [112, 0]);
      } else {
        const revStagger = ((stripes - 1 - i) / stripes) * 0.3;
        const rp = Math.max(0, Math.min(1, (presentationProgress - revStagger) / (1 - revStagger)));
        const rpe = 1 - Math.pow(1 - rp, 3);
        x = fromLeft
          ? interpolate(rpe, [0, 1], [0, -112])
          : interpolate(rpe, [0, 1], [0, 112]);
      }

      return (
        <div
          key={i}
          style={{
            position: "absolute",
            top: `${i * h}%`,
            left: 0,
            width: "112%",
            height: `${h + 0.4}%`,
            background: color,
            transform: `translateX(${x}%)`,
            pointerEvents: "none",
          }}
        />
      );
    });

    return (
      <AbsoluteFill>
        {children}
        {bars}
      </AbsoluteFill>
    );
  };

  return { component, props: {} };
}

// =============================================================================
// 2. Zoom Punch — old zoom-out + fade, new punch-in con cubic ease
// =============================================================================

export function zoomPunch(): TransitionPresentation<Record<string, never>> {
  const component: React.FC<{
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }> = ({ presentationProgress, presentationDirection, children }) => {
    const entering = presentationDirection === "entering";

    if (entering) {
      const p = presentationProgress;
      const pe = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const scale = interpolate(pe, [0, 1], [0.86, 1]);
      return (
        <AbsoluteFill style={{ opacity: presentationProgress, transform: `scale(${scale})` }}>
          {children}
        </AbsoluteFill>
      );
    }

    const scale = interpolate(presentationProgress, [0, 1], [1, 1.08]);
    return (
      <AbsoluteFill
        style={{ opacity: 1 - presentationProgress, transform: `scale(${scale})` }}
      >
        {children}
      </AbsoluteFill>
    );
  };

  return { component, props: {} };
}

// =============================================================================
// 3. Diagonal Reveal — pannello scuro skewato che sweepa con accent line
// =============================================================================

export function diagonalReveal(
  colors: ColorPair,
): TransitionPresentation<Record<string, never>> {
  const DARK = colors.primary;
  const ACCENT = colors.accent;
  const component: React.FC<{
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }> = ({ presentationProgress, presentationDirection, children }) => {
    if (presentationDirection === "exiting") {
      return (
        <AbsoluteFill style={{ opacity: 1 - Math.pow(presentationProgress, 0.6) }}>
          {children}
        </AbsoluteFill>
      );
    }

    const pe = 1 - Math.pow(1 - presentationProgress, 2.5);
    const bx = interpolate(pe, [0, 1], [-12, 116]);

    return (
      <AbsoluteFill>
        {children}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${bx}%`,
            right: 0,
            background: DARK,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-10%",
            bottom: "-10%",
            left: `${bx - 7}%`,
            width: "10%",
            background: DARK,
            transform: "skewX(-9deg)",
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${bx - 0.5}%`,
            width: 3,
            background: ACCENT,
            transform: "skewX(-9deg)",
            boxShadow: `0 0 14px ${ACCENT}, 0 0 32px ${ACCENT}66`,
            pointerEvents: "none",
          }}
        />
      </AbsoluteFill>
    );
  };

  return { component, props: {} };
}

// =============================================================================
// 4. Color Burst — flash radiale dal centro (rinominato da "Emerald Burst")
// =============================================================================

export function colorBurst(
  colors: ColorPair,
): TransitionPresentation<Record<string, never>> {
  const ACCENT = colors.accent;
  const component: React.FC<{
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }> = ({ presentationProgress, presentationDirection, children }) => {
    const entering = presentationDirection === "entering";

    const burstOpacity = entering
      ? interpolate(presentationProgress, [0, 0.2, 1], [1, 0, 0], clamp)
      : interpolate(presentationProgress, [0, 0.8, 1], [0, 0, 1], clamp);

    const sceneStyle = entering
      ? { opacity: interpolate(presentationProgress, [0, 0.25, 1], [0, 1, 1], clamp) }
      : { opacity: 1 - Math.pow(presentationProgress, 2) };

    return (
      <AbsoluteFill>
        <AbsoluteFill style={sceneStyle}>{children}</AbsoluteFill>
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 50%, #ffffff 0%, ${ACCENT} 18%, ${ACCENT}88 40%, transparent 62%)`,
            opacity: burstOpacity,
            pointerEvents: "none",
          }}
        />
      </AbsoluteFill>
    );
  };

  return { component, props: {} };
}

// =============================================================================
// 5. Vertical Shutter — N pannelli verticali stile veneziana
// =============================================================================

export function verticalShutter(
  colors: ColorPair,
  panels = 7,
): TransitionPresentation<Record<string, never>> {
  const component: React.FC<{
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }> = ({ presentationProgress, presentationDirection, children }) => {
    const w = 100 / panels;
    const shutters = Array.from({ length: panels }, (_, i) => {
      const stagger = (i / panels) * 0.25;
      const p = Math.max(0, Math.min(1, (presentationProgress - stagger) / (1 - stagger)));
      const pe = 1 - Math.pow(1 - p, 3);

      const scaleX =
        presentationDirection === "exiting"
          ? interpolate(pe, [0, 1], [0, 1])
          : interpolate(pe, [0, 1], [1, 0]);

      const color = i % 2 === 0 ? colors.primary : colors.accent;

      return (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${i * w}%`,
            width: `${w + 0.3}%`,
            background: color,
            transform: `scaleX(${scaleX})`,
            transformOrigin: "left center",
            pointerEvents: "none",
          }}
        />
      );
    });

    return (
      <AbsoluteFill>
        {children}
        {shutters}
      </AbsoluteFill>
    );
  };

  return { component, props: {} };
}

// =============================================================================
// 6. Glitch Slam — shake decay + 4 strisce RGB tearing + hard pop-in
// =============================================================================

export function glitchSlam(): TransitionPresentation<Record<string, never>> {
  const component: React.FC<{
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }> = ({ presentationProgress, presentationDirection, children }) => {
    const entering = presentationDirection === "entering";

    if (entering) {
      const opacity = interpolate(presentationProgress, [0, 0.12, 1], [0, 1, 1], clamp);
      const scale = interpolate(presentationProgress, [0, 0.25, 1], [1.05, 1.01, 1], clamp);
      return (
        <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>
          {children}
        </AbsoluteFill>
      );
    }

    const shake =
      Math.sin(presentationProgress * Math.PI * 12) *
      30 *
      Math.pow(1 - presentationProgress, 1.5);
    const opacity = 1 - Math.pow(presentationProgress, 0.5);

    const STRIPS = [
      { top: "18%", h: "4%", dx: 28, color: "rgba(239,68,68,0.55)" },
      { top: "37%", h: "2%", dx: -22, color: "rgba(16,185,129,0.55)" },
      { top: "58%", h: "5%", dx: 36, color: "rgba(59,130,246,0.5)" },
      { top: "76%", h: "2%", dx: -18, color: "rgba(255,255,255,0.35)" },
    ];
    const stripOpacity = interpolate(
      presentationProgress,
      [0, 0.3, 0.8, 1],
      [0, 1, 0.6, 0],
      clamp,
    );

    const strips = STRIPS.map((s, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          top: s.top,
          left: 0,
          right: 0,
          height: s.h,
          background: s.color,
          transform: `translateX(${s.dx * presentationProgress * 2}px)`,
          opacity: stripOpacity,
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />
    ));

    return (
      <AbsoluteFill style={{ opacity, transform: `translateX(${shake}px)` }}>
        {children}
        {strips}
      </AbsoluteFill>
    );
  };

  return { component, props: {} };
}
