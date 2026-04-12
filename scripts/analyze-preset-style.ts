// Script: analizza in dettaglio lo stile visivo di un preset usando i frame
// gia estratti dal video YouTube reference (cachedFrameUrls in DB) + Claude
// Sonnet 4.5 con vision.
//
// Input:  nome del preset (es. "The Infographics Show")
// Output: descrizione strutturata in JSON con tipografia, palette, layout,
//         animazioni caratteristiche, elementi grafici riconoscibili, etc.
//
// Uso:
//   pnpm tsx scripts/analyze-preset-style.ts "The Infographics Show"

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function fetchImageAsBase64(url: string): Promise<{ b64: string; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  return { b64: buf.toString("base64"), mime };
}

async function main() {
  const presetName = process.argv.slice(2).join(" ") || "The Infographics Show";
  console.log(`\n[analyze] preset: "${presetName}"`);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY mancante (controlla .env e dotenv override:true)");
  }

  const preset = await prisma.motionGraphicsPreset.findUnique({ where: { name: presetName } });
  if (!preset) throw new Error(`preset "${presetName}" non trovato`);

  const frames = preset.cachedFrameUrls ?? [];
  if (frames.length === 0) throw new Error(`preset "${presetName}" senza cachedFrameUrls`);

  // Prendi al massimo 8 frame (uniformemente distribuiti) per non saturare il context
  const stepEvery = Math.max(1, Math.floor(frames.length / 8));
  const sampled = frames.filter((_, i) => i % stepEvery === 0).slice(0, 8);
  console.log(`[analyze] uso ${sampled.length}/${frames.length} frame da style library`);

  console.log(`[analyze] scarico immagini…`);
  const images = await Promise.all(sampled.map(fetchImageAsBase64));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = [
    "Sei un motion graphics art director esperto. Ti vengono mostrati alcuni frame estratti dal video YouTube reference di un creator/canale.",
    "Devi analizzare in dettaglio lo stile visivo delle motion graphics e produrre una scheda strutturata in JSON che permetta di REPLICARE quello stile in Remotion (React + SVG + CSS).",
    "Concentrati su elementi RICONOSCIBILI E DISTINTIVI, non su descrizioni generiche.",
    "L'output deve essere SOLO un oggetto JSON valido, senza preamboli, senza markdown, senza backtick.",
  ].join(" ");

  const schemaInstructions = `
Schema dell'output (rispettalo esattamente):
{
  "presetName": "string",
  "summary": "1-2 frasi che descrivono l'identita visiva in modo memorabile",
  "palette": {
    "primaryBg": "#hex",
    "secondaryBg": "#hex",
    "text": "#hex",
    "accent1": "#hex",
    "accent2": "#hex",
    "supportColors": ["#hex", ...]
  },
  "typography": {
    "displayFontFamily": "es. 'Bebas Neue', 'Impact', 'Arial Black', 'Inter Black'",
    "displayFontWeight": 900,
    "displayLetterSpacing": "es. -0.02em",
    "displayCase": "uppercase | normal | small-caps",
    "bodyFontFamily": "string",
    "bodyFontWeight": 500,
    "displayFeel": "es. 'condensed sans aggressive', 'soft serif elegant', 'rounded friendly'"
  },
  "layoutPatterns": [
    "es. 'lower-third con barra colorata e icona circolare'",
    "es. 'big number centrato con label sopra e divider'",
    "..."
  ],
  "iconography": {
    "style": "es. 'flat vector con outline', 'isometric 3D pastello', 'rough hand-drawn'",
    "characteristicElements": ["es. 'mappamondo stilizzato', 'cartoon character omino', 'badges circolari', ..."]
  },
  "animationStyle": {
    "feel": "snappy | smooth | bouncy | jittery | cinematic",
    "characteristicMoves": [
      "es. 'pop-in con scale 0.8 -> 1.05 -> 1.0 (overshoot)'",
      "es. 'lateral slide-in da destra con stagger 80ms tra parole'",
      "..."
    ],
    "transitionStyle": "es. 'cut secco con flash bianco', 'wipe diagonale', 'morph fluido'"
  },
  "characteristicElements": [
    "elenco di 4-6 elementi visivi che, se vedi un frame, ti fanno dire SUBITO 'questo e <preset>'"
  ],
  "thingsToAvoid": [
    "elementi che SAREBBERO sbagliati per questo stile (es. 'no font serif', 'no animazioni morbide', ...)"
  ],
  "exampleProps": {
    "TitleCard": { "eyebrow": "...", "title": "..." },
    "BigNumber": { "value": 47, "label": "...", "suffix": "%" },
    "BulletList": { "title": "...", "items": ["...", "...", "..."] }
  }
}
`;

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `Preset name: ${presetName}\n\nQuesti sono ${images.length} frame estratti uniformemente dal video YouTube di reference. Analizzali e produci la scheda JSON.\n\n${schemaInstructions}`,
    },
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.b64,
      },
    })),
  ];

  console.log(`[analyze] chiamo Claude Sonnet 4.5 vision…`);
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Estrai JSON
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("Output Claude raw:");
    console.error(text);
    throw new Error("Claude non ha ritornato JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error("Output Claude raw:");
    console.error(match[0]);
    throw new Error(`JSON parse fail: ${(e as Error).message}`);
  }

  console.log(`\n[analyze] STYLE SPEC per "${presetName}":`);
  console.log(JSON.stringify(parsed, null, 2));

  // Salva su file
  const out = `style-specs/${presetName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
  const fs = await import("node:fs/promises");
  await fs.mkdir("style-specs", { recursive: true });
  await fs.writeFile(out, JSON.stringify(parsed, null, 2), "utf8");
  console.log(`\n[analyze] salvato: ${out}`);
}

main()
  .catch((err) => {
    console.error("[analyze] FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
