// Composition principale: avatar HeyGen come traccia base + cutaway sequences
// + captions burned-in (Karaoke style).
//
// Cutaway possibili:
//   - clipKind="broll" -> MP4 esterno con effetti cinematic (CinematicShot)
//   - clipKind="motion-graphics" -> Remotion template programmatico inline
//     (MotionGraphicsClip wrapper che dispatcha al template + theme)
//
// Transizioni: ogni cutaway entra/esce con una transizione CapCut-style scelta
// deterministicamente dal picker (vedi motion-graphics/transitions/). Le 6
// presentation disponibili (striped-slam, zoom-punch, diagonal-reveal, color-burst,
// vertical-shutter, glitch-slam) sono adattate dal catalogo Ashad e parametrizzate
// dai colori del theme corrente, cosi le transizioni "firmano" la palette del
// preset MG attivo.
//
// Audio: usato dall'avatar HeyGen (l'audio dell'<OffthreadVideo> base e sempre attivo).
// I cutaway sono muted/silent (sono solo overlay video).

import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import type { MainVideoProps, RemotionWord } from "./types";
import { KaraokeCaptions } from "./KaraokeCaptions";
import { TikTokBoldCaptions } from "./TikTokBoldCaptions";
import { WordStackCaptions } from "./WordStackCaptions";
import { Pop3DCaptions } from "./Pop3DCaptions";
import { MinimalCaptions } from "./MinimalCaptions";
import { BeastModeCaptions } from "./BeastModeCaptions";
import { EditorialCaptions } from "./EditorialCaptions";
import { GlowCaptions } from "./GlowCaptions";
import { TypewriterCaptions } from "./TypewriterCaptions";
import { HighlightBoxCaptions } from "./HighlightBoxCaptions";
import { SubtitleBarCaptions } from "./SubtitleBarCaptions";
import { ComicCaptions } from "./ComicCaptions";
import { CinematicShot, pickVariant } from "./CinematicShot";
import { MotionGraphicsClip } from "./motion-graphics/MotionGraphicsClip";
import { CutawayWithTransitions } from "./motion-graphics/transitions";
import { getTheme } from "./motion-graphics/themes";

// Dispatcher: nome del componente captions (dal DB) -> componente React.
// I preset non ancora implementati fanno fallback a Karaoke (silenzioso, per
// non rompere il render, ma il warning e visibile in console del worker).
function CaptionsRenderer({
  preset,
  words,
}: {
  preset: string;
  words: RemotionWord[];
}) {
  switch (preset) {
    case "Karaoke":
    case "karaoke": // legacy lowercase
      return <KaraokeCaptions words={words} />;
    case "TikTokBold":
      return <TikTokBoldCaptions words={words} />;
    case "WordStack":
      return <WordStackCaptions words={words} />;
    case "Pop3D":
    case "pop": // legacy lowercase
      return <Pop3DCaptions words={words} />;
    case "Minimal":
    case "minimal": // legacy lowercase
      return <MinimalCaptions words={words} />;
    case "BeastMode":
      return <BeastModeCaptions words={words} />;
    case "Editorial":
      return <EditorialCaptions words={words} />;
    case "Glow":
      return <GlowCaptions words={words} />;
    case "Typewriter":
      return <TypewriterCaptions words={words} />;
    case "HighlightBox":
      return <HighlightBoxCaptions words={words} />;
    case "SubtitleBar":
      return <SubtitleBarCaptions words={words} />;
    case "Comic":
      return <ComicCaptions words={words} />;
    default:
      console.warn(`[MainVideo] captions preset sconosciuto "${preset}", fallback Karaoke`);
      return <KaraokeCaptions words={words} />;
  }
}

export const calculateMetadata: CalculateMetadataFunction<MainVideoProps> = ({ props }) => {
  const fps = props.fps ?? 30;
  const durationInFrames = Math.max(1, Math.ceil((props.durationMs / 1000) * fps));
  return {
    durationInFrames,
    fps,
    width: props.width ?? 1080,
    height: props.height ?? 1920,
  };
};

