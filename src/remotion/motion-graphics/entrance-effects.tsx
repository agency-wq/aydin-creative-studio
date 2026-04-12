// Entrance effects — animazioni d'ingresso a livello wrapper che avvolgono
// qualsiasi template MG senza modificarlo. Aggiungono varietà visiva al modo
// in cui il contenuto appare sullo schermo.
//
// Ogni clip MG riceve un entrance effect DIVERSO (deterministico per clipIndex)
// così nello stesso video non ci sono mai due entrate uguali consecutive.
//
// NOTA: questi sono ADDIZIONALI rispetto alle soft transitions di
// CutawayWithTransitions.tsx (quelle controllano come il cutaway appare dal
// punto di vista del layer compositing). Gli entrance effects agiscono sul
// CONTENUTO INTERNO del cutaway.

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  spring,
} from "remotion";

export type EntranceEffectType =
  | "none"              // nessun effetto extra (il template fa la sua animazione)
  | "clip-reveal-right" // reveal orizzontale da sinistra a destra (clip-path)
  | "clip-reveal-up"    // reveal verticale dal basso verso l'alto
  | "scale-rotate"      // scala da 0.7 + leggera rotazione → 1.0 + 0deg
  | "blur-deblur"       // blur 20px → 0px con fade-in rapido
  | "split-horizontal"  // due metà si separano rivelando il contenuto
  | "elastic-drop"      // cade dall'alto con bounce elastico
  | "iris-open"         // cerchio che si espande dal centro (clip-path circle)
  | "glitch-flash"      // flash bianco rapido + leggero shift RGB
  | "venetian-blinds";  // strisce orizzontali che si aprono come veneziane

const ALL_EFFECTS: EntranceEffectType[] = [
  "none",
  "clip-reveal-right",
  "clip-reveal-up",
  "scale-rotate",
  "blur-deblur",
  "split-horizontal",
  "elastic-drop",
  "iris-open",
  "glitch-flash",
  "venetian-blinds",
];

/**
 * Seleziona deterministicamente un entrance effect per un clip.
 * Usa clipIndex + offset per garantire varietà senza random.
 */
export function pickEntranceEffect(clipIndex: number): EntranceEffectType {
  // Offset 1 per saltare "none" — lo usiamo solo se esplicitamente richiesto
  return ALL_EFFECTS[1 + (clipIndex % (ALL_EFFECTS.length - 1))];
}

type Props = {
  effect: EntranceEffectType;
  children: React.ReactNode;
};

/**
 * Wrapper che applica l'entrance effect al contenuto figlio.
 * Dura i primi ~15-20 frame, poi il contenuto resta visibile normalmente.
 */
