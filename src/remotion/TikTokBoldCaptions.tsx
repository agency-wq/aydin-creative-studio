// TikTok Bold captions: parole in capslock bianche, bordo nero spesso, una alla volta.
// Stile da TikTok/Reels classico: leggibile su qualsiasi sfondo grazie allo stroke.
// Mostra ~3 parole alla volta, con un piccolo pop+slide quando entra una nuova parola.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 3;

type Group = {
  start: number;
  end: number;
  words: RemotionWord[];
};

function buildGroups(words: RemotionWord[]): Group[] {
  const groups: Group[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_GROUP) {
    const chunk = words.slice(i, i + WORDS_PER_GROUP);
    if (chunk.length === 0) continue;
    groups.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      words: chunk,
    });
  }
  return groups;
}

export const TikTokBoldCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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

  // Pop entrata del gruppo intero
  const groupEnterFrame = Math.floor((activeGroup.start / 1000) * fps);
  const sinceGroupEnter = frame - groupEnterFrame;
  const groupScale = spring({
    frame: Math.max(0, sinceGroupEnter),
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.5 },
    from: 0.7,
    to: 1,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 280,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 22px",
          maxWidth: "90%",
          transform: `scale(${groupScale})`,
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
                fontFamily: "Inter, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif",
                fontSize: 96,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: -2,
                textTransform: "uppercase",
                color: "#FFFFFF",
                WebkitTextStroke: "8px #000000",
                paintOrder: "stroke fill",
                textShadow: isActive
                  ? "0 0 0 #000, 0 8px 0 #000, 0 0 28px rgba(0,0,0,0.9)"
                  : "0 6px 0 #000, 0 0 14px rgba(0,0,0,0.6)",
                transform: isActive ? "scale(1.08) translateY(-4px)" : "scale(1)",
                transition: "none",
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
