// Word Stack captions: una sola parola gigante al centro dello schermo,
// in capslock, full screen. Cambia parola insieme alla pronuncia dell'avatar.
// Look molto cinematico/punk, ottimo per video con ritmo serrato.
//
// Animazione: ogni parola entra con un punch (scale 1.4 -> 1.0 + drop opacity)
// e nei suoi ultimi 80ms scala leggermente piu grande prima di uscire.

import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { RemotionWord } from "./types";

export const WordStackCaptions: React.FC<{ words: RemotionWord[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  if (!words || words.length === 0) return null;

  // Trova la parola attiva (quella attualmente parlata, o l'ultima passata)
  const activeIdx = (() => {
    for (let i = 0; i < words.length; i++) {
      if (nowMs >= words[i].start && nowMs <= words[i].end) return i;
    }
    // Fallback: ultima parola passata
    for (let i = words.length - 1; i >= 0; i--) {
      if (nowMs >= words[i].start) return i;
    }
    return -1;
  })();

  if (activeIdx < 0) return null;
  const w = words[activeIdx];

  // Punch in: spring scale all'inizio della parola
  const enterFrame = Math.floor((w.start / 1000) * fps);
  const sinceEnter = frame - enterFrame;
  const scale = spring({
    frame: Math.max(0, sinceEnter),
    fps,
    config: { damping: 14, stiffness: 240, mass: 0.6 },
    from: 1.4,
    to: 1.0,
  });

  // Fade-in iniziale rapidissimo (5 frame)
  const opacity = interpolate(sinceEnter, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pulizia: niente caratteri di punteggiatura attaccati
  const text = w.word.replace(/[.,;:!?]+$/, "").toUpperCase();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: "Inter, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif",
          fontSize: 220,
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: -6,
          color: "#FFFFFF",
          WebkitTextStroke: "10px #000000",
          paintOrder: "stroke fill",
          textShadow:
            "0 0 0 #000, 0 14px 0 #000, 0 0 60px rgba(0,0,0,0.95), 0 0 120px rgba(0,0,0,0.7)",
          transform: `scale(${scale})`,
          opacity,
          textAlign: "center",
          maxWidth: "90%",
          padding: "0 40px",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
