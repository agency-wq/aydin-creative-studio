// scripts/backfill-avatar-tags.ts
// Per ogni Avatar gia' sincronizzato nel DB, chiama l'endpoint
//   GET /v2/avatar/{id}/details
// per recuperare i `tags` (es. ["AVATAR_IV"], ["AVATAR_III"]) e deriva il
// campo `quality`:
//   premium  = AVATAR_IV   (lip sync perfetto, ~6x costo)
//   standard = AVATAR_III  (lip sync molto buono)
//   legacy   = AVATAR_II, no-tag, o talking_photo (lip sync pupazzoso)
//
// Eseguire: pnpm tsx scripts/backfill-avatar-tags.ts
//
// Rate limit: HeyGen /v2 endpoints hanno un cap generoso (~10 req/s), qui
// batchiamo 8 paralleli con un piccolo delay tra un batch e l'altro per
// restare al sicuro. Circa 450 avatar → ~1-2 min totali.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
if (!HEYGEN_API_KEY) {
  console.error("HEYGEN_API_KEY mancante in .env");
  process.exit(1);
}

type AvatarDetails = {
  type: "avatar";
  id: string;
  name: string;
  gender: "male" | "female";
  preview_image_url: string | null;
  preview_video_url: string | null;
  premium: boolean;
  is_public: boolean;
  default_voice_id: string | null;
  tags: string[];
};

type DetailsResponse = {
  error: string | null;
  data: AvatarDetails | null;
};

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deriva la quality tier dai tags + avatarType.
 *
 *   AVATAR_IV  → premium   (HeyGen 4.0, 2025-2026, lip sync ~perfetto)
 *   AVATAR_III → standard  (HeyGen 3.0, 2024, lip sync molto buono)
 *   altro/no-tag + video_avatar → legacy (AVATAR_II o pre-tag)
 *   photo_avatar/talking_photo  → legacy (always, lip sync pupazzoso)
 */
function deriveQuality(tags: string[], avatarType: string): "premium" | "standard" | "legacy" {
  // Talking photo = sempre legacy a prescindere dai tag.
  if (avatarType === "talking_photo" || avatarType === "photo_avatar") {
    return "legacy";
  }
  if (tags.includes("AVATAR_IV")) return "premium";
  if (tags.includes("AVATAR_III")) return "standard";
  return "legacy";
}

async function fetchDetails(avatarId: string): Promise<AvatarDetails | null> {
  try {
    const res = await fetch(
      `https://api.heygen.com/v2/avatar/${encodeURIComponent(avatarId)}/details`,
      { headers: { "X-Api-Key": HEYGEN_API_KEY! } }
    );

    if (!res.ok) {
      // 404 capita: avatar cancellati HeyGen-side ma ancora nel nostro DB
      if (res.status === 404) return null;
      console.warn(`  ⚠ ${avatarId}: HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as DetailsResponse;
    if (json.error) {
      console.warn(`  ⚠ ${avatarId}: ${json.error}`);
      return null;
    }

    return json.data;
  } catch (err) {
    console.warn(`  ⚠ ${avatarId}: ${(err as Error).message}`);
    return null;
  }
}

async function processBatch(
  batch: { id: string; avatarType: string }[]
): Promise<{ premium: number; standard: number; legacy: number; missing: number }> {
  const results = await Promise.all(
    batch.map(async (av) => {
      const details = await fetchDetails(av.id);
      return { id: av.id, avatarType: av.avatarType, details };
    })
  );

  const counts = { premium: 0, standard: 0, legacy: 0, missing: 0 };

  for (const r of results) {
    if (!r.details) {
      counts.missing++;
      // Marca come legacy di default (meglio nascondere che esporre garbage)
      await prisma.avatar.update({
        where: { id: r.id },
        data: {
          tags: [],
          quality: deriveQuality([], r.avatarType),
        },
      });
      continue;
    }

    const tags = r.details.tags ?? [];
    const quality = deriveQuality(tags, r.avatarType);
    counts[quality]++;

    await prisma.avatar.update({
      where: { id: r.id },
      data: {
        tags,
        quality,
      },
    });
  }

  return counts;
}

async function main() {
  console.log("🔄 Backfill avatar tags + quality from HeyGen /v2/avatar/{id}/details");
  const start = Date.now();

  const avatars = await prisma.avatar.findMany({
    select: { id: true, avatarType: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${avatars.length} avatars in DB\n`);

  const totals = { premium: 0, standard: 0, legacy: 0, missing: 0 };
  let processed = 0;

  for (let i = 0; i < avatars.length; i += BATCH_SIZE) {
    const batch = avatars.slice(i, i + BATCH_SIZE);
    const counts = await processBatch(batch);

    totals.premium += counts.premium;
    totals.standard += counts.standard;
    totals.legacy += counts.legacy;
    totals.missing += counts.missing;

    processed += batch.length;
    process.stdout.write(
      `\r  ${processed}/${avatars.length}  premium=${totals.premium}  standard=${totals.standard}  legacy=${totals.legacy}  missing=${totals.missing}`
    );

    if (i + BATCH_SIZE < avatars.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  process.stdout.write("\n");

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Premium  (AVATAR_IV):  ${totals.premium}`);
  console.log(`   Standard (AVATAR_III): ${totals.standard}`);
  console.log(`   Legacy   (other):      ${totals.legacy}`);
  console.log(`   Missing  (404/err):    ${totals.missing}`);

  // Quick sanity check: quanti avatar per quality nel DB
  const byQuality = await prisma.avatar.groupBy({
    by: ["quality"],
    _count: true,
  });
  console.log(
    `\n   DB totals: ${byQuality.map((q) => `${q.quality}=${q._count}`).join(", ")}`
  );
}

main()
  .catch((e) => {
    console.error("\n❌ Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
