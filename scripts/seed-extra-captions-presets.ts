// scripts/seed-extra-captions-presets.ts
// Aggiunge ulteriori preset captions oltre i 5 base

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const presets = [
  {
    name: "Karaoke",
    description: "Highlight della parola corrente sotto, classico karaoke",
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
    description: "Parole che scoppiano in 3D con bounce + scale animata",
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
    description: "Stile MrBeast: emoji + colori vivaci + scale on emphasis",
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
    description: "Stile NYT/magazine, sobrio, serif elegante",
    remotionComponent: "Editorial",
    defaultProps: {
      fontFamily: "Playfair Display",
      fontSize: 56,
      color: "#FFFFFF",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
  },
  // ============== NUOVI PRESET ==============
  {
    name: "Glow",
    description: "Testo bianco con halo neon che pulsa al beat",
    remotionComponent: "Glow",
    defaultProps: {
      fontFamily: "Inter",
      fontSize: 72,
      color: "#FFFFFF",
      glowColor: "#00E5FF",
      glowIntensity: 24,
    },
  },
  {
    name: "Typewriter",
    description: "Effetto macchina da scrivere lettera per lettera",
    remotionComponent: "Typewriter",
    defaultProps: {
      fontFamily: "JetBrains Mono",
      fontSize: 56,
      color: "#FFFFFF",
      cursor: true,
      cursorBlink: true,
    },
  },
  {
    name: "Highlight Box",
    description: "Box giallo evidenziatore dietro le parole chiave",
    remotionComponent: "HighlightBox",
    defaultProps: {
      fontFamily: "Inter",
      fontSize: 64,
      color: "#000000",
      highlightColor: "#FFEE00",
      padding: 8,
    },
  },
  {
    name: "Subtitle Bar",
    description: "Barra inferiore con sfondo sfumato, leggibilita massima",
    remotionComponent: "SubtitleBar",
    defaultProps: {
      fontFamily: "Inter",
      fontSize: 44,
      color: "#FFFFFF",
      backgroundColor: "linear-gradient(180deg, transparent, rgba(0,0,0,0.85))",
      position: "bottom",
    },
  },
  {
    name: "Word Stack",
    description: "Una parola alla volta al centro, full screen",
    remotionComponent: "WordStack",
    defaultProps: {
      fontFamily: "Inter",
      fontSize: 144,
      color: "#FFFFFF",
      align: "center",
      uppercase: true,
    },
  },
  {
    name: "TikTok Bold",
    description: "Stile TikTok: bianco grosso con bordo nero, capslock",
    remotionComponent: "TikTokBold",
    defaultProps: {
      fontFamily: "Inter",
      fontSize: 72,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 4,
      uppercase: true,
    },
  },
  {
    name: "Comic",
    description: "Stile fumetto con bubble bianco e ombra",
    remotionComponent: "Comic",
    defaultProps: {
      fontFamily: "Bangers",
      fontSize: 68,
      color: "#000000",
      bubbleColor: "#FFFFFF",
      shadow: true,
    },
  },
];

async function main() {
  console.log(`🎨 Seeding ${presets.length} captions presets...`);

  for (const p of presets) {
    await prisma.captionsPreset.upsert({
      where: { name: p.name },
      create: p,
      update: { description: p.description, defaultProps: p.defaultProps },
    });
  }

  const total = await prisma.captionsPreset.count();
  console.log(`✓ Done. Total captions presets: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
