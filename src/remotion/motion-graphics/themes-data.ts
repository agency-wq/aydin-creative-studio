// Themes data — palette/tipografia/motion style per ogni stile MG.
// Questo file e PURO (no import Remotion / no side-effects) cosi puo essere
// importato sia dal player Remotion che dal frontend Next.js (form, dashboard).
// Il file `themes.ts` aggiunge il side-effect di pre-caricare i font Google
// e re-esporta tutto da qui.

export type MGTheme = {
  name: string;
  /** Background del cutaway (sostituisce l'avatar quando la MG e fullscreen) */
  bgColor: string;
  /** Background secondario (gradient stop / overlay) */
  bgColorSecondary?: string;
  /** Colore principale del testo */
  textColor: string;
  /** Colore di accent per highlight, numeri grandi, callout */
  accentColor: string;
  /** Colore secondario di supporto */
  supportColor: string;
  /** Font family per il testo grande (titoli, big number) */
  displayFont: string;
  /** Font family per il body / descrizioni */
  bodyFont: string;
  /** Peso del font display (es. 800, 900) */
  displayFontWeight: number;
  /** Letter spacing per i titoli (es. -0.02em per condensed) */
  displayLetterSpacing: string;
  /** Border radius "signature" per cards/badges */
  borderRadius: number;
  /** Stile dell'animazione di entrata: 'snap' (cut deciso) | 'smooth' (fade morbido) | 'bounce' (scale-bounce) */
  motionStyle: "snap" | "smooth" | "bounce";
  /** Colore della "barra accent" superiore nei lower-third / cards (firmato per quel preset) */
  accentBarColor?: string;
  /** Se true: usa pop-in con overshoot (scale 0 -> 1.1 -> 1.0) invece di spring normale */
  popInOvershoot?: boolean;
  /** Lista di colori secondari extra per badge/icone (Infographics Show ha la palette pastello) */
  extraColors?: string[];
};

