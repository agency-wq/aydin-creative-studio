// scripts/update-motion-presets.ts
// Aggiorna gli URL di style reference dei preset motion graphics
// usando video specifici (non canali) cosi possiamo estrarre il thumbnail YouTube.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const updates: Array<{
  name: string;
  styleReferenceUrl: string;
  description?: string;
}> = [
  {
    name: "VOX",
    // "How the rich avoid paying taxes" - VOX iconic
    styleReferenceUrl: "https://www.youtube.com/watch?v=UTl0AAr00wA",
  },
  {
    name: "Kurzgesagt",
    // "What Are You?" - Kurzgesagt iconic
    styleReferenceUrl: "https://www.youtube.com/watch?v=JQVmkDUkZT4",
  },
  {
    name: "Ali Abdaal",
    // "How I Manage My Time" - Ali Abdaal style
    styleReferenceUrl: "https://www.youtube.com/watch?v=iONDebHX9qk",
  },
  {
    name: "Skymography",
    // Original - same as user's screenshot
    styleReferenceUrl: "https://www.youtube.com/watch?v=k0ztN1siyc4",
  },
  {
    name: "MrBeast",
    // "I Built Willy Wonka's Chocolate Factory!" - MrBeast iconic
    styleReferenceUrl: "https://www.youtube.com/watch?v=cV2gBU6hKfY",
  },
  {
    name: "Dan Koe",
    // "The Art of Living a Meaningful Life" - Dan Koe philosophical
    styleReferenceUrl: "https://www.youtube.com/watch?v=Rf-2HyMkk-Y",
  },
  {
    name: "The Infographics Show",
    // "What If You Had To Survive 24 Hours With No Internet" - infographics style
    styleReferenceUrl: "https://www.youtube.com/watch?v=XL9I2yOFu74",
  },
  {
    name: "Aevy TV",
    // "Why You Need To Stop Being a Pessimist" - Aevy philosophical
    styleReferenceUrl: "https://www.youtube.com/watch?v=jZBbEDp0Bs0",
  },
  {
    name: "Johnny Harris",
    // "Why China is Building Islands in the South China Sea" - Johnny Harris geopolitics
    styleReferenceUrl: "https://www.youtube.com/watch?v=luTPMHC7zHY",
  },
  {
    name: "TED-Ed",
    // "The benefits of a bilingual brain" - TED-Ed iconic
    styleReferenceUrl: "https://www.youtube.com/watch?v=MMmOLN5zBLY",
  },
];

async function main() {
  console.log(`📺 Updating ${updates.length} motion graphics presets with YouTube video URLs...`);

  let updated = 0;
  for (const u of updates) {
    const result = await prisma.motionGraphicsPreset.updateMany({
      where: { name: u.name },
      data: { styleReferenceUrl: u.styleReferenceUrl },
    });
    if (result.count > 0) {
      updated++;
      console.log(`  ✓ ${u.name}`);
    } else {
      console.log(`  ✗ ${u.name} (non trovato)`);
    }
  }

  console.log(`\n✅ Updated ${updated}/${updates.length} presets`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
