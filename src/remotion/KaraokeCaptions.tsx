// Karaoke-style captions: mostra ~5-7 parole alla volta, evidenziando
// la parola attualmente parlata in giallo. Pulito, stabile, leggibile.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 6;

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

  // Trova il gruppo attivo — con 200ms di margine per evitare flash vuoti tra gruppi
  const activeGroup =
    groups.find((g) => nowMs >= g.start && nowMs <= g.end + 200) ??
    [...groups].reverse().find((g) => nowMs >= g.start && nowMs <= g.end + 500) ??
    null;

  if (!activeGroup) return null;

  // Fade in/out del container per transizioni morbide
  const groupDurationMs = activeGroup.end - activeGroup.start;
  const fadeMs = Math.min(150, groupDurationMs * 0.15);
  const containerOpacity = interpolate(
    nowMs,
    [activeGroup.start, activeGroup.start + fadeMs, activeGroup.end - fadeMs, activeGroup.end + 150],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

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
          gap: "8px 14px",
          maxWidth: "88%",
          padding: "16px 24px",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(12px)",
          borderRadius: 16,
          opacity: containerOpacity,
        }}
      >
        {activeGroup.words.map((w, i) => {
          const isActive = nowMs >= w.start && nowMs <= w.end;
          const isPast = nowMs > w.end;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontFamily: "Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif",
                fontSize: 64,
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: -0.5,
                color: isActive ? "#FFD400" : isPast ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                textShadow: isActive
                  ? "0 2px 12px rgba(255,212,0,0.5)"
                  : "0 2px 8px rgba(0,0,0,0.4)",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                transformOrigin: "center bottom",
                transition: "color 0.1s, transform 0.1s, text-shadow 0.1s",
                paintOrder: "stroke fill",
                WebkitTextStroke: "1.5px rgba(0,0,0,0.3)",
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
