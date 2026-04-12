// Subtitle Bar captions: barra TV-style sotto, fondo nero pieno larghezza
// con bordo accent superiore. ~7 parole per gruppo. Look broadcast/news.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 7;

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

export const SubtitleBarCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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
  const slideY = interpolate(frame, [enterFrame, enterFrame + 10], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(frame, [enterFrame, enterFrame + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "stretch",
        paddingBottom: 180,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          background: "linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.92))",
          padding: "44px 80px 36px",
          borderTop: "5px solid #FF3B30",
          opacity,
          transform: `translateY(${slideY}px)`,
          boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily: "Inter, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif",
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: -0.3,
            color: "#FFFFFF",
            textShadow: "0 4px 14px rgba(0,0,0,0.7)",
          }}
        >
          {activeGroup.words.map((w) => w.word).join(" ")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
