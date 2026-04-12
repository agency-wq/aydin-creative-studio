// Editorial captions: stile NYT/Vox magazine — serif elegante, 5-6 parole,
// righello orizzontale sopra, pronunciata letter-spacing positivo. Look "premium".

import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 6;

type Group = { start: number; end: number; words: RemotionWord[] };

function buildGroups(words: RemotionWord[]): Group[] {
  const groups: Group[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_GROUP) {
    const chunk = words.slice(i, i + WORDS_PER_GROUP);
    if (chunk.length === 0) continue;
    groups.push({ start: chunk[0].start, end: chunk[chunk.length - 1].end, words: chunk });
  }
  return groups;
}

export const EditorialCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  if (!words || words.length === 0) return null;

  const groups = buildGroups(words);
  const activeGroup =
    groups.find((g) => nowMs >= g.start && nowMs <= g.end) ??
    [...groups].reverse().find((g) => nowMs >= g.start) ??
    null;
  if (!activeGroup) return null;

  const enterFrame = Math.floor((activeGroup.start / 1000) * fps);
  const exitFrame = Math.floor((activeGroup.end / 1000) * fps);
  const fadeIn = interpolate(frame, [enterFrame, enterFrame + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(frame, [exitFrame - 6, exitFrame + 4], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const lineWidth = interpolate(frame, [enterFrame, enterFrame + 16], [0, 240], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 240,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          opacity,
        }}
      >
        <div
          style={{
            width: lineWidth,
            height: 4,
            backgroundColor: "#E62B1E",
            boxShadow: "0 0 12px rgba(230,43,30,0.5)",
          }}
        />
        <div
          style={{
            textAlign: "center",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 60,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: 0.5,
            color: "#FFFFFF",
            textShadow: "0 6px 24px rgba(0,0,0,0.85), 0 0 16px rgba(0,0,0,0.5)",
          }}
        >
          {activeGroup.words.map((w) => w.word).join(" ")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
