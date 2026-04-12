// Minimal captions: testo bianco semplice senza box, fade-in/fade-out morbido,
// 5-6 parole per gruppo, fontSize medio. Ispirato a YouTube auto-captions
// premium / Apple keynote subtitles.

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

export const MinimalCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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

  // Fade in/out morbido sull'intero gruppo
  const enterFrame = Math.floor((activeGroup.start / 1000) * fps);
  const exitFrame = Math.floor((activeGroup.end / 1000) * fps);
  const fadeIn = interpolate(frame, [enterFrame, enterFrame + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(frame, [exitFrame - 6, exitFrame + 4], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut);

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
          textAlign: "center",
          fontFamily: "Inter, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif",
          fontSize: 64,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: -0.5,
          color: "#FFFFFF",
          textShadow: "0 4px 22px rgba(0,0,0,0.85), 0 0 14px rgba(0,0,0,0.6)",
          opacity,
        }}
      >
        {activeGroup.words.map((w) => w.word).join(" ")}
      </div>
    </AbsoluteFill>
  );
};
