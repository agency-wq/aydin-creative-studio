// Typewriter captions: la frase si scrive carattere per carattere con un
// cursore lampeggiante. ~6 parole per gruppo. Look "command line".

import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

export const TypewriterCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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

  const fullText = activeGroup.words.map((w) => w.word).join(" ");
  const groupDurationMs = Math.max(400, activeGroup.end - activeGroup.start);
  const typingDuration = Math.min(groupDurationMs * 0.55, 1400); // termina di scrivere a 55%
  const progress = interpolate(
    nowMs,
    [activeGroup.start, activeGroup.start + typingDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const charCount = Math.floor(fullText.length * progress);
  const visibleText = fullText.slice(0, charCount);

  // Cursor blink (8 fps)
  const cursorVisible = Math.floor(frame / 8) % 2 === 0;

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
          padding: "20px 32px",
          background: "rgba(0,0,0,0.75)",
          borderRadius: 6,
          border: "2px solid rgba(0,255,150,0.4)",
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
          fontSize: 56,
          fontWeight: 600,
          lineHeight: 1.3,
          letterSpacing: 0,
          color: "#00FF96",
          textShadow: "0 0 14px rgba(0,255,150,0.5)",
          textAlign: "left",
        }}
      >
        {visibleText}
        <span style={{ opacity: cursorVisible ? 1 : 0 }}>▎</span>
      </div>
    </AbsoluteFill>
  );
};
