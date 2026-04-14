// =============================================================================
// MG Translator — Call 2: Descrizione creativa → RenderSpec
// =============================================================================
//
// Prende la descrizione creativa libera scritta dal Direttore Creativo (Call 1)
// e la traduce in un RenderSpec — un albero di elementi con CSS libero, SVG,
// e animazioni keyframe su qualsiasi proprietà.
//
// Usa Claude Sonnet per la traduzione perché serve capacità di ragionamento
// spaziale e conoscenza CSS/SVG avanzata (3D transforms, clip-path, filtri,
// SVG path, glassmorphism, ecc.).
//
// Ogni MG viene tradotta indipendentemente → parallelizzabile nel worker.

import Anthropic from "@anthropic-ai/sdk";
import type { MGTheme } from "@/remotion/motion-graphics/themes-data";
import {
  validateRenderSpec,
  fallbackRenderSpec,
  type RenderSpec,
} from "@/remotion/motion-graphics/dynamic/render-spec";

// =============================================================================
// Anthropic client (singleton, condiviso con ai-director.ts)
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
// System prompt per il traduttore
// =============================================================================

function buildTranslatorSystemPrompt(): string {
  return [
    "Sei un ESPERTO di motion design con Remotion, CSS avanzato e SVG.",
    "Il tuo compito: traduci una descrizione creativa in un RenderSpec JSON.",
    "",
    "## RenderSpec Schema",
    "",
    "```",
    "{",
    '  "rootCss": { /* CSS del container 1080x1920 */ },',
    '  "elements": [',
    "    {",
    '      "tag": "div",  // qualsiasi tag HTML o SVG',
    '      "text": "contenuto testuale",',
    '      "svg": "<path d=\'...\' />",  // SVG inline raw',
    '      "css": { /* QUALSIASI proprietà CSS camelCase */ },',
    '      "animate": [',
    "        {",
    '          "prop": "opacity",  // qualsiasi proprietà CSS',
    '          "keyframes": [{"frame": 0, "value": 0}, {"frame": 15, "value": 1}],',
    '          "easing": "spring",  // linear | ease-in | ease-out | ease-in-out | spring',
    '          "springConfig": {"damping": 200, "stiffness": 100}',
    "        }",
    "      ],",
    '      "attrs": { /* attributi SVG: d, cx, cy, r, viewBox, stroke-dasharray */ },',
    '      "children": [ /* elementi nidificati */ ]',
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "## Regole",
    "",
    "1) Hai accesso COMPLETO a CSS e SVG. Usa 3D transforms, filters, clip-path, gradients, glassmorphism, backdrop-blur, text-shadow, box-shadow, blend modes, SVG paths, stroke animations — TUTTO.",
    "2) Canvas: dimensioni specificate dall'utente (tipicamente 1080x1920 verticale). Usa position: absolute con top/left in pixel per posizionare.",
    "3) Frame rate: 30fps. Le animazioni usano numeri di frame (non ms). 30 frame = 1 secondo.",
    "4) COLORI: usa token tematici dove possibile. I token disponibili sono: 'accent' (colore principale), 'text' (colore testo), 'bg' (sfondo), 'support' (colore secondario). Il renderer li sostituisce con i colori reali del tema. Puoi anche usare hex/rgba diretti.",
    "5) FONT: usa la fontFamily del tema. Il font display è per titoli grandi, il font body per testo piccolo. I nomi esatti ti vengono dati nell'input.",
    "6) Ogni clip dura ~75-135 frame (2.5-4.5 sec @ 30fps). Le animazioni di entrata devono completarsi nei primi 20 frame. Lascia almeno 10 frame finali senza animazione (contenuto visibile fisso).",
    "7) IMPATTO VISIVO: pensa come un motion designer After Effects. Ogni MG deve colpire nei primi frame. Usa scale spring per pop-in, opacity per reveal, translateY per slide, clip-path per wipe.",
    "8) LEGGIBILITÀ: il testo deve essere leggibile. Minimo 24px per body, 48px+ per numeri/titoli. Contrasto sufficiente tra testo e sfondo.",
    "9) IMMAGINI/MOCKUP: se la descrizione menziona 'MOCKUP:' o un'immagine di prodotto, usa un elemento div con backgroundImage: 'url(MOCKUP_URL)' e backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center'. Applicaci 3D transforms, ombre, animazioni — rendilo cinematico!",
    "10) SOLO JSON valido. Nessun commento, nessun markdown, nessun preambolo.",
  ].join("\n");
}

