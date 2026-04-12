// scripts/sync-heygen-avatars.ts
// Sincronizza TUTTI gli avatar HeyGen v3 nel DB locale.
// Nessun filtro etnico/nominale: l'utente sceglie liberamente dalla UI.
// Esegui: pnpm tsx scripts/sync-heygen-avatars.ts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
if (!HEYGEN_API_KEY) {
  console.error("HEYGEN_API_KEY mancante in .env");
  process.exit(1);
}

type HeyGenLook = {
  id: string;
  name: string;
  gender: string;
  avatar_type: string;
  image_width: number;
  image_height: number;
  supported_api_engines: string[];
  default_voice_id?: string;
  preview_image_url?: string;
  preview_video_url?: string;
  group_id?: string;
};

type LooksResponse = {
  data: HeyGenLook[];
  has_more: boolean;
  next_token: string | null;
};

function normalizeGender(g: string | null | undefined): string {
  if (!g) return "unknown";
  const lower = g.toLowerCase();
  if (lower === "man" || lower === "male") return "male";
  if (lower === "woman" || lower === "female") return "female";
  return lower;
}

function detectAspect(w: number, h: number): string {
  if (!w || !h) return "unknown";
  if (w < h) return "9:16";
  if (w > h) return "16:9";
  return "1:1";
}

// Vero se il nome inizia DIRETTAMENTE con una lettera latina (A-Z, a-z, o accenti europei).
// Esclude:
//   - cyrillico, cinese, giapponese, coreano, arabo, hindi, ecc.
//   - nomi che iniziano con simboli (*, ", ', .)
//   - nomi che iniziano con numeri (111, 16chef)
// Mantiene inglese, italiano, spagnolo, francese, tedesco, olandese, scandinavo.
function hasLatinName(name: string): boolean {
  if (!name) return false;
  return /^[a-zA-Z\u00C0-\u017F]/.test(name);
}

async function fetchAllLooks(): Promise<HeyGenLook[]> {
  const all: HeyGenLook[] = [];
  let token: string | null = null;
  let page = 0;

  while (true) {
    page++;
    const url = new URL("https://api.heygen.com/v3/avatars/looks");
    url.searchParams.set("limit", "50");
    if (token) url.searchParams.set("token", token);

    const res = await fetch(url, {
      headers: { "X-Api-Key": HEYGEN_API_KEY! },
    });

    if (!res.ok) {
      throw new Error(`HeyGen looks ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as LooksResponse;
    all.push(...json.data);

    process.stdout.write(
      `\r  Fetched page ${page} (+${json.data.length}, total ${all.length})`
    );

    if (!json.has_more || !json.next_token) break;
    token = json.next_token;
    if (page > 200) break;
  }
  process.stdout.write("\n");
  return all;
}

async function main() {
  console.log("🔄 Sync HeyGen avatars...");
  const start = Date.now();

  console.log("Fetching all looks from HeyGen v3 API...");
  const looks = await fetchAllLooks();
  console.log(`✓ Total fetched: ${looks.length}`);

  console.log("\nUpserting into database...");
  let created = 0;
  let updated = 0;

  for (let i = 0; i < looks.length; i++) {
    const l = looks[i];
    if (!l.id || !l.name) continue;

    const firstName = l.name.split(" ")[0]?.toLowerCase() ?? "";
    const aspect = detectAspect(l.image_width, l.image_height);
    const gender = normalizeGender(l.gender);
    const latinName = hasLatinName(l.name);
    const hasPreview = !!l.preview_image_url;

    const result = await prisma.avatar.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        name: l.name,
        firstName,
        gender,
        aspect,
        width: l.image_width || 0,
        height: l.image_height || 0,
        avatarType: l.avatar_type ?? "unknown",
        supportedEngines: l.supported_api_engines ?? [],
        defaultVoiceId: l.default_voice_id ?? null,
        previewImageUrl: l.preview_image_url ?? null,
        previewVideoUrl: l.preview_video_url ?? null,
        groupId: l.group_id ?? null,
        hasLatinName: latinName,
        hasPreview,
        tags: [],
        enabled: true,
      },
      update: {
        name: l.name,
        firstName,
        gender,
        aspect,
        width: l.image_width || 0,
        height: l.image_height || 0,
        avatarType: l.avatar_type ?? "unknown",
        supportedEngines: l.supported_api_engines ?? [],
        defaultVoiceId: l.default_voice_id ?? null,
        previewImageUrl: l.preview_image_url ?? null,
        previewVideoUrl: l.preview_video_url ?? null,
        groupId: l.group_id ?? null,
        hasLatinName: latinName,
        hasPreview,
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;

    if ((i + 1) % 200 === 0) {
      process.stdout.write(`\r  Processed ${i + 1}/${looks.length}`);
    }
  }
  process.stdout.write(`\r  Processed ${looks.length}/${looks.length}\n`);

  // Stats
  const total = await prisma.avatar.count();
  const byGender = await prisma.avatar.groupBy({
    by: ["gender"],
    _count: true,
  });
  const byAspect = await prisma.avatar.groupBy({
    by: ["aspect"],
    _count: true,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Created: ${created}, Updated: ${updated}`);
  console.log(`   Total in DB: ${total}`);
  console.log(`   By gender: ${byGender.map((g) => `${g.gender}=${g._count}`).join(", ")}`);
  console.log(`   By aspect: ${byAspect.map((a) => `${a.aspect}=${a._count}`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("\n❌ Sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
