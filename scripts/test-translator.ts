// Test isolato del mg-translator: prende descrizioni creative e le traduce in RenderSpec.
// Uso: pnpm tsx scripts/test-translator.ts

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { translateToRenderSpec } from "../src/lib/mg-translator";
import { getTheme } from "../src/remotion/motion-graphics/themes-data";
import fs from "node:fs/promises";

const TEST_DESCRIPTIONS = [
  // 1. Numero con glow
  `Grande numero 73% al centro con effetto neon glow pulsante color accent. Il numero appare con un spring pop deciso dal basso, scuotendosi leggermente prima di stabilizzarsi. Sotto, la scritta "DEI CLIENTI SODDISFATTI" in maiuscolo, font body, colore testo con opacità 70%, che scivola dal basso con un fade ritardato. Tra numero e testo, una linea sottile color accent che si espande dal centro verso i lati.`,

  // 2. Split screen / confronto
  `Split screen verticale: metà sinistra con sfondo scuro e la scritta "PRIMA" in rosso con effetto glitch sottile, metà destra con sfondo gradient accent→support e la scritta "DOPO" in bianco luminoso. La linea di divisione è una striscia verticale luminosa accent che si muove da sinistra verso il centro con un wipe reveal. I testi appaiono con spring pop staggerato.`,

  // 3. Card glassmorphism
  `Card glassmorphism centrata: sfondo bianco semi-trasparente con backdrop-blur forte, bordi arrotondati 24px, ombra diffusa. Dentro: emoji 🚀 grande (64px) in alto, sotto il numero "3X" in font display enorme color accent, sotto ancora "PIÙ VELOCE" in maiuscolo font body spaziato. La card appare con scale-in da 0.8 a 1.0 con spring bounce. Angolo in alto a destra: piccolo cerchio pulsante color support.`,
];

async function main() {
  const theme = getTheme("VOX");
  console.log(`\n🎨 Theme: ${theme.name}`);
  console.log(`   accent=${theme.accentColor} text=${theme.textColor} bg=${theme.bgColor}\n`);

  for (let i = 0; i < TEST_DESCRIPTIONS.length; i++) {
    const desc = TEST_DESCRIPTIONS[i];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📝 MG #${i + 1}: ${desc.slice(0, 80)}...`);
    console.log(`${"=".repeat(70)}`);

    const spec = await translateToRenderSpec({
      description: desc,
      theme,
      width: 1080,
      height: 1920,
      log: (m) => console.log(`   ${m}`),
    });

    console.log(`\n✅ Risultato: ${spec.elements.length} elementi root`);

    // Conta ricorsivamente tutti gli elementi
    function countAll(elements: typeof spec.elements): number {
      let n = elements.length;
      for (const el of elements) {
        if (el.children) n += countAll(el.children);
      }
      return n;
    }
    const totalElements = countAll(spec.elements);
    console.log(`   Elementi totali (con figli): ${totalElements}`);

    // Salva JSON
    const outPath = `/tmp/mg-test/translated-${i + 1}.json`;
    await fs.writeFile(outPath, JSON.stringify(spec, null, 2));
    console.log(`   JSON salvato: ${outPath}`);
  }

  console.log(`\n✅ Tutti i test completati!\n`);
}

main().catch((e) => {
  console.error("❌ ERRORE:", e);
  process.exit(1);
});
