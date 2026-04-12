// Highlight Box captions: testo bianco con la parola attiva evidenziata da
// un box giallo dietro (highlighter style). ~5 parole per gruppo.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 5;

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

export const HighlightBoxCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px 14px",
          maxWidth: "88%",
        }}
      >
        {activeGroup.words.map((w, i) => {
          const isActive = nowMs >= w.start && nowMs <= w.end;
          const enterFrame = Math.floor((w.start / 1000) * fps);
          const since = frame - enterFrame;
          const boxSpring = spring({
            frame: Math.max(0, since),
            fps,
            config: { damping: 14, stiffness: 220, mass: 0.5 },
            from: 0,
            to: 1,
          });
          const boxScale = interpolate(boxSpring, [0, 1], [0, 1]);

          return (
            <span
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 78,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: -1,
                color: isActive ? "#0A0A0A" : "#FFFFFF",
                textShadow: isActive ? "none" : "0 4px 16px rgba(0,0,0,0.7)",
                padding: "8px 16px",
              }}
            >
              {isActive && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "#FFE600",
                    transform: `scaleX(${boxScale})`,
                    transformOrigin: "left center",
                    zIndex: -1,
                    borderRadius: 4,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
                  }}
                />
              )}
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
