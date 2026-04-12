// Test isolato: estrai brand kit da un'immagine mockup.
// Uso: pnpm tsx scripts/test-brand-kit.ts <path-to-image>
//
// Se non passi un'immagine, crea un PNG di test con testo colorato.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import fs from "node:fs/promises";
import { extractBrandKit, brandKitToTheme } from "../src/lib/brand-kit";

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error("Uso: pnpm tsx scripts/test-brand-kit.ts <path-to-image>");
    console.error("Esempio: pnpm tsx scripts/test-brand-kit.ts ~/Desktop/guida-cover.jpg");
    process.exit(1);
  }

  console.log(`\n🖼️  Analizzando: ${imagePath}`);

  const buf = await fs.readFile(imagePath);
  const ext = imagePath.toLowerCase().split(".").pop();
  const mimeMap: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  const mime = mimeMap[ext ?? "jpg"] ?? "image/jpeg";

  console.log(`   Size: ${(buf.length / 1024).toFixed(1)} KB | MIME: ${mime}\n`);

  const kit = await extractBrandKit(buf, mime, (msg) => console.log(`   ${msg}`));

  console.log(`\n${"=".repeat(50)}`);
  console.log("🎨 BRAND KIT ESTRATTO:");
  console.log(`${"=".repeat(50)}`);
  console.log(JSON.stringify(kit, null, 2));

  const theme = brandKitToTheme(kit, "Test Client");
  console.log(`\n📐 MG THEME GENERATO:`);
  console.log(JSON.stringify(theme, null, 2));

  console.log(`\n✅ Done!\n`);
}

main().catch((e) => {
  console.error("❌ ERRORE:", e);
  process.exit(1);
});
