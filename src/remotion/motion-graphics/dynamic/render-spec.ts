// =============================================================================
// RenderSpec — Schema per motion graphics dinamiche senza template.
// =============================================================================
//
// Ogni MG è descritta da un RenderSpec: un albero di RenderElement, ognuno con:
//   - CSS libero (qualsiasi proprietà, 3D, filtri, clip-path, glassmorphism...)
//   - SVG inline (path, circle, polygon...)
//   - Animazioni keyframe su QUALSIASI proprietà CSS
//   - Children nidificati (composizione libera)
//
// Non ci sono "tipi" predefiniti. Un "bar chart" è semplicemente rettangoli con
// scaleY animato. Un "pie chart" è SVG path con stroke-dasharray. Un "quote" è
// testo grande con virgolette. Claude ha libertà totale.
//
// I colori supportano token tematici ("accent", "text", "bg", "support") che
// vengono risolti a runtime dal tema scelto dall'utente.

import type { MGTheme } from "../themes";

// =============================================================================
// Types
// =============================================================================

export type AnimationKeyframe = {
  frame: number;
  value: string | number;
};

export type AnimSpec = {
  /** Nome proprietà CSS da animare (camelCase, es: "opacity", "transform", "clipPath") */
  prop: string;
  /** Keyframe: [{frame: 0, value: 0}, {frame: 15, value: 1}] */
  keyframes: AnimationKeyframe[];
  /** Curva di interpolazione */
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "spring";
  /** Config spring (solo se easing === "spring") */
  springConfig?: {
    damping?: number;
    stiffness?: number;
    mass?: number;
  };
};

export type RenderElement = {
  /** Tag HTML o SVG — default "div" */
  tag?:
    | "div" | "span" | "p" | "h1" | "h2" | "h3"
    | "svg" | "g" | "path" | "circle" | "rect" | "line"
    | "polygon" | "ellipse" | "text" | "defs" | "linearGradient"
    | "radialGradient" | "stop" | "clipPath" | "mask" | "use"
    | "polyline" | "image";

  /** Contenuto testuale diretto */
  text?: string;

  /** SVG inline raw (per forme complesse, def gradient, ecc.) */
  svg?: string;

  /** Qualsiasi proprietà CSS — accesso COMPLETO al rendering engine del browser */
  css?: Record<string, string | number>;

  /**
   * Animazioni: keyframe su QUALSIASI proprietà CSS.
   * Il renderer usa interpolate() / spring() di Remotion per calcolare
   * il valore corrente frame-by-frame.
   */
  animate?: AnimSpec[];

  /** Attributi HTML/SVG (es: d, cx, cy, r, viewBox, stroke-dasharray...) */
  attrs?: Record<string, string | number>;

  /** Figli nidificati — composizione libera */
  children?: RenderElement[];
};

export type RenderSpec = {
  /** CSS del container root (1080x1920 AbsoluteFill) */
  rootCss?: Record<string, string | number>;
  /** Elementi della scena */
  elements: RenderElement[];
};

// =============================================================================
// Color token resolution
// =============================================================================

const TOKEN_MAP: Record<string, keyof MGTheme> = {
  accent: "accentColor",
  text: "textColor",
  bg: "bgColor",
  support: "supportColor",
};

/**
 * Risolve i token colore in un singolo valore CSS.
 * Se il valore è un token noto (es. "accent"), lo sostituisce con il colore del tema.
 * Se il valore contiene un token dentro una stringa (es. "0 0 20px accent"),
 * sostituisce ogni occorrenza.
 * Altrimenti ritorna il valore invariato.
 */
export function resolveColorValue(
  value: string | number,
  theme: MGTheme
): string | number {
  if (typeof value !== "string") return value;

  // Token esatto
  if (TOKEN_MAP[value]) {
    return theme[TOKEN_MAP[value]] as string;
  }

  // Token dentro una stringa più lunga (es. "0 0 20px accent", "linear-gradient(accent, bg)")
  let resolved = value;
  for (const [token, key] of Object.entries(TOKEN_MAP)) {
    // Match token come parola intera (non dentro "accentColor" ecc.)
    const regex = new RegExp(`\\b${token}\\b`, "g");
    resolved = resolved.replace(regex, theme[key] as string);
  }
  return resolved;
}

/**
 * Risolve tutti i token colore in un oggetto CSS.
 */
