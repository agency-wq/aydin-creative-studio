// GET /api/fal/models — lista i modelli image-to-video disponibili su fal.ai
// con costo/sec, durate supportate, aspect ratios, e quale e il default.

import { NextResponse } from "next/server";
import { listFalModels, DEFAULT_MODEL } from "@/lib/integrations/falai";

export async function GET() {
  const models = listFalModels();
  return NextResponse.json({
    defaultModel: DEFAULT_MODEL,
    models: models.map((m) => ({
      key: m.key,
      label: prettyLabel(m.key),
      costPerSecondUsd: m.costPerSecondUsd,
      supportedDurations: m.supportedDurations,
      supportedAspects: m.supportedAspects,
      // Cost preview per ogni durata supportata
      costPreviewUsd: m.supportedDurations.map((d) => ({
        duration: d,
        usd: Number((m.costPerSecondUsd * d).toFixed(2)),
      })),
    })),
  });
}

function prettyLabel(key: string): string {
  switch (key) {
    case "kling-2.6-pro":
      return "Kling 2.6 Pro · top quality";
    case "wan-2.5-720p":
      return "Wan 2.5 · 720p";
    case "wan-2.5-480p":
      return "Wan 2.5 · 480p (eco)";
    case "ltx-2.0":
      return "LTX 2.0 · ultra fast";
    case "veo-3.1-fast":
      return "Veo 3.1 Fast · Google";
    default:
      return key;
  }
}
