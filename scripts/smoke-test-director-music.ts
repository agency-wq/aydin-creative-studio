// Smoke test: verifica che planVideoFromScript ritorni un VideoPlan con
// music field, sia nel path Claude (se API key presente) sia nel fallback.
// Esegui: pnpm tsx scripts/smoke-test-director-music.ts
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { planVideoFromScript } from "../src/lib/ai-director";

async function main() {
  const input = {
    script:
      "Ciao, sono un imprenditore italiano. Oggi ti parlo di marketing digitale e del 47 per cento di conversioni in piu che ho ottenuto negli ultimi 3 mesi. Ti spiego come funziona il mio metodo in 3 step semplici.",
    words: [
      { word: "Ciao", start: 0, end: 300 },
      { word: "sono", start: 400, end: 700 },
      { word: "un", start: 800, end: 900 },
      { word: "imprenditore", start: 1000, end: 1800 },
      { word: "italiano", start: 1900, end: 2500 },
      { word: "Oggi", start: 2700, end: 3000 },
      { word: "ti", start: 3100, end: 3200 },
      { word: "parlo", start: 3300, end: 3700 },
      { word: "di", start: 3800, end: 3900 },
      { word: "marketing", start: 4000, end: 4600 },
      { word: "digitale", start: 4700, end: 5300 },
      { word: "e", start: 5400, end: 5500 },
      { word: "del", start: 5600, end: 5800 },
      { word: "47", start: 5900, end: 6300 },
      { word: "per", start: 6400, end: 6600 },
      { word: "cento", start: 6700, end: 7000 },
      { word: "di", start: 7100, end: 7200 },
      { word: "conversioni", start: 7300, end: 7900 },
      { word: "in", start: 8000, end: 8100 },
      { word: "piu", start: 8200, end: 8400 },
      { word: "che", start: 8500, end: 8600 },
      { word: "ho", start: 8700, end: 8800 },
      { word: "ottenuto", start: 8900, end: 9500 },
      { word: "negli", start: 9600, end: 9800 },
      { word: "ultimi", start: 9900, end: 10200 },
      { word: "3", start: 10300, end: 10500 },
      { word: "mesi", start: 10600, end: 11000 },
      { word: "Ti", start: 11200, end: 11400 },
      { word: "spiego", start: 11500, end: 11900 },
      { word: "come", start: 12000, end: 12200 },
      { word: "funziona", start: 12300, end: 12800 },
      { word: "il", start: 12900, end: 13000 },
      { word: "mio", start: 13100, end: 13300 },
      { word: "metodo", start: 13400, end: 13800 },
      { word: "in", start: 13900, end: 14000 },
      { word: "3", start: 14100, end: 14300 },
      { word: "step", start: 14400, end: 14700 },
      { word: "semplici", start: 14800, end: 15500 },
    ],
    durationMs: 16000,
    themeName: "VOX",
    aspectRatio: "9:16" as const,
  };

  // --- Path 1: fallback statico (simuliamo assenza API key) ---
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  console.log("\n=== [1] Static fallback ===");
  const fbPlan = await planVideoFromScript(input);
  console.log("source:", fbPlan.source);
  console.log("MG count:", fbPlan.motionGraphics.length);
  console.log("broll count:", fbPlan.broll.length);
  console.log("music:", JSON.stringify(fbPlan.music, null, 2));
  console.log("strategy:", fbPlan.strategy);

  if (!fbPlan.music || !fbPlan.music.prompt) {
    throw new Error("[1] FAIL: fallback plan senza music.prompt");
  }
  if (fbPlan.music.duckingVolume < 0 || fbPlan.music.duckingVolume > 1) {
    throw new Error("[1] FAIL: duckingVolume fuori range");
  }

  // --- Path 2: Claude (se API key disponibile) ---
  if (savedKey) {
    process.env.ANTHROPIC_API_KEY = savedKey;
    console.log("\n=== [2] Claude planner ===");
    const plan = await planVideoFromScript(input, {
      log: (m) => console.log("  " + m),
    });
    console.log("source:", plan.source);
    console.log("MG count:", plan.motionGraphics.length);
    console.log("broll count:", plan.broll.length);
    console.log("music:", JSON.stringify(plan.music, null, 2));
    console.log("strategy:", plan.strategy);

    if (!plan.music || !plan.music.prompt) {
      throw new Error("[2] FAIL: Claude plan senza music.prompt");
    }
  } else {
    console.log("\n=== [2] SKIP Claude path (ANTHROPIC_API_KEY mancante) ===");
  }

  console.log("\n✅ smoke test OK");
}

main().catch((e) => {
  console.error("❌ smoke test FAIL:", e);
  process.exit(1);
});