export function resolveColorTokens(
  css: Record<string, string | number>,
  theme: MGTheme
): Record<string, string | number> {
  const resolved: Record<string, string | number> = {};
  for (const [prop, value] of Object.entries(css)) {
    resolved[prop] = resolveColorValue(value, theme);
  }
  return resolved;
}

// =============================================================================
// Validation
// =============================================================================

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function validateElement(raw: unknown): RenderElement | null {
  if (!isObject(raw)) return null;

  const el: RenderElement = {};

  // tag
  if (typeof raw.tag === "string") el.tag = raw.tag as RenderElement["tag"];

  // text
  if (typeof raw.text === "string") el.text = raw.text;

  // svg
  if (typeof raw.svg === "string") el.svg = raw.svg;

  // css
  if (isObject(raw.css)) {
    el.css = raw.css as Record<string, string | number>;
  }

  // animate
  if (Array.isArray(raw.animate)) {
    el.animate = (raw.animate as unknown[])
      .map((a) => {
        if (!isObject(a)) return null;
        if (typeof a.prop !== "string") return null;
        if (!Array.isArray(a.keyframes)) return null;
        const kfs = (a.keyframes as unknown[])
          .map((kf) => {
            if (!isObject(kf)) return null;
            if (typeof kf.frame !== "number") return null;
            if (typeof kf.value !== "string" && typeof kf.value !== "number") return null;
            return { frame: kf.frame, value: kf.value } as AnimationKeyframe;
          })
          .filter((kf): kf is AnimationKeyframe => kf !== null);
        if (kfs.length < 2) return null; // serve almeno 2 keyframe
        const spec: AnimSpec = { prop: a.prop, keyframes: kfs };
        if (typeof a.easing === "string") spec.easing = a.easing as AnimSpec["easing"];
        if (isObject(a.springConfig)) {
          spec.springConfig = {
            damping: typeof a.springConfig.damping === "number" ? a.springConfig.damping : undefined,
            stiffness: typeof a.springConfig.stiffness === "number" ? a.springConfig.stiffness : undefined,
            mass: typeof a.springConfig.mass === "number" ? a.springConfig.mass : undefined,
          };
        }
        return spec;
      })
      .filter((a): a is AnimSpec => a !== null);
  }

  // attrs
  if (isObject(raw.attrs)) {
    el.attrs = raw.attrs as Record<string, string | number>;
  }

  // children (ricorsivo)
  if (Array.isArray(raw.children)) {
    el.children = (raw.children as unknown[])
      .map(validateElement)
      .filter((c): c is RenderElement => c !== null);
  }

  // Deve avere almeno un contenuto (text, svg, css, children)
  if (!el.text && !el.svg && !el.css && !el.children?.length && !el.attrs) {
    return null;
  }

  return el;
}

/**
 * Valida un RenderSpec raw (output JSON di Claude).
 * Ritorna il spec validato o null se non valido.
 */
export function validateRenderSpec(raw: unknown): RenderSpec | null {
  if (!isObject(raw)) return null;

  const spec: RenderSpec = { elements: [] };

  // rootCss
  if (isObject(raw.rootCss)) {
    spec.rootCss = raw.rootCss as Record<string, string | number>;
  }

  // elements
  if (!Array.isArray(raw.elements)) return null;
  spec.elements = (raw.elements as unknown[])
    .map(validateElement)
    .filter((e): e is RenderElement => e !== null);

  if (spec.elements.length === 0) return null;

  return spec;
}

/**
 * Crea un RenderSpec di fallback con testo centrato.
 * Usato quando la traduzione Claude fallisce.
 */
export function fallbackRenderSpec(text: string, theme: MGTheme): RenderSpec {
  return {
    rootCss: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.bgColor,
      padding: 60,
    },
    elements: [
      {
        tag: "div",
        css: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        },
        children: [
          {
            tag: "div",
            text: text.split(/\s+/).slice(0, 8).join(" "),
            css: {
              fontSize: 56,
              fontWeight: 800,
              color: theme.textColor,
              textAlign: "center",
              lineHeight: 1.2,
            },
            animate: [
              {
                prop: "opacity",
                keyframes: [
                  { frame: 0, value: 0 },
                  { frame: 12, value: 1 },
                ],
                easing: "ease-out",
              },
              {
                prop: "transform",
                keyframes: [
                  { frame: 0, value: "translateY(30px)" },
                  { frame: 15, value: "translateY(0px)" },
                ],
                easing: "ease-out",
              },
            ],
          },
        ],
      },
    ],
  };
}