export const MG_THEMES: Record<string, MGTheme> = {
  // ===========================================================================
  // VOX — explainer cinematico, palette nero/bianco/giallo elettrico
  // ===========================================================================
  VOX: {
    name: "VOX",
    bgColor: "#0A0A0A",
    bgColorSecondary: "#1A1A1A",
    textColor: "#FFFFFF",
    accentColor: "#FFD400",
    supportColor: "#999999",
    displayFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 900,
    displayLetterSpacing: "-0.03em",
    borderRadius: 8,
    motionStyle: "snap",
  },

  // ===========================================================================
  // Ali Abdaal — minimal, palette bianco/blu pastello + serif elegante
  // ===========================================================================
  "Ali Abdaal": {
    name: "Ali Abdaal",
    bgColor: "#F7F8FA",
    bgColorSecondary: "#FFFFFF",
    textColor: "#1A2238",
    accentColor: "#5B8DEE",
    supportColor: "#6B7280",
    displayFont: "Georgia, serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 700,
    displayLetterSpacing: "-0.02em",
    borderRadius: 16,
    motionStyle: "smooth",
  },

  // ===========================================================================
  // Dan Koe — minimalist dark con accent verde menta
  // ===========================================================================
  "Dan Koe": {
    name: "Dan Koe",
    bgColor: "#0F1419",
    bgColorSecondary: "#1A2028",
    textColor: "#E8EAED",
    accentColor: "#7FE3C5",
    supportColor: "#8B95A1",
    displayFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 800,
    displayLetterSpacing: "-0.02em",
    borderRadius: 4,
    motionStyle: "smooth",
  },

  // ===========================================================================
  // Kurzgesagt — flat 2D, palette blu profondo + arancione + bianco
  // ===========================================================================
  Kurzgesagt: {
    name: "Kurzgesagt",
    bgColor: "#1A2B5F",
    bgColorSecondary: "#0F1A3D",
    textColor: "#FFFFFF",
    accentColor: "#FF8C42",
    supportColor: "#7AB8E6",
    displayFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 800,
    displayLetterSpacing: "-0.01em",
    borderRadius: 24,
    motionStyle: "smooth",
  },

  // ===========================================================================
  // MrBeast — energico, rosso/nero/bianco, font display gigante
  // ===========================================================================
  MrBeast: {
    name: "MrBeast",
    bgColor: "#0A0A0A",
    bgColorSecondary: "#1F0000",
    textColor: "#FFFFFF",
    accentColor: "#FF0033",
    supportColor: "#FFD700",
    displayFont: "Impact, 'Inter', sans-serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 900,
    displayLetterSpacing: "-0.04em",
    borderRadius: 0,
    motionStyle: "bounce",
  },

  // ===========================================================================
  // The Infographics Show — flat vector cartoon, bianco + red/teal + palette pastello
  // Basato su analisi vision dei frame reference (style-specs/the-infographics-show.json)
  // ===========================================================================
  "The Infographics Show": {
    name: "The Infographics Show",
    bgColor: "#FFFFFF",
    bgColorSecondary: "#F5F5F5",
    textColor: "#2B2B2B",
    accentColor: "#FF6B6B",
    supportColor: "#4ECDC4",
    displayFont: "Montserrat, sans-serif",
    bodyFont: "Montserrat, sans-serif",
    displayFontWeight: 800,
    displayLetterSpacing: "-0.01em",
    borderRadius: 12,
    motionStyle: "snap",
    accentBarColor: "#FF6B6B",
    popInOvershoot: true,
    extraColors: ["#FFE66D", "#A8E6CF", "#FF8B94", "#C7CEEA", "#FFA07A"],
  },

  // ===========================================================================
  // Skymography — cinematic moody, palette blu notte + arancione caldo
  // ===========================================================================
  Skymography: {
    name: "Skymography",
    bgColor: "#0B1A2E",
    bgColorSecondary: "#020812",
    textColor: "#F5E9D7",
    accentColor: "#E89B5A",
    supportColor: "#6B95C8",
    displayFont: "Georgia, serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 700,
    displayLetterSpacing: "-0.01em",
    borderRadius: 2,
    motionStyle: "smooth",
  },

  // ===========================================================================
  // Aevy TV — vibrant pastel, viola + magenta + ciano
  // ===========================================================================
  "Aevy TV": {
    name: "Aevy TV",
    bgColor: "#1A0E2E",
    bgColorSecondary: "#2D1845",
    textColor: "#FFFFFF",
    accentColor: "#FF4FB8",
    supportColor: "#6BE7FF",
    displayFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 900,
    displayLetterSpacing: "-0.03em",
    borderRadius: 20,
    motionStyle: "bounce",
  },

  // ===========================================================================
  // Johnny Harris — documentary, beige + rosso + nero (palette mappa vintage)
  // ===========================================================================
  "Johnny Harris": {
    name: "Johnny Harris",
    bgColor: "#1C1814",
    bgColorSecondary: "#0E0B08",
    textColor: "#F5EBD8",
    accentColor: "#D9542B",
    supportColor: "#A8956B",
    displayFont: "Georgia, serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 700,
    displayLetterSpacing: "-0.02em",
    borderRadius: 4,
    motionStyle: "smooth",
  },

  // ===========================================================================
  // TED-Ed — educational flat, palette rosso TED + giallo + bianco
  // ===========================================================================
  "TED-Ed": {
    name: "TED-Ed",
    bgColor: "#FFFFFF",
    bgColorSecondary: "#F5F5F5",
    textColor: "#1A1A1A",
    accentColor: "#E62B1E",
    supportColor: "#FFB81C",
    displayFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    displayFontWeight: 800,
    displayLetterSpacing: "-0.02em",
    borderRadius: 8,
    motionStyle: "smooth",
  },
};

export const DEFAULT_THEME: MGTheme = MG_THEMES.VOX;

export function getTheme(name: string | null | undefined): MGTheme {
  if (!name) return DEFAULT_THEME;
  return MG_THEMES[name] ?? DEFAULT_THEME;
}

export function listThemeNames(): string[] {
  return Object.keys(MG_THEMES);
}
