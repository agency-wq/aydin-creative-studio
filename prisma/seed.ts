// Seed script: popola Avatar + Voice dalle librerie curate
// Esegui con: pnpm tsx prisma/seed.ts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const PROJECT_ROOT = path.resolve(__dirname, "../..");

type CuratedAvatar = {
  id: string;
  name: string;
  first_name: string;
  gender: "male" | "female";
  aspect: "9:16" | "16:9" | "1:1";
  width: number;
  height: number;
  avatar_type: string;
  engines: string[];
  default_voice_id?: string | null;
  preview_image_url?: string;
  preview_video_url?: string;
  group_id?: string | null;
};

async function seedAvatars() {
  const filePath = path.join(PROJECT_ROOT, "assets/avatar-library-curated.json");
  if (!fs.existsSync(filePath)) {
    console.warn(`Avatar library file not found: ${filePath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
    avatars: CuratedAvatar[];
  };

  console.log(`Seeding ${raw.avatars.length} curated avatars...`);

  let created = 0;
  let updated = 0;

  for (const a of raw.avatars) {
    const result = await prisma.avatar.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        name: a.name,
        firstName: a.first_name,
        gender: a.gender,
        aspect: a.aspect,
        width: a.width,
        height: a.height,
        avatarType: a.avatar_type,
        supportedEngines: a.engines,
        defaultVoiceId: a.default_voice_id ?? null,
        previewImageUrl: a.preview_image_url ?? null,
        previewVideoUrl: a.preview_video_url ?? null,
        groupId: a.group_id ?? null,
        tags: [],
        enabled: true,
      },
      update: {
        name: a.name,
        previewImageUrl: a.preview_image_url ?? null,
        previewVideoUrl: a.preview_video_url ?? null,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }

  console.log(`  ✓ Avatars: ${created} created, ${updated} updated`);
}

type ElevenLabsRawVoice = {
  voice_id: string;
  name: string;
  category: string;
  labels?: {
    gender?: string;
    age?: string;
    use_case?: string;
  };
  description?: string;
  preview_url?: string;
  verified_languages?: Array<{
    language: string;
    model_id: string;
    accent?: string;
    locale?: string;
    preview_url?: string;
  }>;
};

async function seedElevenLabsVoices() {
  const filePath = path.join(PROJECT_ROOT, "assets/elevenlabs-voices.json");
  if (!fs.existsSync(filePath)) {
    console.warn(`ElevenLabs voices file not found: ${filePath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
    voices: ElevenLabsRawVoice[];
  };

  // Filtra solo voci con supporto italiano verificato
  const italianVoices = raw.voices.filter((v) =>
    (v.verified_languages ?? []).some(
      (vl) => (vl.language ?? "").toLowerCase() === "it"
    )
  );

  console.log(`Seeding ${italianVoices.length} ElevenLabs Italian voices...`);

  let created = 0;
  let updated = 0;

  for (const v of italianVoices) {
    const itLocale = v.verified_languages?.find(
      (vl) => (vl.language ?? "").toLowerCase() === "it"
    );

    const result = await prisma.voice.upsert({
      where: { provider_id: { provider: "elevenlabs", id: v.voice_id } },
      create: {
        id: v.voice_id,
        provider: "elevenlabs",
        name: v.name,
        language: "it",
        gender: v.labels?.gender ?? null,
        category: v.category,
        useCase: v.labels?.use_case ?? null,
        ageRange: v.labels?.age ?? null,
        previewUrl: itLocale?.preview_url ?? v.preview_url ?? null,
        recommendedSettings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        enabled: true,
      },
      update: {
        name: v.name,
        previewUrl: itLocale?.preview_url ?? v.preview_url ?? null,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }

  console.log(`  ✓ ElevenLabs voices: ${created} created, ${updated} updated`);
}

// Voci HeyGen italiane (top 5 dalla ricerca precedente)
async function seedHeyGenVoices() {
  const heygenItalianVoices = [
    {
      id: "750533f27c5649979110086898518280",
      name: "Gabriella - Natural",
      gender: "female",
    },
    {
      id: "d5fdcfda99cd44dba12a4ea0076a7271",
      name: "Pierina - Natural",
      gender: "female",
    },
    {
      id: "dbcfe683e60a4bed9b8957d1f5d6de98",
      name: "Diego - Natural",
      gender: "male",
    },
    {
      id: "93129ad473ea49dd8dd69da0f4fa8fd6",
      name: "Benigno - Natural",
      gender: "male",
    },
    {
      id: "fb6ff83d7319492394ab3af233cca8e3",
      name: "Elsa - Cheerful",
      gender: "female",
    },
  ];

  console.log(`Seeding ${heygenItalianVoices.length} HeyGen Italian voices...`);

  for (const v of heygenItalianVoices) {
    await prisma.voice.upsert({
      where: { provider_id: { provider: "heygen", id: v.id } },
      create: {
        id: v.id,
        provider: "heygen",
        name: v.name,
        language: "it",
        gender: v.gender,
        category: "premade",
        enabled: true,
      },
      update: { name: v.name },
    });
  }

  console.log(`  ✓ HeyGen voices: 5 seeded`);
}

async function seedCaptionsPresets() {
  const presets = [
    {
      name: "Karaoke",
      description: "Highlight della parola corrente, stile classico karaoke",
      remotionComponent: "Karaoke",
      defaultProps: {
        fontFamily: "Inter",
        fontSize: 64,
        activeColor: "#FFD700",
        inactiveColor: "#FFFFFF",
        position: "bottom",
      },
    },
    {
      name: "Pop3D",
      description: "Parole che scoppiano in 3D con bounce",
      remotionComponent: "Pop3D",
      defaultProps: {
        fontFamily: "Inter",
        fontSize: 80,
        color: "#FFFFFF",
        bounceIntensity: 1.5,
      },
    },
    {
      name: "Minimal",
      description: "Linea singola sotto, stile Apple keynote",
      remotionComponent: "Minimal",
      defaultProps: {
        fontFamily: "SF Pro",
        fontSize: 48,
        color: "#FFFFFF",
        position: "bottom-center",
      },
    },
    {
      name: "Beast Mode",
      description: "Stile MrBeast: emoji + colori vivaci + scale",
      remotionComponent: "BeastMode",
      defaultProps: {
        fontFamily: "Inter",
        fontSize: 96,
        colors: ["#FF0000", "#FFFF00", "#FFFFFF"],
        scaleOnEmphasis: 1.4,
      },
    },
    {
      name: "Editorial",
      description: "Stile NYT, sobrio, serif",
      remotionComponent: "Editorial",
      defaultProps: {
        fontFamily: "Playfair Display",
        fontSize: 56,
        color: "#FFFFFF",
        backgroundColor: "rgba(0,0,0,0.6)",
      },
    },
  ];

  console.log(`Seeding ${presets.length} captions presets...`);
  for (const p of presets) {
    await prisma.captionsPreset.upsert({
      where: { name: p.name },
      create: p,
      update: { description: p.description, defaultProps: p.defaultProps },
    });
  }
  console.log(`  ✓ Captions presets: ${presets.length} seeded`);
}

async function seedMotionGraphicsPresets() {
  const presets = [
    {
      name: "VOX",
      description: "Stile VOX: data-driven, mappe animate, transizioni decise",
      prompt: "cinematic motion graphics inspired by VOX, data visualization style with animated maps, bold typography, smooth panning transitions, dark backgrounds with vibrant accent colors",
      styleReferenceUrl: "https://www.youtube.com/@Vox",
    },
    {
      name: "Kurzgesagt",
      description: "Stile Kurzgesagt: illustrazioni vettoriali piatte, colori vivaci, animazioni morbide",
      prompt: "cinematic motion graphics inspired by Kurzgesagt, flat vector illustrations, vibrant pastel colors, smooth easing animations, friendly geometric shapes, educational infographic style",
      styleReferenceUrl: "https://www.youtube.com/@kurzgesagt",
    },
    {
      name: "Ali Abdaal",
      description: "Stile Ali Abdaal: clean, minimale, lower-third, screen recordings",
      prompt: "cinematic motion graphics inspired by Ali Abdaal, clean minimal design, lower-third overlays, hand-drawn doodle annotations, productivity aesthetic, white background with accent colors",
      styleReferenceUrl: "https://www.youtube.com/@aliabdaal",
    },
    {
      name: "Skymography",
      description: "Stile cinematic dark, neon blue, futuristic geometric shapes",
      prompt: "cinematic motion graphics inspired by Skymography, dark atmospheric background with glowing neon blue light, minimal futuristic design, floating geometric shapes",
      styleReferenceUrl: "https://www.youtube.com/@Skymography",
    },
    {
      name: "MrBeast",
      description: "Stile MrBeast: ad alta energia, colori saturi, zoom dinamici, emoji",
      prompt: "cinematic motion graphics inspired by MrBeast, high-energy vibrant colors, dynamic zoom effects, bold sans-serif text, money rain particles, contest aesthetic",
      styleReferenceUrl: "https://www.youtube.com/@MrBeast",
    },
    {
      name: "Dan Koe",
      description: "Stile Dan Koe: minimal philosophical, typography focused",
      prompt: "cinematic motion graphics inspired by Dan Koe, minimal philosophical aesthetic, large bold serif typography, subtle ink animations, monochrome with gold accents",
      styleReferenceUrl: "https://www.youtube.com/@thedankoe",
    },
    {
      name: "The Infographics Show",
      description: "Stile cartoon infographics, character animation",
      prompt: "cinematic motion graphics inspired by The Infographics Show, cartoon character animation, comic-style infographics, bright colors, educational comparison style",
      styleReferenceUrl: "https://www.youtube.com/@TheInfographicsShow",
    },
    {
      name: "Aevy TV",
      description: "Stile Aevy: cinematic philosophical, ambient slow motion",
      prompt: "cinematic motion graphics inspired by Aevy TV, philosophical cinematic shots, slow ambient motion, warm color grading, contemplative atmosphere",
      styleReferenceUrl: "https://www.youtube.com/@AevyTV",
    },
    {
      name: "Johnny Harris",
      description: "Stile documentaristico geopolitico, mappe dettagliate, footage reale",
      prompt: "cinematic motion graphics inspired by Johnny Harris, documentary geopolitical style, detailed animated maps, archival footage transitions, journalistic aesthetic",
      styleReferenceUrl: "https://www.youtube.com/@johnnyharris",
    },
    {
      name: "TED-Ed",
      description: "Stile TED-Ed: animated educational, illustrazioni semplici",
      prompt: "cinematic motion graphics inspired by TED-Ed, simple educational illustrations, smooth character animation, hand-drawn aesthetic, warm color palette",
      styleReferenceUrl: "https://www.youtube.com/@TEDEd",
    },
  ];

  console.log(`Seeding ${presets.length} motion graphics presets...`);
  for (const p of presets) {
    await prisma.motionGraphicsPreset.upsert({
      where: { name: p.name },
      create: {
        ...p,
        cachedFrameUrls: [],
      },
      update: {
        description: p.description,
        prompt: p.prompt,
        styleReferenceUrl: p.styleReferenceUrl,
      },
    });
  }
  console.log(`  ✓ Motion graphics presets: ${presets.length} seeded`);
}

async function main() {
  console.log("🌱 Aydin Creative Studio - Database seeding\n");

  await seedAvatars();
  await seedElevenLabsVoices();
  await seedHeyGenVoices();
  await seedCaptionsPresets();
  await seedMotionGraphicsPresets();

  console.log("\n✅ Seed completato!");
}

main()
  .catch((e) => {
    console.error("❌ Seed fallito:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
