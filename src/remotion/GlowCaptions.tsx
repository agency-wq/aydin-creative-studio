// Glow captions: testo bianco con neon glow ciano. ~3 parole per gruppo,
// fontSize adatto a 1080px (9:16), parola attiva con extra glow + scale.
// Transizione fluida: ogni gruppo ha fade-in + fade-out per evitare scatti.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { RemotionWord } from "./types";

const WORDS_PER_GROUP = 3;
const FADE_FRAMES = 6; // ~200ms @30fps

type Group = { start: number; end: number; words: RemotionWord[] };

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

const GLOW_ACTIVE =
  "0 0 12px #00E5FF, 0 0 30px #00B8D9, 0 0 50px rgba(0,229,255,0.45), 0 4px 12px rgba(0,0,0,0.7)";
const GLOW_IDLE =
  "0 0 6px rgba(255,255,255,0.4), 0 3px 10px rgba(0,0,0,0.6)";

export const GlowCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  if (!words || words.length === 0) return null;

  const groups = buildGroups(words);

  // Trova il gruppo attivo (con un piccolo margine per overlap fluido)
  const activeGroup =
    groups.find((g) => nowMs >= g.start && nowMs <= g.end) ??
    [...groups].reverse().find((g) => nowMs >= g.start && nowMs <= g.end + 300) ??
    null;
  if (!activeGroup) return null;

  // Fade IN all'ingresso del gruppo
  const enterFrame = Math.floor((activeGroup.start / 1000) * fps);
  const fadeIn = interpolate(frame, [enterFrame, enterFrame + FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Fade OUT all'uscita del gruppo
  const exitFrame = Math.ceil((activeGroup.end / 1000) * fps);
  const fadeOut = interpolate(frame, [exitFrame - FADE_FRAMES, exitFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const opacity = Math.min(fadeIn, fadeOut);

  // Leggero slide-up all'ingresso
  const translateY = interpolate(frame, [enterFrame, enterFrame + FADE_FRAMES], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

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
          maxWidth: "88%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 14px",
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {activeGroup.words.map((w, i) => {
          const isActive = nowMs >= w.start && nowMs <= w.end;
          // Progresso di attivazione per transizione smooth
          const wordEnterF = Math.floor((w.start / 1000) * fps);
          const wordExitF = Math.ceil((w.end / 1000) * fps);
          const activation = interpolate(
            frame,
            [wordEnterF - 2, wordEnterF, wordExitF, wordExitF + 2],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const scale = 1 + activation * 0.08;

          return (
            <span
              key={i}
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 58,
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: -0.5,
                textTransform: "uppercase",
                color: isActive ? "#E0FFFF" : "#FFFFFF",
                textShadow: isActive ? GLOW_ACTIVE : GLOW_IDLE,
                transform: `scale(${scale})`,
                transition: "color 0.1s, text-shadow 0.1s",
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
