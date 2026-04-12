// Beast Mode captions: stile MrBeast — UPPERCASE giallo gigante con stroke
// nero spesso, una parola alla volta full-screen, scale-pop violento.
// Massima intensita visiva.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { RemotionWord } from "./types";

export const BeastModeCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  if (!words || words.length === 0) return null;

  // Una parola alla volta
  const activeIdx = words.findIndex((w) => nowMs >= w.start && nowMs <= w.end);
  const fallbackIdx = activeIdx === -1
    ? words.findLastIndex((w) => nowMs >= w.start)
    : activeIdx;
  if (fallbackIdx < 0) return null;
  const w = words[fallbackIdx];

  const enterFrame = Math.floor((w.start / 1000) * fps);
  const since = frame - enterFrame;
  const popSpring = spring({
    frame: Math.max(0, since),
    fps,
    config: { damping: 8, stiffness: 240, mass: 0.5 },
    from: 0,
    to: 1,
  });
  const scale = interpolate(popSpring, [0, 0.6, 1], [0.4, 1.25, 1.05]);
  const rotate = interpolate(popSpring, [0, 1], [-6, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 100,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: "Impact, 'Inter Black', system-ui, sans-serif",
          fontSize: 220,
          fontWeight: 900,
          lineHeight: 0.95,
          letterSpacing: -4,
          textTransform: "uppercase",
          color: "#FFE600",
          WebkitTextStroke: "12px #000000",
          paintOrder: "stroke fill",
          textShadow:
            "0 0 0 #000, 0 12px 0 #000, 0 0 30px rgba(255,230,0,0.4), 0 16px 32px rgba(0,0,0,0.9)",
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          maxWidth: "85%",
          textAlign: "center",
          padding: "0 40px",
        }}
      >
        {w.word}
      </span>
    </AbsoluteFill>
  );
};
