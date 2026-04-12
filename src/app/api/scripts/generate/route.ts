import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { NextResponse } from "next/server";
import {
  generateScripts,
  type GenerateInput,
  type ScriptTone,
  type ScriptLength,
} from "@/lib/script-generator";
import {
  validateScriptVariants,
  fixScriptForTTS,
  type QAReport,
} from "@/lib/qa-agent";

const VALID_TONES = new Set<string>([
  "urgente",
  "educativo",
  "emotivo",
  "provocatorio",
  "professionale",
]);

const VALID_LENGTHS = new Set<string>(["30s", "60s", "90s"]);

const WORD_TARGETS: Record<string, { min: number; max: number }> = {
  "30s": { min: 60, max: 90 },
  "60s": { min: 120, max: 170 },
  "90s": { min: 180, max: 250 },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const briefText = String(body.briefText ?? "").trim();
    if (!briefText) {
      return NextResponse.json(
        { error: "briefText è obbligatorio" },
        { status: 400 }
      );
    }
    if (briefText.length > 50000) {
      return NextResponse.json(
        { error: "briefText troppo lungo (max 50.000 caratteri)" },
        { status: 400 }
      );
    }

    const length: ScriptLength =
      body.length && VALID_LENGTHS.has(String(body.length))
        ? (String(body.length) as ScriptLength)
        : "60s";

    const input: GenerateInput = {
      briefText,
      clientName: body.clientName ? String(body.clientName).slice(0, 200) : undefined,
      niche: body.niche ? String(body.niche).slice(0, 200) : undefined,
      targetAudience: body.targetAudience
        ? String(body.targetAudience).slice(0, 500)
        : undefined,
      tone:
        body.tone && VALID_TONES.has(String(body.tone))
          ? (String(body.tone) as ScriptTone)
          : undefined,
      length,
      variants:
        typeof body.variants === "number"
          ? Math.max(1, Math.min(5, body.variants))
          : 3,
    };

    const result = await generateScripts(input);

    // ─── QA Agent: auto-fix TTS + validate ───
    const targets = WORD_TARGETS[length];
    let totalTTSFixes = 0;

    // Auto-fix each variant's script for TTS safety
    for (const variant of result.variants) {
      const { script: fixed, fixesApplied } = fixScriptForTTS(variant.script);
      if (fixesApplied > 0) {
        variant.script = fixed;
        variant.wordCount = fixed.trim().split(/\s+/).length;
        totalTTSFixes += fixesApplied;
      }
    }

    // Validate all variants (framework diversity, tone diversity, TTS safety)
    const qaReport: QAReport = validateScriptVariants(
      result.variants,
      targets.min,
      targets.max
    );

    return NextResponse.json({
      ...result,
      qa: {
        passed: qaReport.passed,
        ttsFixes: totalTTSFixes,
        issues: qaReport.issues,
      },
    });
  } catch (err) {
    console.error("[api/scripts/generate]", err);
    const message =
      err instanceof Error ? err.message : "Errore interno nella generazione script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
