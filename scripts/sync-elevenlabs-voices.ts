// scripts/sync-elevenlabs-voices.ts
// Sincronizza TUTTE le voci ElevenLabs italiane:
// - voci nel proprio account (premade + cloned + professional)
// - voci della shared library / community con language=it
// Esegui: pnpm tsx scripts/sync-elevenlabs-voices.ts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY mancante in .env");
  process.exit(1);
}

const BASE = "https://api.elevenlabs.io/v1";

type AccountVoice = {
  voice_id: string;
  name: string;
  category: string;
  labels?: {
    gender?: string;
    age?: string;
    use_case?: string;
  };
  preview_url?: string;
  verified_languages?: Array<{
    language: string;
    model_id: string;
    accent?: string;
    locale?: string;
    preview_url?: string;
  }>;
};

type SharedVoice = {
  voice_id: string;
  public_owner_id?: string;
  name: string;
  category: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  use_case?: string;
  description?: string;
  preview_url?: string;
  rate?: number;
};

async function fetchAccountVoices(): Promise<AccountVoice[]> {
  const res = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": ELEVENLABS_API_KEY! },
  });
  if (!res.ok) throw new Error(`account voices ${res.status}`);
  const json = (await res.json()) as { voices: AccountVoice[] };
  return json.voices;
}

async function fetchSharedItalianVoices(): Promise<SharedVoice[]> {
  const all: SharedVoice[] = [];
  let pageToken: string | null = null;
  let page = 0;

  while (true) {
    page++;
    const url = new URL(`${BASE}/shared-voices`);
    url.searchParams.set("language", "it");
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await fetch(url, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY! },
    });
    if (!res.ok) {
      console.error(
        `  shared-voices page ${page} → ${res.status}: ${await res.text()}`
      );
      break;
    }

    const json = (await res.json()) as {
      voices: SharedVoice[];
      has_more: boolean;
      last_sort_id?: string;
    };
    all.push(...json.voices);
    process.stdout.write(
      `\r  Shared voices: page ${page}, total ${all.length}`
    );

    if (!json.has_more) break;
    pageToken = json.last_sort_id ?? null;
    if (!pageToken) break;
    if (page > 50) break;
  }
  process.stdout.write("\n");
  return all;
}

async function main() {
  console.log("🔄 Sync ElevenLabs Italian voices\n");

  // 1) Account voices (filtra solo IT)
  console.log("[1/2] Fetching account voices...");
  const accountVoices = await fetchAccountVoices();
  const accountItalian = accountVoices.filter((v) =>
    (v.verified_languages ?? []).some(
      (vl) => (vl.language ?? "").toLowerCase() === "it"
    )
  );
  console.log(`     ${accountVoices.length} total, ${accountItalian.length} Italian`);

  // 2) Shared library Italian voices
  console.log("\n[2/2] Fetching shared/community Italian voices...");
  const sharedItalian = await fetchSharedItalianVoices();
  console.log(`     ${sharedItalian.length} shared Italian voices`);

  // Combine + dedupe by voice_id
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  // Account voices first (priority)
  for (const v of accountItalian) {
    if (seen.has(v.voice_id)) continue;
    seen.add(v.voice_id);

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
        gender: v.labels?.gender ?? null,
        category: v.category,
        useCase: v.labels?.use_case ?? null,
        ageRange: v.labels?.age ?? null,
        previewUrl: itLocale?.preview_url ?? v.preview_url ?? null,
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }

  // Shared voices
  for (const v of sharedItalian) {
    if (seen.has(v.voice_id)) continue;
    seen.add(v.voice_id);

    const result = await prisma.voice.upsert({
      where: { provider_id: { provider: "elevenlabs", id: v.voice_id } },
      create: {
        id: v.voice_id,
        provider: "elevenlabs",
        name: v.name,
        language: "it",
        gender: v.gender ?? null,
        category: "shared",
        useCase: v.use_case ?? null,
        ageRange: v.age ?? null,
        previewUrl: v.preview_url ?? null,
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
        gender: v.gender ?? null,
        useCase: v.use_case ?? null,
        ageRange: v.age ?? null,
        previewUrl: v.preview_url ?? null,
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }

  const total = await prisma.voice.count({
    where: { provider: "elevenlabs", language: "it" },
  });

  console.log(`\n✅ Done`);
  console.log(`   Created: ${created}, Updated: ${updated}`);
  console.log(`   Total Italian ElevenLabs voices in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error("\n❌ Sync failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
