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
  );
};
