// =============================================================================
// DynamicRenderer — Componente ricorsivo che renderizza un RenderElement.
// =============================================================================
//
// Questo è il cuore del sistema senza template. Prende un RenderElement
// (container con CSS libero + SVG + animazioni + figli) e lo renderizza
// frame-by-frame usando le API Remotion (interpolate, spring).
//
// Supporta:
//   - Qualsiasi tag HTML o SVG
//   - Qualsiasi proprietà CSS (inclusi 3D transforms, filters, clip-path, ecc.)
//   - SVG inline via dangerouslySetInnerHTML
//   - Animazioni keyframe su qualsiasi proprietà CSS
//   - Nesting ricorsivo (children)
//   - Token colore tematici risolti dal tema
//   - Attributi SVG nativi (d, cx, cy, r, viewBox, ecc.)

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import type { MGTheme } from "../themes";
import type { RenderElement, AnimSpec } from "./render-spec";
import { resolveColorTokens, resolveColorValue } from "./render-spec";

// =============================================================================
// Animation interpolation
// =============================================================================

/**
 * Calcola il valore corrente di un'animazione dato il frame attuale.
 * Supporta interpolazione lineare, easing CSS, e spring di Remotion.
 */
function computeAnimatedValue(
  anim: AnimSpec,
  frame: number,
  fps: number
): string | number {
  const { keyframes, easing = "ease-out", springConfig } = anim;

  if (keyframes.length < 2) {
    return keyframes[0]?.value ?? 0;
  }

  // Spring: usa solo primo e ultimo keyframe
  if (easing === "spring") {
    const first = keyframes[0];
    const last = keyframes[keyframes.length - 1];

    const progress = spring({
      frame: frame - first.frame,
      fps,
      config: {
        damping: springConfig?.damping ?? 200,
        stiffness: springConfig?.stiffness ?? 100,
        mass: springConfig?.mass ?? 1,
      },
    });

    if (typeof first.value === "number" && typeof last.value === "number") {
      return first.value + (last.value - first.value) * progress;
    }
    // Per stringhe: snap a metà
    return progress > 0.5 ? last.value : first.value;
  }

  // Interpola tra keyframe
  // Trova il segmento corrente
  const allNumeric = keyframes.every((kf) => typeof kf.value === "number");

  if (allNumeric) {
    // Interpolazione numerica continua su tutti i keyframe
    const frames = keyframes.map((kf) => kf.frame);
    const values = keyframes.map((kf) => kf.value as number);

    const easingFn = pickEasing(easing);

    return interpolate(frame, frames, values, {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easingFn,
    });
  }

  // Per stringhe: segmento per segmento con snap
  for (let i = 0; i < keyframes.length - 1; i++) {
    const curr = keyframes[i];
    const next = keyframes[i + 1];
    if (frame >= curr.frame && frame <= next.frame) {
      if (typeof curr.value === "number" && typeof next.value === "number") {
        const easingFn = pickEasing(easing);
        return interpolate(frame, [curr.frame, next.frame], [curr.value, next.value], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easingFn,
        });
      }
      // Stringhe: snap al midpoint
      const mid = (curr.frame + next.frame) / 2;
      return frame < mid ? curr.value : next.value;
    }
  }

  // Fuori range: ultimo keyframe
  return keyframes[keyframes.length - 1].value;
}

function pickEasing(name: string): ((t: number) => number) | undefined {
  switch (name) {
    case "linear":
      return Easing.linear;
    case "ease-in":
      return Easing.in(Easing.cubic);
    case "ease-out":
      return Easing.out(Easing.cubic);
    case "ease-in-out":
      return Easing.inOut(Easing.cubic);
    default:
      return Easing.out(Easing.cubic);
  }
}

// =============================================================================
// SVG tag detection
// =============================================================================

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "line", "polygon", "ellipse",
  "text", "defs", "linearGradient", "radialGradient", "stop",
  "clipPath", "mask", "use", "polyline", "image",
]);

// =============================================================================
// Component
// =============================================================================

type DynamicRendererProps = {
  element: RenderElement;
  theme: MGTheme;
  /** Indice per key React */
  index?: number;
};

export const DynamicRenderer: React.FC<DynamicRendererProps> = ({
  element,
  theme,
  index = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tag = element.tag ?? "div";
  const isSvgTag = SVG_TAGS.has(tag);

  // 1. Risolvi CSS base con token colore
  let resolvedCss: Record<string, string | number> = element.css
    ? resolveColorTokens(element.css, theme)
    : {};

  // 2. Applica animazioni — sovrascrivono le proprietà CSS base
  if (element.animate && element.animate.length > 0) {
    // Copia per non mutare l'originale
    resolvedCss = { ...resolvedCss };
    for (const anim of element.animate) {
      const value = computeAnimatedValue(anim, frame, fps);
      // Risolvi token colore nel valore animato
      resolvedCss[anim.prop] = resolveColorValue(value, theme);
    }
  }

  // 3. Prepara attributi SVG (risolvi token colore anche qui)
  let resolvedAttrs: Record<string, string | number> | undefined;
  if (element.attrs) {
    resolvedAttrs = {};
    for (const [key, value] of Object.entries(element.attrs)) {
      resolvedAttrs[key] = resolveColorValue(value, theme);
    }
  }

  // 4. Renderizza children ricorsivamente
  const childElements = element.children?.map((child, i) => (
    <DynamicRenderer key={i} element={child} theme={theme} index={i} />
  ));

  // 5. Contenuto testuale
  const textContent = element.text ?? null;

  // 6. SVG inline (raw HTML)
  const svgInline = element.svg
    ? { dangerouslySetInnerHTML: { __html: element.svg } }
    : null;

  // 7. Crea l'elemento React
  // Per tag SVG, usiamo React.createElement con namespace SVG
  // Per tag HTML, usiamo createElement standard
  const Tag = tag as string;

  // Combina props
  const props: Record<string, unknown> = {
    key: index,
  };

  if (isSvgTag) {
    // SVG elements: gli stili vanno come attributi, non come style object
    // Ma passiamo comunque style per proprietà come opacity, transform che funzionano anche in SVG
    if (Object.keys(resolvedCss).length > 0) {
      props.style = resolvedCss;
    }
    // Attributi SVG nativi
    if (resolvedAttrs) {
      Object.assign(props, resolvedAttrs);
    }
  } else {
    // HTML elements: stili come style object
    if (Object.keys(resolvedCss).length > 0) {
      props.style = resolvedCss;
    }
    // Attributi HTML
    if (resolvedAttrs) {
      Object.assign(props, resolvedAttrs);
    }
  }

  // SVG inline
  if (svgInline) {
    Object.assign(props, svgInline);
    return React.createElement(Tag, props);
  }

  // Con children e/o testo
  const content: React.ReactNode[] = [];
  if (textContent) content.push(textContent);
  if (childElements && childElements.length > 0) content.push(...childElements);

  if (content.length === 0) {
    return React.createElement(Tag, props);
  }
  if (content.length === 1) {
    return React.createElement(Tag, props, content[0]);
  }
  return React.createElement(Tag, props, ...content);
};