// Volume musica COSTANTE per tutto il video. Il duckingVolume pianificato
// dall'AI Director (tipicamente 0.15-0.20) viene usato come volume fisso.
// Niente automazione up/down che suonava male: meglio un volume basso e
// uniforme che non copre il parlato.

export const MainVideo: React.FC<MainVideoProps> = ({
  avatarVideoUrl,
  segments,
  words,
  captionPreset,
  music,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  // Volume costante basso: la musica non deve MAI coprire la voce dell'avatar.
  // Il duckingVolume pianificato dall'AI Director è tipicamente 0.15-0.25, ma
  // in pratica serve molto più basso. Usiamo il 40% del duckingVolume
  // pianificato con floor a 0.08 per sicurezza.
  const musicVolume = Math.min(0.12, (music?.duckingVolume ?? 0.15) * 0.4);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Layer 1: avatar HeyGen full-screen (sempre presente, fornisce l'audio) */}
      <AbsoluteFill>
        <OffthreadVideo
          src={avatarVideoUrl.startsWith("http") ? avatarVideoUrl : staticFile(avatarVideoUrl)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </AbsoluteFill>

      {/* Layer 1b: musica background a volume costante basso. Non facciamo
          ducking (alzare/abbassare) perche' suonava male con transizioni rapide.
          `music.url` e' un path relativo a public/ -> staticFile(). */}
      {music && (
        <Audio
          src={music.url.startsWith("http") ? music.url : staticFile(music.url)}
          volume={musicVolume}
        />
      )}

      {/* Layer 2: cutaway overlay (motion graphics + b-roll) — con TransitionSeries */}
      {(() => {
        // Conta separatamente broll e MG per assegnare indici di varianti
        let brollCutawayIndex = 0;
        let mgCutawayIndex = 0;
        let totalCutawayIndex = 0;
        return segments.map((seg, i) => {
          if (seg.type !== "CUTAWAY") return null;
          const startFrame = Math.floor((seg.startMs / 1000) * fps);
          const endFrame = Math.ceil((seg.endMs / 1000) * fps);
          const rawLenFrames = Math.max(1, endFrame - startFrame);
          const lenFrames = Math.max(1, Math.min(rawLenFrames, durationInFrames - startFrame));
          // Skip segmenti troppo corti per essere visibili (< 3 frame = 0.1s)
          if (lenFrames < 3 || startFrame >= durationInFrames) return null;
          const cutawayIdx = totalCutawayIndex++;

          if (seg.clipKind === "broll") {
            const variant = pickVariant(brollCutawayIndex++);
            // B-roll usa il theme di default (VOX) per la palette transizione
            // perche non ha un theme MG associato.
            const theme = getTheme(null);
            return (
              <Sequence key={`cut-${i}`} from={startFrame} durationInFrames={lenFrames}>
                <CutawayWithTransitions
                  totalFrames={lenFrames}
                  theme={theme}
                  cutawayIndex={cutawayIdx}
                >
                  <CinematicShot src={seg.clipUrl} variant={variant} muted />
                </CutawayWithTransitions>
              </Sequence>
            );
          }

          // motion-graphics: MG dinamica con RenderSpec (CSS/SVG/animazioni)
          const cameraIdx = mgCutawayIndex++;
          const theme = getTheme(seg.themeName);
          return (
            <Sequence key={`cut-${i}`} from={startFrame} durationInFrames={lenFrames}>
              <CutawayWithTransitions
                totalFrames={lenFrames}
                theme={theme}
                cutawayIndex={cutawayIdx}
              >
                <MotionGraphicsClip
                  description={seg.description}
                  renderSpec={seg.renderSpec}
                  themeName={seg.themeName}
                  cameraIndex={cameraIdx}
                />
              </CutawayWithTransitions>
            </Sequence>
          );
        });
      })()}

      {/* Layer 3: captions burned-in (dispatcher in base al preset selezionato) */}
      <CaptionsRenderer preset={captionPreset} words={words} />
    </AbsoluteFill>
  );
};
