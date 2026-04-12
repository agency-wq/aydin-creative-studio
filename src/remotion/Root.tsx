// Remotion Root: registra le compositions disponibili.

import { Composition } from "remotion";
import { MainVideo, calculateMetadata } from "./MainVideo";
import { MGPreview, calculateMGPreviewMetadata, type MGPreviewProps } from "./MGPreview";
import {
  TransitionsPreview,
  TRANSITIONS_PREVIEW_FPS,
  TRANSITIONS_PREVIEW_FRAMES,
} from "./TransitionsPreview";
import type { MainVideoProps } from "./types";

const DEFAULT_PROPS: MainVideoProps = {
  avatarVideoUrl: "",
  durationMs: 10000,
  segments: [],
  words: [],
  captionPreset: "Karaoke",
  width: 1080,
  height: 1920,
  fps: 30,
};

const DEFAULT_MG_PREVIEW_PROPS: MGPreviewProps = {
  description: "Grande numero 47% al centro con effetto neon glow pulsante color accent. Il numero appare con spring pop deciso. Sotto, la scritta AUMENTO VENDITE in maiuscolo, font body, colore testo opacità 70%, slide-up ritardato.",
  themeName: "VOX",
  durationMs: 5000,
  width: 1080,
  height: 1920,
  fps: 30,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainVideo"
        component={MainVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="MGPreview"
        component={MGPreview}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_MG_PREVIEW_PROPS}
        calculateMetadata={calculateMGPreviewMetadata}
      />
      <Composition
        id="TransitionsPreview"
        component={TransitionsPreview}
        durationInFrames={TRANSITIONS_PREVIEW_FRAMES}
        fps={TRANSITIONS_PREVIEW_FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
