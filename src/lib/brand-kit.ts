// =============================================================================
// Brand Kit — Estrazione automatica brand identity da mockup con Claude Vision.
// =============================================================================
//
// Quando il cliente carica un mockup (copertina guida, lead magnet, prodotto),
// Claude Vision lo analizza ed estrae:
//   - Palette colori (accent, testo, sfondo, supporto)
//   - Stile font (serif/sans-serif, peso, mood)
//   - Nome prodotto visibile sul mockup
//   - Mood visivo (corporate, playful, elegant, energetic, minimal)
//
// Il brand kit viene salvato nel Client e usato per costruire un MGTheme
// dinamico al posto dei preset fissi (VOX, MrBeast, ecc.).

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { MGTheme } from "../remotion/motion-graphics/themes-data";

// =============================================================================
// Types
// =============================================================================

export type BrandKit = {
  /** Colore principale di accent/highlight */
  accentColor: string;
  /** Colore del testo principale */
  textColor: string;
  /** Colore di sfondo principale */
  bgColor: string;
  /** Colore di supporto (secondario) */
  supportColor: string;
  /** Sfondo secondario (per gradient) */
  bgColorSecondary?: string;
  /** Colori extra estratti dal mockup */
  extraColors?: string[];
  /** Stile font dominante */
  fontStyle: "sans-serif" | "serif" | "display" | "slab" | "handwritten";
  /** Peso visivo del font */
  fontWeight: "light" | "regular" | "bold" | "black";
  /** Mood visivo generale */
  mood: "corporate" | "playful" | "elegant" | "energetic" | "minimal" | "luxury" | "editorial";
  /** Border radius appropriato per lo stile (0 = sharp, 24 = rounded) */
  borderRadius: number;
  /** Stile motion appropriato */
  motionStyle: "snap" | "smooth" | "bounce";
  /** Nome del prodotto estratto dal mockup (se visibile) */
  productName?: string;
  /** Breve descrizione visiva del mockup */
  mockupDescription?: string;
};

// =============================================================================
// Anthropic client (condiviso)
// =============================================================================

let _client: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// =============================================================================
// Claude Vision — estrazione brand kit dal mockup
// =============================================================================

const VISION_SYSTEM_PROMPT = [
  "Sei un BRAND DESIGNER esperto. Analizzi immagini di prodotti (copertine libri, guide, lead magnet, packaging) ed estrai la brand identity visiva.",
  "",
  "Dall'immagine devi estrarre:",
  "1) COLORI: identifica i 4-6 colori dominanti e assegna i ruoli (accent, text, bg, support, extra)",
  "2) FONT STYLE: classifica lo stile tipografico dominante (sans-serif, serif, display, slab, handwritten)",
  "3) FONT WEIGHT: peso visivo dominante (light, regular, bold, black)",
  "4) MOOD: classifica il mood visivo (corporate, playful, elegant, energetic, minimal, luxury, editorial)",
  "5) BORDER RADIUS: quanto arrotondati sono gli elementi (0=sharp, 8=soft, 16=rounded, 24=pill)",
  "6) MOTION STYLE: che tipo di animazioni si adatterebbero (snap=decise, smooth=morbide, bounce=elastiche)",
  "7) PRODUCT NAME: il nome/titolo del prodotto se leggibile",
  "8) MOCKUP DESCRIPTION: breve descrizione dell'aspetto del mockup (10-20 parole)",
  "",
  "Ritorna SOLO JSON valido, nessun markdown, nessun preambolo:",
  "{",
  '  "accentColor": "#hex",',
  '  "textColor": "#hex",',
  '  "bgColor": "#hex",',
  '  "supportColor": "#hex",',
  '  "bgColorSecondary": "#hex",',
  '  "extraColors": ["#hex", "#hex"],',
  '  "fontStyle": "sans-serif|serif|display|slab|handwritten",',
  '  "fontWeight": "light|regular|bold|black",',
  '  "mood": "corporate|playful|elegant|energetic|minimal|luxury|editorial",',
  '  "borderRadius": 0-24,',
  '  "motionStyle": "snap|smooth|bounce",',
  '  "productName": "nome del prodotto o null",',
  '  "mockupDescription": "breve descrizione visiva del mockup"',
  "}",
].join("\n");

/**
 * Analizza un'immagine mockup con Claude Vision ed estrae il brand kit.
 */
export async function extractBrandKit(
  imageBuffer: Buffer,
  inputMimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  log?: (msg: string) => void
): Promise<BrandKit> {
  let mimeType = inputMimeType;
  const logger = log ?? (() => {});
  const client = getAnthropic();

  if (!client) {
    logger("brand-kit: ANTHROPIC_API_KEY mancante, uso brand kit default");
    return defaultBrandKit();
  }

  // Ridimensiona se > 4MB (limite Claude Vision = 5MB, teniamo margine)
  let processedBuffer = imageBuffer;
  if (imageBuffer.length > 4 * 1024 * 1024) {
    logger(`brand-kit: immagine troppo grande (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB), ridimensiono...`);
    try {
      processedBuffer = await sharp(imageBuffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      // Dopo il resize è sempre JPEG
      mimeType = "image/jpeg";
      logger(`brand-kit: ridimensionato a ${(processedBuffer.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      logger(`brand-kit: resize fallito (${(e as Error).message}), provo con originale`);
    }
  }

  const base64 = processedBuffer.toString("base64");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: VISION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Analizza questo mockup ed estrai il brand kit. Ritorna solo JSON.",
              },
            ],
          },
        ],
      });

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        logger(`brand-kit: nessun JSON nell'output (tentativo ${attempt + 1})`);
        continue;
      }

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(match[0]);
      } catch (e) {
        logger(`brand-kit: JSON parse fallito: ${(e as Error).message} (tentativo ${attempt + 1})`);
        continue;
      }

      const kit = validateBrandKit(raw);
      if (!kit) {
        logger(`brand-kit: validazione fallita (tentativo ${attempt + 1})`);
        continue;
      }

      logger(`brand-kit: OK — accent=${kit.accentColor} mood=${kit.mood} product="${kit.productName ?? "n/a"}"`);
      return kit;
    } catch (e) {
      logger(`brand-kit: errore API: ${(e as Error).message} (tentativo ${attempt + 1})`);
    }
  }

  logger("brand-kit: FALLBACK dopo 2 tentativi");
  return defaultBrandKit();
}

