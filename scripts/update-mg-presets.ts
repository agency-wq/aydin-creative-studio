// Aggiorna i 10 MotionGraphicsPreset con i veri YouTube reference URLs
// e i prompt che l'utente ha confermato.
//
// Run:  pnpm tsx scripts/update-mg-presets.ts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

type Update = {
  name: string;
  styleReferenceUrl: string;
  prompt: string;
};

const UPDATES: Update[] = [
  {
    name: "VOX",
    styleReferenceUrl: "https://www.youtube.com/shorts/bYdrnQS4574",
    prompt:
      "Cinematic Vox-style explainer graphics with clean typography, animated callouts, and smart data visuals that reinforce key points.",
  },
  {
    name: "Ali Abdaal",
    styleReferenceUrl: "https://www.youtube.com/shorts/sIkWwafmrlM",
    prompt:
      "Cinematic Ali Abdaal-style motion graphics with minimal layouts, elegant text reveals, and polished on-screen annotations.",
  },
  {
    name: "Dan Koe",
    styleReferenceUrl: "https://www.youtube.com/shorts/xybpfL1GnEQ",
    prompt:
      "Dan Koe-style motion graphics: minimalist, clean, high-contrast typography, simple geometric accents, subtle kinetic text reveals, and calm, premium pacing. Use strong hierarchy and whitespace.",
  },
  {
    name: "Kurzgesagt",
    styleReferenceUrl: "https://youtu.be/iogcY_4xGjo",
    prompt:
      "Cinematic Kurzgesagt-style explainer graphics with colorful flat vectors, bold iconography, clean shapes, and smooth motion accents.",
  },
  {
    name: "MrBeast",
    styleReferenceUrl: "https://youtu.be/knjliFs3gR8",
    prompt:
      "High-energy MrBeast-style motion graphics with oversized bold typography, rapid callouts, dynamic pop-in labels, and punchy emphasis on big moments.",
  },
  {
    name: "The Infographics Show",
    styleReferenceUrl: "https://www.youtube.com/watch?v=k0ztN1siyo8",
    prompt:
      "The Infographics Show-style motion graphics with clean, flat vector illustrations, bold outlines, minimal shading, labeled callouts, and a steady explainer pacing.",
  },
  {
    name: "Skymography",
    styleReferenceUrl: "https://www.youtube.com/shorts/k1SPWPfR-lw",
    prompt:
      "cinematic motion graphics inspired by Skymography, dark atmospheric background with glowing neon blue light, minimal futuristic design, floating geometric shapes and luminous particles moving slowly through space, volumetric light beams cutting through fog, smooth camera drift and subtle parallax motion, abstract technology visuals resembling data streams and constellations, thin glowing lines connecting nodes like a digital network, soft bloom lighting, high contrast cinematic color grading, ultra-clean modern motion design, epic tech aesthetic, slow elegant animation, 4K cinematic motion graphics.",
  },
  {
    name: "Aevy TV",
    styleReferenceUrl: "https://www.youtube.com/shorts/_FsJJGlT4uo",
    prompt:
      "modern YouTube editing tutorial style video with fast pacing, smooth zoom transitions, split screen comparisons, animated motion graphics overlays, dynamic cuts, text callouts explaining editing techniques, clean cinematic visuals similar to Aevy TV",
  },
  {
    name: "Johnny Harris",
    styleReferenceUrl: "https://www.youtube.com/watch?v=wxf_pKCOCBo",
    prompt:
      "documentary storytelling visuals, animated maps, paper texture collage elements, investigative explainer graphics, cinematic educational video style similar to Johnny Harris",
  },
  {
    name: "TED-Ed",
    styleReferenceUrl: "https://www.youtube.com/watch?v=58SrtQNt4YE",
    prompt:
      "Educational animated explainer video in the style of modern flat 2D vector animation. Hand-drawn illustrated characters and objects animate smoothly across the screen to explain a concept. Soft pastel color palette, textured paper background, clean outlines, simple geometric shapes, playful transitions, and visual metaphors appearing as the narration progresses. Elements slide, morph, and transform to tell the story clearly. Minimal shadows, flat design, friendly educational aesthetic similar to high-quality animated explainer videos, smooth motion graphics, professional storytelling animation, 4K.",
  },
];

async function main() {
  console.log(`Updating ${UPDATES.length} motion graphics presets…\n`);

  for (const u of UPDATES) {
    const existing = await prisma.motionGraphicsPreset.findUnique({ where: { name: u.name } });
    if (!existing) {
      console.warn(`  ⚠ preset "${u.name}" non trovato nel DB, skip`);
      continue;
    }
    await prisma.motionGraphicsPreset.update({
      where: { name: u.name },
      data: {
        styleReferenceUrl: u.styleReferenceUrl,
        prompt: u.prompt,
        // Reset cachedFrameUrls cosi resolveStyleFrames usera lo YT thumb
        cachedFrameUrls: [],
      },
    });
    console.log(`  ✓ ${u.name}`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
