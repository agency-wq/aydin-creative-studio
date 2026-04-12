// Barrel export per la libreria transizioni MG.
//
// Adapted from ashad001/remotion-transitions (MIT) — vedi presentations.tsx
// per le 6 TransitionPresentation.
//
// Pacchetti chiave installati a supporto:
//   - @remotion/transitions (TransitionSeries, linearTiming, springTiming)
//   - @remotion/lottie (per LottieOverlay con animazioni LottieFiles/Bodymovin)
//   - @remotion/light-leaks (LightLeak overlay WebGL — vedi MainVideo)
//
// Skill Claude Code di riferimento (gia installate globalmente):
//   - remotion-best-practices (ufficiale Remotion)
//   - remotion-transitions   (ashad001 — pattern + 6 transizioni base)
//   - remotion-templates     (ali-abassi — indice template community)

export { CutawayWithTransitions } from "./CutawayWithTransitions";
export { LottieOverlay } from "./LottieOverlay";
export { pickTransition, pickOutgoingTransition, type TransitionKit } from "./picker";
export {
  stripedSlam,
  zoomPunch,
  diagonalReveal,
  colorBurst,
  verticalShutter,
  glitchSlam,
} from "./presentations";
