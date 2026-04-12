// Preview SOLO delle transizioni: niente HeyGen, niente AssemblyAI, niente
// AI Director. Solo un layer "avatar finto" (gradient animato) sotto + N
// cutaway colorati che entrano/escono con le SOFT transitions della libreria.
//
// Mostra TUTTE le 12 varianti di soft-transitions.tsx in sequenza, una per
// cutaway, con etichetta del nome cosi si vede subito quale e' quale.
//
// Render:
//   pnpm exec remotion render src/remotion/index.ts TransitionsPreview \
//     ../output/transitions-preview.mp4

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CutawayWithTransitions } from "./motion-graphics/transitions/CutawayWithTransitions";
import { getTheme, MG_THEMES } from "./motion-graphics/themes";
import { SOFT_TRANSITIONS } from "./motion-graphics/transitions/soft-transitions";

const FPS = 30;
// Scheduling: intro MOLTO corto (0.3s) cosi il cutaway parte quasi subito;
// ogni cutaway dura 2.8s (per dare respiro al contenuto); gap 0.3s soltanto.
// 12 varianti x (2.8 + 0.3) + 0.3 intro + 0.6 outro = 38.1s
const CUTAWAY_SEC = 2.8;
const GAP_SEC = 0.3;
const INTRO_SEC = 0.3;
const OUTRO_SEC = 0.6;
const TOTAL_SEC = INTRO_SEC + SOFT_TRANSITIONS.length * (CUTAWAY_SEC + GAP_SEC) + OUTRO_SEC;
const TOTAL_FRAMES = Math.ceil(FPS * TOTAL_SEC);

// Theme name ciclato per dare colori diversi ad ogni cutaway
const THEME_CYCLE: string[] = [
  "VOX",
  "Kurzgesagt",
  "TED-Ed",
  "Dan Koe",
  "Aevy TV",
  "Johnny Harris",
  "MrBeast",
  "Skymography",
  "Ali Abdaal",
  "The Infographics Show",
  "VOX",
  "Kurzgesagt",
];

// Avatar fake: gradient animato che ruota tinte, vivace (saturo ~55%) cosi si
// vede subito anche nei gap tra un cutaway e l'altro. Non rimane mai nero.
const FakeAvatar: React.FC = () => {
  const frame = useCurrentFrame();
  const hue = (frame * 1.2) % 360;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 55%, 35%) 0%, hsl(${
          (hue + 80) % 360
        }, 60%, 22%) 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 40,
            fontWeight: 800,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: -1,
            textAlign: "center",
            lineHeight: 1.3,
            maxWidth: "75%",
            textShadow: "0 4px 30px rgba(0,0,0,0.5)",
          }}
        >
          AVATAR HEYGEN
          <br />
          <span style={{ fontSize: 22, opacity: 0.7, fontWeight: 500 }}>
            (placeholder · i cutaway appaiono sopra)
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Header permanente in alto: sempre visibile, cosi il video non sembra mai
// "vuoto" anche durante i gap. Mostra un titolo + il nome della transizione
// che sta per arrivare (o quella appena passata).
const PermanentHeader: React.FC = () => {
  const frame = useCurrentFrame();
  // Progresso nella sequenza di cutaway: quale stiamo mostrando?
  const startFrame = Math.floor(INTRO_SEC * FPS);
  const cycleFrames = Math.floor((CUTAWAY_SEC + GAP_SEC) * FPS);
  const rel = Math.max(0, frame - startFrame);
  const currentIndex = Math.min(
    SOFT_TRANSITIONS.length - 1,
    Math.floor(rel / cycleFrames)
  );
  const currentName = SOFT_TRANSITIONS[currentIndex]?.name ?? "—";

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: "flex-start",
        alignItems: "stretch",
        padding: "36px 36px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(0,0,0,0.55)",
          padding: "14px 22px",
          borderRadius: 14,
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: -0.3,
          }}
        >
          SOFT TRANSITIONS · DEMO
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, Menlo, monospace",
            fontSize: 18,
            fontWeight: 700,
            color: "#FFD400",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {currentName}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Cutaway content: gradient pieno + nome del theme + nome della transizione
type CutawayContentProps = {
  themeName: string;
  transitionName: string;
  transitionDescription: string;
  index: number;
};

