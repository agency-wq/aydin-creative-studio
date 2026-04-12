// Karaoke-style captions: mostra ~5-7 parole alla volta, evidenziando
// la parola attualmente parlata in giallo. Spring scale-in sulla parola attiva.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 5; // quante parole mostrare per chunk

type Group = {
  start: number; // ms
  end: number; // ms
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

export const KaraokeCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  if (!words || words.length === 0) return null;

  const groups = buildGroups(words);
  // Trova il gruppo attivo (il primo che contiene nowMs, o l'ultimo se siamo dopo)
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
        paddingBottom: 220,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "12px 18px",
          maxWidth: "85%",
          padding: "20px 28px",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          borderRadius: 24,
        }}
      >
        {activeGroup.words.map((w, i) => {
          const isActive = nowMs >= w.start && nowMs <= w.end;
          const isPast = nowMs > w.end;

          // Spring scale solo quando entra
          const enterFrame = Math.floor((w.start / 1000) * fps);
          const sinceEnter = frame - enterFrame;
          const scale = isActive
            ? 1 +
              0.18 *
                spring({
                  frame: Math.max(0, sinceEnter),
                  fps,
                  config: { damping: 12, stiffness: 200, mass: 0.6 },
                  from: 0,
                  to: 1,
                })
            : 1;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontFamily: "Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif",
                fontSize: 78,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: -1,
                color: isActive ? "#FFD400" : isPast ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                textShadow: isActive
                  ? "0 6px 18px rgba(0,0,0,0.6), 0 0 24px rgba(255,212,0,0.4)"
                  : "0 4px 14px rgba(0,0,0,0.55)",
                transform: `scale(${scale})`,
                transformOrigin: "center bottom",
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
