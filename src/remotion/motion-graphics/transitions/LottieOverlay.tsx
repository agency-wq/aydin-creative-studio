// Wrapper Lottie per usare animazioni esportate da After Effects (Bodymovin)
// dentro Remotion. Carica il JSON da public/lottie/<name>.json (oppure URL
// remoto) e lo rende fullscreen come overlay.
//
// Use case principale: effetti che sarebbe troppo costoso reimplementare in
// React (newspaper spin, particle bursts, light leaks complessi, ink reveal),
// scaricati gratis da LottieFiles e droppati in webapp/public/lottie/.
//
// Pattern di import: usa delayRender + continueRender per garantire che il
// JSON sia caricato prima del primo frame.
//
// Ref: https://www.remotion.dev/docs/lottie/remote

import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { Lottie, type LottieAnimationData } from "@remotion/lottie";

type LottieOverlayProps = {
  /**
   * Path al file JSON. Puo essere:
   *   - relativo: "lottie/newspaper-spin.json" -> staticFile("lottie/newspaper-spin.json")
   *   - URL remoto assoluto: "https://...json"
   */
  src: string;
  /** Loop l'animazione (default false) */
  loop?: boolean;
  /** Velocita di playback (default 1) */
  playbackRate?: number;
  /** Stile aggiuntivo (es. mixBlendMode: "screen" per glow) */
  style?: React.CSSProperties;
};

export const LottieOverlay: React.FC<LottieOverlayProps> = ({
  src,
  loop = false,
  playbackRate = 1,
  style,
}) => {
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender(`Loading lottie: ${src}`));

  useEffect(() => {
    const url = src.startsWith("http") ? src : staticFile(src);
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setAnimationData(data as LottieAnimationData);
        continueRender(handle);
      })
      .catch((err) => {
        console.error(`[LottieOverlay] Failed to load ${src}:`, err);
        continueRender(handle);
      });
  }, [src, handle]);

  if (!animationData) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", ...style }}>
      <Lottie
        animationData={animationData}
        loop={loop}
        playbackRate={playbackRate}
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};