// =============================================================================
// Validation
// =============================================================================

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function validateBrandKit(raw: Record<string, unknown>): BrandKit | null {
  const accentColor = typeof raw.accentColor === "string" && HEX_RE.test(raw.accentColor)
    ? raw.accentColor : null;
  const textColor = typeof raw.textColor === "string" && HEX_RE.test(raw.textColor)
    ? raw.textColor : null;
  const bgColor = typeof raw.bgColor === "string" && HEX_RE.test(raw.bgColor)
    ? raw.bgColor : null;
  const supportColor = typeof raw.supportColor === "string" && HEX_RE.test(raw.supportColor)
    ? raw.supportColor : null;

  if (!accentColor || !textColor || !bgColor || !supportColor) return null;

  const bgColorSecondary = typeof raw.bgColorSecondary === "string" && HEX_RE.test(raw.bgColorSecondary)
    ? raw.bgColorSecondary : undefined;

  const extraColors = Array.isArray(raw.extraColors)
    ? (raw.extraColors as unknown[])
        .filter((c): c is string => typeof c === "string" && HEX_RE.test(c))
        .slice(0, 4)
    : undefined;

  const validFontStyles = new Set(["sans-serif", "serif", "display", "slab", "handwritten"]);
  const fontStyle = validFontStyles.has(raw.fontStyle as string)
    ? (raw.fontStyle as BrandKit["fontStyle"]) : "sans-serif";

  const validWeights = new Set(["light", "regular", "bold", "black"]);
  const fontWeight = validWeights.has(raw.fontWeight as string)
    ? (raw.fontWeight as BrandKit["fontWeight"]) : "bold";

  const validMoods = new Set(["corporate", "playful", "elegant", "energetic", "minimal", "luxury", "editorial"]);
  const mood = validMoods.has(raw.mood as string)
    ? (raw.mood as BrandKit["mood"]) : "corporate";

  const borderRadius = typeof raw.borderRadius === "number"
    ? Math.max(0, Math.min(24, Math.round(raw.borderRadius))) : 8;

  const validMotion = new Set(["snap", "smooth", "bounce"]);
  const motionStyle = validMotion.has(raw.motionStyle as string)
    ? (raw.motionStyle as BrandKit["motionStyle"]) : "smooth";

  const productName = typeof raw.productName === "string" && raw.productName.trim()
    ? raw.productName.trim() : undefined;

  const mockupDescription = typeof raw.mockupDescription === "string" && raw.mockupDescription.trim()
    ? raw.mockupDescription.trim().slice(0, 200) : undefined;

  return {
    accentColor, textColor, bgColor, supportColor,
    bgColorSecondary, extraColors,
    fontStyle, fontWeight, mood, borderRadius, motionStyle,
    productName, mockupDescription,
  };
}

// =============================================================================
// Brand Kit → MGTheme
// =============================================================================

/** Mappa font style → Google Fonts family */
const FONT_MAP: Record<BrandKit["fontStyle"], { display: string; body: string }> = {
  "sans-serif": { display: "Montserrat", body: "Inter" },
  "serif": { display: "Playfair Display", body: "Source Serif 4" },
  "display": { display: "Bebas Neue", body: "Inter" },
  "slab": { display: "Roboto Slab", body: "Roboto" },
  "handwritten": { display: "Caveat", body: "Inter" },
};

const WEIGHT_MAP: Record<BrandKit["fontWeight"], number> = {
  light: 400,
  regular: 600,
  bold: 800,
  black: 900,
};

/**
 * Converte un BrandKit estratto in un MGTheme usabile da Remotion.
 * Il nome del tema è "custom-{clientSlug}" o "Custom Brand".
 */
export function brandKitToTheme(kit: BrandKit, clientName?: string): MGTheme {
  const fonts = FONT_MAP[kit.fontStyle];
  return {
    name: clientName ? `Brand ${clientName}` : "Custom Brand",
    bgColor: kit.bgColor,
    bgColorSecondary: kit.bgColorSecondary,
    textColor: kit.textColor,
    accentColor: kit.accentColor,
    supportColor: kit.supportColor,
    displayFont: fonts.display,
    bodyFont: fonts.body,
    displayFontWeight: WEIGHT_MAP[kit.fontWeight],
    displayLetterSpacing: kit.fontWeight === "black" ? "-0.03em" : "-0.01em",
    borderRadius: kit.borderRadius,
    motionStyle: kit.motionStyle,
    extraColors: kit.extraColors,
  };
}

// =============================================================================
// Default fallback
// =============================================================================

function defaultBrandKit(): BrandKit {
  return {
    accentColor: "#FFD400",
    textColor: "#FFFFFF",
    bgColor: "#0A0A0A",
    supportColor: "#888888",
    fontStyle: "sans-serif",
    fontWeight: "bold",
    mood: "corporate",
    borderRadius: 8,
    motionStyle: "smooth",
  };
}
