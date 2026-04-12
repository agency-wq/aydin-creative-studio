// Composition di debug: renderizza UNA motion graphic alla volta,
// con UN theme. Comoda per QA visivo senza dover passare per
// l'intera pipeline (audio + heygen + transcribe + ...).
//
// Uso (Remotion Studio): seleziona la composition "MGPreview" e modifica
// description / themeName dai default props.
//
// Uso (CLI render): pnpm remotion render src/remotion/index.ts MGPreview out.mp4
//   --props '{"description":"Grande numero 47% al centro con neon glow","themeName":"VOX"}'

import React from "react";
import type { CalculateMetadataFunction } from "remotion";
import { MotionGraphicsClip } from "./motion-graphics/MotionGraphicsClip";
import type { RenderSpec } from "./motion-graphics/dynamic/render-spec";

export type MGPreviewProps = {
  description: string;
  themeName: string;
  renderSpec?: RenderSpec;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
};

export const calculateMGPreviewMetadata: CalculateMetadataFunction<MGPreviewProps> = ({
  props,
}) => {
  const fps = props.fps ?? 30;
  const durationInFrames = Math.max(1, Math.ceil((props.durationMs / 1000) * fps));
  return {
    durationInFrames,
    fps,
    width: props.width ?? 1080,
    height: props.height ?? 1920,
  };
};

export const MGPreview: React.FC<MGPreviewProps> = ({
  description,
  themeName,
  renderSpec,
}) => {
  return (
    <MotionGraphicsClip
      description={description}
      renderSpec={renderSpec}
      themeName={themeName}
    />
  );
};