export const EntranceEffect: React.FC<Props> = ({ effect, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  if (effect === "none") {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  switch (effect) {
    case "clip-reveal-right":
      return <ClipRevealRight frame={frame}>{children}</ClipRevealRight>;
    case "clip-reveal-up":
      return <ClipRevealUp frame={frame}>{children}</ClipRevealUp>;
    case "scale-rotate":
      return <ScaleRotate frame={frame} fps={fps}>{children}</ScaleRotate>;
    case "blur-deblur":
      return <BlurDeblur frame={frame}>{children}</BlurDeblur>;
    case "split-horizontal":
      return <SplitHorizontal frame={frame}>{children}</SplitHorizontal>;
    case "elastic-drop":
      return <ElasticDrop frame={frame} fps={fps}>{children}</ElasticDrop>;
    case "iris-open":
      return <IrisOpen frame={frame}>{children}</IrisOpen>;
    case "glitch-flash":
      return <GlitchFlash frame={frame}>{children}</GlitchFlash>;
    case "venetian-blinds":
      return <VenetianBlinds frame={frame}>{children}</VenetianBlinds>;
    default:
      return <AbsoluteFill>{children}</AbsoluteFill>;
  }
};

// =============================================================================
// Effect implementations
// =============================================================================

type EffectProps = { frame: number; fps?: number; children: React.ReactNode };

/** Reveal da sinistra a destra con clip-path */
const ClipRevealRight: React.FC<EffectProps> = ({ frame, children }) => {
  const reveal = interpolate(frame, [0, 18], [0, 100], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill
      style={{
        clipPath: `inset(0 ${100 - reveal}% 0 0)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Reveal dal basso verso l'alto con clip-path */
const ClipRevealUp: React.FC<EffectProps> = ({ frame, children }) => {
  const reveal = interpolate(frame, [0, 16], [0, 100], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill
      style={{
        clipPath: `inset(${100 - reveal}% 0 0 0)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Scala da 0.7 + rotazione -5deg → 1.0 + 0deg con spring */
const ScaleRotate: React.FC<EffectProps> = ({ frame, fps = 30, children }) => {
  const sp = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.8 },
  });
  const scale = interpolate(sp, [0, 1], [0.7, 1]);
  const rotate = interpolate(sp, [0, 1], [-5, 0]);
  const opacity = interpolate(sp, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "center center",
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Blur 20px → 0 con fade-in rapido */
const BlurDeblur: React.FC<EffectProps> = ({ frame, children }) => {
  const blur = interpolate(frame, [0, 16], [20, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 16], [1.08, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        filter: `blur(${blur}px)`,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Due metà (sopra/sotto) che si separano rivelando il contenuto */
const SplitHorizontal: React.FC<EffectProps> = ({ frame, children }) => {
  const splitProgress = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Le due metà di "copertura" scompaiono
  const topY = interpolate(splitProgress, [0, 1], [0, -52]);
  const bottomY = interpolate(splitProgress, [0, 1], [0, 52]);
  const coverOpacity = interpolate(splitProgress, [0.7, 1], [1, 0], { extrapolateRight: "clamp" });

  const contentOpacity = interpolate(frame, [2, 10], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: contentOpacity }}>{children}</AbsoluteFill>
      {/* Top cover */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "50%",
          backgroundColor: "#000",
          transform: `translateY(${topY}%)`,
          opacity: coverOpacity,
          zIndex: 10,
        }}
      />
      {/* Bottom cover */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "50%",
          backgroundColor: "#000",
          transform: `translateY(${bottomY}%)`,
          opacity: coverOpacity,
          zIndex: 10,
        }}
      />
    </AbsoluteFill>
  );
};

/** Cade dall'alto con bounce elastico */
const ElasticDrop: React.FC<EffectProps> = ({ frame, fps = 30, children }) => {
  const sp = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 160, mass: 0.7 },
  });
  const translateY = interpolate(sp, [0, 1], [-120, 0]);
  const opacity = interpolate(sp, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        transform: `translateY(${translateY}%)`,
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Cerchio che si espande dal centro (iris wipe) */
const IrisOpen: React.FC<EffectProps> = ({ frame, children }) => {
  const radius = interpolate(frame, [0, 20], [0, 150], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        clipPath: `circle(${radius}% at 50% 50%)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Flash bianco rapido + leggero RGB shift */
const GlitchFlash: React.FC<EffectProps> = ({ frame, children }) => {
  // Flash bianco nei primi 3 frame
  const flashOpacity = interpolate(frame, [0, 1, 3], [0, 0.8, 0], { extrapolateRight: "clamp" });

  // RGB shift nei primi 8 frame (effetto glitch sottile)
  const shift = frame < 8
    ? interpolate(frame, [1, 4, 8], [6, -3, 0], { extrapolateRight: "clamp" })
    : 0;

  // Contenuto opacity
  const contentOpacity = interpolate(frame, [1, 5], [0, 1], { extrapolateRight: "clamp" });

  // Micro-shake nei primi 6 frame
  const shakeX = frame < 6 ? Math.sin(frame * 8) * (3 - frame * 0.5) : 0;
  const shakeY = frame < 6 ? Math.cos(frame * 6) * (2 - frame * 0.3) : 0;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: contentOpacity,
          transform: `translate(${shakeX}px, ${shakeY}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
      {/* Flash overlay */}
      <AbsoluteFill
        style={{
          backgroundColor: "#FFFFFF",
          opacity: flashOpacity,
          zIndex: 10,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

/** Strisce orizzontali che si aprono come veneziane */
const VenetianBlinds: React.FC<EffectProps> = ({ frame, children }) => {
  const blindCount = 8;
  const progress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const contentOpacity = interpolate(frame, [4, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: contentOpacity }}>{children}</AbsoluteFill>
      {/* Blind strips */}
      {Array.from({ length: blindCount }, (_, i) => {
        const stagger = i * 0.08;
        const blindProgress = interpolate(progress, [stagger, stagger + 0.6], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scaleY = interpolate(blindProgress, [0, 1], [1, 0]);
        const stripH = 100 / blindCount;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${i * stripH}%`,
              height: `${stripH}%`,
              backgroundColor: "#000",
              transform: `scaleY(${scaleY})`,
              transformOrigin: i % 2 === 0 ? "top" : "bottom",
              zIndex: 10,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