const FakeCutaway: React.FC<CutawayContentProps> = ({
  themeName,
  transitionName,
  transitionDescription,
  index,
}) => {
  const theme = MG_THEMES[themeName] ?? MG_THEMES.VOX;
  const isLight =
    theme.bgColor === "#FFFFFF" || theme.bgColor === "#F5F5F5" || theme.bgColor === "#F7F8FA";
  const textColor = isLight ? theme.textColor : "#FFFFFF";

  return (
    <AbsoluteFill
      style={{
        background: theme.bgColorSecondary
          ? `linear-gradient(135deg, ${theme.bgColor} 0%, ${theme.bgColorSecondary} 100%)`
          : theme.bgColor,
      }}
    >
      {/* Accent bar firmata in alto se presente */}
      {theme.accentBarColor && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: theme.accentBarColor,
          }}
        />
      )}

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "0 60px",
        }}
      >
        {/* Index counter */}
        <div
          style={{
            fontFamily: "JetBrains Mono, Menlo, monospace",
            fontSize: 22,
            fontWeight: 700,
            color: textColor,
            opacity: 0.5,
            letterSpacing: 2,
          }}
        >
          {String(index + 1).padStart(2, "0")} / {String(SOFT_TRANSITIONS.length).padStart(2, "0")}
        </div>

        {/* Transition name (BIG) */}
        <div
          style={{
            fontFamily: theme.displayFont,
            fontWeight: theme.displayFontWeight,
            letterSpacing: theme.displayLetterSpacing,
            fontSize: 96,
            color: theme.accentColor,
            lineHeight: 0.95,
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {transitionName}
        </div>

        {/* Transition description */}
        <div
          style={{
            fontFamily: theme.bodyFont,
            fontSize: 26,
            fontWeight: 500,
            color: textColor,
            opacity: 0.8,
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.35,
          }}
        >
          {transitionDescription}
        </div>

        {/* Theme tag */}
        <div
          style={{
            marginTop: 12,
            padding: "8px 20px",
            backgroundColor: theme.accentColor,
            color: theme.bgColor,
            borderRadius: theme.borderRadius,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: theme.bodyFont,
          }}
        >
          theme · {theme.name}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TransitionsPreview: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Layer 1: avatar fake */}
      <FakeAvatar />

      {/* Layer 2: 12 cutaway, uno per ogni soft transition */}
      {SOFT_TRANSITIONS.map((transition, i) => {
        const startSec = INTRO_SEC + i * (CUTAWAY_SEC + GAP_SEC);
        const startFrame = Math.floor(startSec * fps);
        const lenFrames = Math.floor(CUTAWAY_SEC * fps);
        const themeName = THEME_CYCLE[i % THEME_CYCLE.length];
        const theme = getTheme(themeName);

        return (
          <Sequence
            key={`cut-${i}`}
            from={startFrame}
            durationInFrames={lenFrames}
          >
            <CutawayWithTransitions
              totalFrames={lenFrames}
              theme={theme}
              cutawayIndex={i}
            >
              <FakeCutaway
                themeName={themeName}
                transitionName={transition.name}
                transitionDescription={transition.description}
                index={i}
              />
            </CutawayWithTransitions>
          </Sequence>
        );
      })}

      {/* Layer 3: header permanente in alto (fix UX: niente piu' "vuoto") */}
      <PermanentHeader />

      {/* Layer 4: HUD timer in basso */}
      <TimerHud totalFrames={TOTAL_FRAMES} />
    </AbsoluteFill>
  );
};

const TimerHud: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const sec = (frame / FPS).toFixed(1);
  const totalSec = (totalFrames / FPS).toFixed(0);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          fontFamily: "JetBrains Mono, Menlo, monospace",
          fontSize: 26,
          fontWeight: 700,
          color: "#FFFFFF",
          background: "rgba(0,0,0,0.55)",
          padding: "10px 24px",
          borderRadius: 999,
          backdropFilter: "blur(10px)",
        }}
      >
        {sec}s / {totalSec}s
      </div>
    </AbsoluteFill>
  );
};

export const TRANSITIONS_PREVIEW_FPS = FPS;
export const TRANSITIONS_PREVIEW_FRAMES = TOTAL_FRAMES;
