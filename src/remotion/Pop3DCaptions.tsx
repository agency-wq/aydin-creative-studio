// Pop3D captions: parole con effetto 3D extruded (multiple text-shadow stack)
// e bounce 3D in entrata. ~3 parole alla volta. Stile "lyric video".
//
// Look: parole gialle con shadow stack che simula extrude 3D verde, rotazione
// leggera in entrata.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 3;

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

// Stack di 12 shadow per simulare extrude 3D
const extrudeShadow = (color: string) =>
  Array.from({ length: 12 }, (_, i) => `${i + 1}px ${i + 1}px 0 ${color}`).join(", ");

export const Pop3DCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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

  const groupEnterFrame = Math.floor((activeGroup.start / 1000) * fps);
  const since = frame - groupEnterFrame;
  const popSpring = spring({
    frame: Math.max(0, since),
    fps,
    config: { damping: 9, stiffness: 200, mass: 0.5 },
    from: 0,
    to: 1,
  });
  const scale = interpolate(popSpring, [0, 1], [0.5, 1]);
  const rotate = interpolate(popSpring, [0, 1], [-12, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 260,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px 22px",
          maxWidth: "90%",
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          transformOrigin: "center bottom",
        }}
      >
        {activeGroup.words.map((w, i) => {
          const isActive = nowMs >= w.start && nowMs <= w.end;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontFamily: "Impact, Inter, system-ui, sans-serif",
                fontSize: 102,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: -2,
                textTransform: "uppercase",
                color: isActive ? "#FFE600" : "#FFFFFF",
                textShadow: extrudeShadow(isActive ? "#1A8B3F" : "#222"),
                transform: isActive ? "translateY(-6px)" : "translateY(0)",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