function buildTranslatorUserPrompt(opts: {
  description: string;
  theme: MGTheme;
  width: number;
  height: number;
  mockupUrl?: string;
}): string {
  return [
    `Canvas: ${opts.width}x${opts.height} pixel`,
    `Frame rate: 30fps`,
    "",
    `Tema visivo: "${opts.theme.name}"`,
    `Colori tema:`,
    `  - accent (highlight): ${opts.theme.accentColor}`,
    `  - text (testo): ${opts.theme.textColor}`,
    `  - bg (sfondo): ${opts.theme.bgColor}`,
    `  - support (secondario): ${opts.theme.supportColor}`,
    opts.theme.bgColorSecondary ? `  - bgSecondary: ${opts.theme.bgColorSecondary}` : "",
    opts.theme.extraColors?.length ? `  - extra: ${opts.theme.extraColors.join(", ")}` : "",
    `Font display: "${opts.theme.displayFont}", peso ${opts.theme.displayFontWeight}`,
    `Font body: "${opts.theme.bodyFont}"`,
    `Stile motion: ${opts.theme.motionStyle} (${opts.theme.motionStyle === "snap" ? "entrate decise" : opts.theme.motionStyle === "bounce" ? "entrate con bounce" : "entrate morbide"})`,
    `Border radius: ${opts.theme.borderRadius}px`,
    "",
    opts.mockupUrl ? `URL mockup prodotto disponibile: ${opts.mockupUrl}` : "",
    opts.mockupUrl ? `Se la descrizione menziona MOCKUP o il prodotto, usa backgroundImage: 'url(${opts.mockupUrl})' nell'elemento immagine.` : "",
    "",
    "DESCRIZIONE CREATIVA DA TRADURRE:",
    `"""`,
    opts.description,
    `"""`,
    "",
    "Genera il RenderSpec JSON. Ricorda: CSS camelCase, posizioni in pixel assoluti, animazioni in frame (30fps), token colore dove possibile.",
  ]
    .filter(Boolean)
    .join("\n");
}

// =============================================================================
// Public API
// =============================================================================

export async function translateToRenderSpec(opts: {
  description: string;
  theme: MGTheme;
  width: number;
  height: number;
  mockupUrl?: string;
  log?: (msg: string) => void;
}): Promise<RenderSpec> {
  const log = opts.log ?? (() => {});
  const client = getAnthropic();

  if (!client) {
    log("mg-translator: ANTHROPIC_API_KEY mancante, uso fallback");
    return fallbackRenderSpec(opts.description, opts.theme);
  }

  const descShort = opts.description.slice(0, 60);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: buildTranslatorSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildTranslatorUserPrompt({
              description: opts.description,
              theme: opts.theme,
              width: opts.width,
              height: opts.height,
              mockupUrl: opts.mockupUrl,
            }),
          },
        ],
      });

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      // Estrai JSON — prova prima il blocco ```json, poi il greedy match
      let jsonStr: string | null = null;
      const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlock) {
        jsonStr = codeBlock[1];
      } else {
        // Greedy match — trova l'oggetto JSON più esterno
        const match = text.match(/\{[\s\S]*\}/);
        if (match) jsonStr = match[0];
      }

      if (!jsonStr) {
        log(`mg-translator: nessun JSON nell'output per "${descShort}..." (tentativo ${attempt + 1})`);
        continue;
      }

      // Pulizia JSON: rimuovi trailing comma prima di } o ]
      jsonStr = jsonStr
        .replace(/,\s*([}\]])/g, "$1")
        // Rimuovi commenti // inline
        .replace(/\/\/[^\n"]*$/gm, "");

      let raw: unknown;
      try {
        raw = JSON.parse(jsonStr);
      } catch (e) {
        log(`mg-translator: JSON parse fallito per "${descShort}...": ${(e as Error).message} (tentativo ${attempt + 1})`);
        continue;
      }

      const spec = validateRenderSpec(raw);
      if (!spec) {
        log(`mg-translator: RenderSpec non valido per "${descShort}..." (tentativo ${attempt + 1})`);
        continue;
      }

      log(`mg-translator: OK "${descShort}..." → ${spec.elements.length} elementi`);
      return spec;
    } catch (e) {
      log(`mg-translator: errore API per "${descShort}...": ${(e as Error).message} (tentativo ${attempt + 1})`);
    }
  }

  // Fallback dopo 3 tentativi
  log(`mg-translator: FALLBACK per "${descShort}..." dopo 3 tentativi`);
  return fallbackRenderSpec(opts.description, opts.theme);
}

/**
 * Traduce tutte le MG descriptions in parallelo.
 * Ritorna un array di RenderSpec nella stessa posizione dei descriptions.
 */
export async function translateAllMGs(opts: {
  descriptions: { description: string; index: number }[];
  theme: MGTheme;
  width: number;
  height: number;
  mockupUrl?: string;
  log?: (msg: string) => void;
}): Promise<RenderSpec[]> {
  const log = opts.log ?? (() => {});
  log(`mg-translator: traduco ${opts.descriptions.length} MG in parallelo...`);

  const results = await Promise.all(
    opts.descriptions.map((d) =>
      translateToRenderSpec({
        description: d.description,
        theme: opts.theme,
        width: opts.width,
        height: opts.height,
        mockupUrl: opts.mockupUrl,
        log,
      })
    )
  );

  const successCount = results.filter(
    (r) => r.elements.length > 1 || (r.elements[0]?.children?.length ?? 0) > 0
  ).length;
  log(`mg-translator: ${successCount}/${opts.descriptions.length} traduzioni riuscite`);

  return results;
}
