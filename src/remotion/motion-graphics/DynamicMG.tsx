// =============================================================================
// DynamicMG — Entry point per motion graphics senza template.
// =============================================================================
//
// Riceve un RenderSpec (generato dalla Call 2 — traduttore Claude) e un tema,
// e renderizza la scena usando il DynamicRenderer ricorsivo.
//
// Questo componente sostituisce il dispatch da TEMPLATE_REGISTRY in
// MotionGraphicsClip.tsx. Viene wrappato dagli stessi layer cinematici
// (DecorativeBackground, EntranceEffect, camera Ken Burns).

import React from "react";
import { AbsoluteFill } from "remotion";
import type { MGTheme } from "./themes";
import type { RenderSpec } from "./dynamic/render-spec";
import { resolveColorTokens } from "./dynamic/render-spec";
import { DynamicRenderer } from "./dynamic/DynamicRenderer";

// Error boundary per catturare errori di rendering da RenderSpec AI-generated.
// Senza questo, un singolo CSS/SVG invalido crasha l'intero render Remotion.
class MGErrorBoundary extends React.Component<
  { fallbackText: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallbackText: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn(`[DynamicMG] render error caught by boundary: ${error.message}`);
  }
  render() {
    if (this.state.hasError) {
      return (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#1a1a2e",
            padding: 60,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: 42,
              fontFamily: "Montserrat, sans-serif",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {this.props.fallbackText}
          </div>
        </AbsoluteFill>
      );
    }
    return this.props.children;
  }
}

type DynamicMGProps = {
  spec: RenderSpec;
  theme: MGTheme;
};

export const DynamicMG: React.FC<DynamicMGProps> = ({ spec, theme }) => {
  // Risolvi token colore nel CSS del container root
  const rootStyle: React.CSSProperties = spec.rootCss
    ? (resolveColorTokens(spec.rootCss, theme) as React.CSSProperties)
    : {};

  return (
    <MGErrorBoundary fallbackText="">
      <AbsoluteFill
        style={{
          overflow: "hidden",
          ...rootStyle,
        }}
      >
        {spec.elements.map((element, i) => (
          <DynamicRenderer key={i} element={element} theme={theme} index={i} />
        ))}
      </AbsoluteFill>
    </MGErrorBoundary>
  );
};
