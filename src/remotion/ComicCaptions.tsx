// Comic captions: stile fumetto/comic book — testo nero in box bianco con
// bordo nero, font marker. ~4 parole per gruppo con split intelligente,
// rotazione sottile, pop-in + fade-out smooth.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 4;

type Group = { start: number; end: number; words: RemotionWord[]; idx: number };

/**
 * Raggruppa le parole in chunk intelligenti che rispettano la punteggiatura.
 * Se una parola finisce con . ! ? , si chiude il gruppo lì anche se non ha
 * raggiunto WORDS_PER_GROUP, così non si tagliano le frasi a metà.
 */
function buildGroups(words: RemotionWord[]): Group[] {
  const groups: Group[] = [];
  let chunk: RemotionWord[] = [];
  let idx = 0;

  for (let i = 0; i < words.length; i++) {
    chunk.push(words[i]);
    const w = words[i].word.trim();
    const endsWithPunct = /[.!?,;:]$/.test(w);
    const atLimit = chunk.length >= WORDS_PER_GROUP;

    if (atLimit || endsWithPunct || i === words.length - 1) {
      if (chunk.length > 0) {
        groups.push({
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          words: [...chunk],
          idx,
        });
        idx++;
        chunk = [];
      }
    }
  }
  return groups;
}

// Tilt deterministico più sottile (max ±2.5° invece di ±5°)
function tiltFor(idx: number): number {
  const tilts = [-1.5, 1, -0.5, 2, -1, 0.5, -2, 1.5];
  return tilts[idx % tilts.length];
}

export const ComicCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
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

  // Pop-in spring
  const enterFrame = Math.floor((activeGroup.start / 1000) * fps);
  const since = frame - enterFrame;
  const popSpring = spring({
    frame: Math.max(0, since),
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
    from: 0,
    to: 1,
  });
  const scale = interpolate(popSpring, [0, 0.6, 1], [0.5, 1.06, 1]);

  // Fade-out smooth negli ultimi 4 frame prima della fine del gruppo
  const endFrame = Math.floor((activeGroup.end / 1000) * fps);
  const framesUntilEnd = endFrame - frame;
  const exitOpacity = interpolate(framesUntilEnd, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const tilt = tiltFor(activeGroup.idx);
  const text = activeGroup.words.map((w) => w.word).join(" ");

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
          padding: "18px 32px",
          background: "#FFFFFF",
          border: "5px solid #1A1A1A",
          borderRadius: 14,
          boxShadow: "6px 6px 0 #1A1A1A, 8px 8px 16px rgba(0,0,0,0.3)",
          transform: `scale(${scale}) rotate(${tilt}deg)`,
          opacity: exitOpacity,
          fontFamily: "'Bangers', 'Comic Sans MS', Impact, sans-serif",
          fontSize: 62,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#1A1A1A",
          textAlign: "center",
          maxWidth: "88%",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
