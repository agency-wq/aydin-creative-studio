// =============================================================================
// QA Agent — controlla e corregge automaticamente ogni fase della pipeline.
// =============================================================================
//
// Agisce come un quality controller umano: valida output, enforce regole,
// e auto-corregge problemi dove possibile. Se non può correggere, logga un
// warning e lascia passare (best-effort, non blocca la pipeline).
//
// Moduli:
//   1. validateScript()      — controlla TTS safety, word count, format
//   2. validateVideoPlan()    — controlla timing, overlap, varietà template
//   3. fixVideoPlan()         — auto-corregge problemi nel piano video
//   4. validateTimeline()     — controlla contiguità e completezza segmenti

import { type VideoPlan, type PlannedMG, type PlannedBroll } from "./ai-director";
import { type ScriptVariant } from "./script-generator";

// Costanti per validazione descrizioni MG creative
const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 2000;

// =============================================================================
// Logger — usa un prefisso [QA] per distinguere i log del QA
// =============================================================================

function log(level: "info" | "warn" | "error", msg: string, data?: Record<string, unknown>): void {
  const prefix = `[QA-Agent]`;
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  switch (level) {
    case "info":  console.log(`${prefix} ✅ ${msg}${payload}`); break;
    case "warn":  console.warn(`${prefix} ⚠️  ${msg}${payload}`); break;
    case "error": console.error(`${prefix} ❌ ${msg}${payload}`); break;
  }
}

// =============================================================================
// Types
// =============================================================================

export type QAIssue = {
  severity: "error" | "warning" | "info";
  step: string;
  message: string;
  autoFixed: boolean;
};

export type QAReport = {
  passed: boolean;
  issues: QAIssue[];
  fixesApplied: number;
};

// =============================================================================
// 1. Script Validation — TTS safety, word count, format
// =============================================================================

const TTS_FORBIDDEN_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /[😀-🙏🌀-🗿🚀-🛿🤀-🧿🩰-🫿]+/u, message: "Emoji trovata nello script" },
  { pattern: /#{1,}/g, message: "Hashtag (#) trovato — il TTS legge 'hashtag'" },
  { pattern: /https?:\/\/\S+/gi, message: "URL trovato — il TTS lo delettera" },
  { pattern: /\[.*?\]/g, message: "Parentesi quadre trovate — il TTS le legge" },
  { pattern: /\*[^*]+\*/g, message: "Asterischi (enfasi) trovati — il TTS li ignora" },
  { pattern: /!{2,}/g, message: "Punti esclamativi multipli (!!!) — grottesco per TTS" },
  { pattern: /\?{2,}/g, message: "Punti interrogativi multipli (???) — grottesco per TTS" },
  { pattern: /\(ride\)|\(sospira\)|\(sussurra\)/gi, message: "Stage direction trovata — l'avatar non interpreta" },
  { pattern: /dott\./gi, message: "Abbreviazione 'dott.' — scrivere 'dottore'" },
  { pattern: /dott\.ssa/gi, message: "Abbreviazione 'dott.ssa' — scrivere 'dottoressa'" },
  { pattern: /\bes\.\s/gi, message: "Abbreviazione 'es.' — scrivere 'per esempio'" },
  { pattern: /\d+%/g, message: "Simbolo '%' trovato — scrivere 'percento'" },
  { pattern: /\d+€|€\d+/g, message: "Simbolo '€' trovato — scrivere 'euro'" },
];

export function validateScript(variant: ScriptVariant, targetMin: number, targetMax: number): QAIssue[] {
  const issues: QAIssue[] = [];
  const { script, wordCount, framework, tone } = variant;

  // Word count
  const actualWords = script.trim().split(/\s+/).length;
  if (actualWords < targetMin * 0.85) {
    issues.push({
      severity: "warning",
      step: "script",
      message: `Script troppo corto: ${actualWords} parole (target: ${targetMin}-${targetMax})`,
      autoFixed: false,
    });
  }
  if (actualWords > targetMax * 1.15) {
    issues.push({
      severity: "warning",
      step: "script",
      message: `Script troppo lungo: ${actualWords} parole (target: ${targetMin}-${targetMax})`,
      autoFixed: false,
    });
  }

  // TTS safety
  for (const check of TTS_FORBIDDEN_PATTERNS) {
    if (check.pattern.test(script)) {
      issues.push({
        severity: "warning",
        step: "script-tts",
        message: check.message,
        autoFixed: false,
      });
    }
    // Reset regex lastIndex
    check.pattern.lastIndex = 0;
  }

  // Exclamation marks count
  const exclamations = (script.match(/!/g) || []).length;
  if (exclamations > 2) {
    issues.push({
      severity: "warning",
      step: "script-tts",
      message: `Troppi punti esclamativi: ${exclamations} (max consigliato: 1-2)`,
      autoFixed: false,
    });
  }

  // Framework validation
  if (!framework || framework.trim() === "") {
    issues.push({
      severity: "error",
      step: "script",
      message: "Framework mancante nella variante",
      autoFixed: false,
    });
  }

  // Tone validation
  const validTones = new Set(["urgente", "educativo", "emotivo", "provocatorio", "professionale"]);
  if (!validTones.has(tone)) {
    issues.push({
      severity: "warning",
      step: "script",
      message: `Tono invalido: "${tone}" — deve essere uno di: ${[...validTones].join(", ")}`,
      autoFixed: false,
    });
  }

  // Script starts with greeting (retention killer)
  if (/^(ciao|buongiorno|buonasera|salve|hey)\b/i.test(script.trim())) {
    issues.push({
      severity: "warning",
      step: "script",
      message: "Script inizia con saluto ('Ciao/Buongiorno') — killer di retention",
      autoFixed: false,
    });
  }

  // Script is empty
  if (!script.trim()) {
    issues.push({
      severity: "error",
      step: "script",
      message: "Script vuoto",
      autoFixed: false,
    });
  }

  return issues;
}

/** Valida un array di varianti e controlla diversità framework */
export function validateScriptVariants(
  variants: ScriptVariant[],
  targetMin: number,
  targetMax: number
): QAReport {
  const issues: QAIssue[] = [];

  // Per-variant checks
  for (const v of variants) {
    issues.push(...validateScript(v, targetMin, targetMax));
  }

  // Framework diversity
  const frameworks = variants.map((v) => v.framework.toLowerCase().trim());
  const uniqueFrameworks = new Set(frameworks);
  if (uniqueFrameworks.size < variants.length) {
    const dupes = frameworks.filter((f, i) => frameworks.indexOf(f) !== i);
    issues.push({
      severity: "warning",
      step: "script-variety",
      message: `Framework duplicati: ${dupes.join(", ")}`,
      autoFixed: false,
    });
  }

  // Tone diversity
  const tones = variants.map((v) => v.tone);
  const uniqueTones = new Set(tones);
  if (uniqueTones.size === 1 && variants.length > 1) {
    issues.push({
      severity: "info",
      step: "script-variety",
      message: `Tutte le varianti hanno lo stesso tono: "${tones[0]}" — consigliata più varietà`,
      autoFixed: false,
    });
  }

  const passed = !issues.some((i) => i.severity === "error");

  // Log report
  if (issues.length === 0) {
    log("info", `Script validation passed: ${variants.length} varianti OK`);
  } else {
    for (const issue of issues) {
      log(issue.severity === "error" ? "error" : "warn", issue.message);
    }
  }

  return { passed, issues, fixesApplied: 0 };
}

// =============================================================================
// 2. VideoPlan Validation — timing, overlap, varietà template
// =============================================================================

export function validateVideoPlan(plan: VideoPlan): QAReport {
  const issues: QAIssue[] = [];

  // --- Motion Graphics checks (sistema senza template — valida descriptions) ---
  for (const mg of plan.motionGraphics) {
    // Description quality
    if (!mg.description || typeof mg.description !== "string") {
      issues.push({
        severity: "error",
        step: "video-plan-mg",
        message: `MG senza descrizione @ ${mg.startMs}ms`,
        autoFixed: false,
      });
    } else if (mg.description.length < MIN_DESCRIPTION_LENGTH) {
      issues.push({
        severity: "warning",
        step: "video-plan-mg",
        message: `MG descrizione troppo corta (${mg.description.length} chars, min ${MIN_DESCRIPTION_LENGTH}) @ ${mg.startMs}ms: "${mg.description.slice(0, 40)}..."`,
        autoFixed: false,
      });
    } else if (mg.description.length > MAX_DESCRIPTION_LENGTH) {
      issues.push({
        severity: "warning",
        step: "video-plan-mg",
        message: `MG descrizione troppo lunga (${mg.description.length} chars, max ${MAX_DESCRIPTION_LENGTH}) @ ${mg.startMs}ms`,
        autoFixed: false,
      });
    }

    // Duration
    const dur = mg.endMs - mg.startMs;
    if (dur < 1200) {
      issues.push({
        severity: "warning",
        step: "video-plan-mg",
        message: `MG troppo corta: ${dur}ms (min 1500ms) @ ${mg.startMs}ms`,
        autoFixed: false,
      });
    }
    if (dur > 4500) {
      issues.push({
        severity: "warning",
        step: "video-plan-mg",
        message: `MG troppo lunga: ${dur}ms (max 4000ms) @ ${mg.startMs}ms`,
        autoFixed: false,
      });
    }

    // Timing
    if (mg.startMs >= mg.endMs) {
      issues.push({
        severity: "error",
        step: "video-plan-mg",
        message: `MG timing invalido: start=${mg.startMs} >= end=${mg.endMs}`,
        autoFixed: false,
      });
    }
  }

  // --- B-roll checks ---
  for (const br of plan.broll) {
    if (!br.query.trim()) {
      issues.push({
        severity: "error",
        step: "video-plan-broll",
        message: `Broll senza query @ ${br.startMs}ms`,
        autoFixed: false,
      });
    }

    const dur = br.endMs - br.startMs;
    if (dur < 1200) {
      issues.push({
        severity: "warning",
        step: "video-plan-broll",
        message: `Broll troppo corta: ${dur}ms @ ${br.startMs}ms`,
        autoFixed: false,
      });
    }
  }

  // --- Overlap check (MG + broll combined) ---
  const allCutaways = [
    ...plan.motionGraphics.map((m) => ({ start: m.startMs, end: m.endMs, type: "MG" as const, name: m.description.slice(0, 30) })),
    ...plan.broll.map((b) => ({ start: b.startMs, end: b.endMs, type: "broll" as const, name: b.query.slice(0, 30) })),
  ].sort((a, b) => a.start - b.start);

  for (let i = 1; i < allCutaways.length; i++) {
    const prev = allCutaways[i - 1];
    const curr = allCutaways[i];
    if (curr.start < prev.end) {
      issues.push({
        severity: "warning",
        step: "video-plan-overlap",
        message: `Overlap: ${prev.type}@${prev.start}-${prev.end} vs ${curr.type}@${curr.start}-${curr.end}`,
        autoFixed: false,
      });
    }
  }

  // --- Music checks ---
  if (plan.music) {
    if (!plan.music.prompt.trim()) {
      issues.push({
        severity: "warning",
        step: "video-plan-music",
        message: "Music prompt vuoto",
        autoFixed: false,
      });
    }
    if (plan.music.duckingVolume < 0.05 || plan.music.duckingVolume > 0.5) {
      issues.push({
        severity: "warning",
        step: "video-plan-music",
        message: `Ducking volume fuori range: ${plan.music.duckingVolume} (expected 0.10-0.30)`,
        autoFixed: false,
      });
    }
  }

  // --- MG/broll ratio ---
  const totalCutaways = plan.motionGraphics.length + plan.broll.length;
  if (totalCutaways > 0) {
    const mgRatio = plan.motionGraphics.length / totalCutaways;
    if (mgRatio < 0.5) {
      issues.push({
        severity: "warning",
        step: "video-plan-ratio",
        message: `Ratio MG troppo basso: ${(mgRatio * 100).toFixed(0)}% (target ≥65%)`,
        autoFixed: false,
      });
    }
  }

  const passed = !issues.some((i) => i.severity === "error");

  if (issues.length === 0) {
    log("info", `Video plan validation passed: ${plan.motionGraphics.length} MG + ${plan.broll.length} broll`);
  } else {
    log("info", `Video plan: ${issues.length} issues found`);
    for (const issue of issues) {
      log(issue.severity === "error" ? "error" : "warn", issue.message);
    }
  }

  return { passed, issues, fixesApplied: 0 };
}

// =============================================================================
// 3. Auto-fix VideoPlan — corregge problemi dove possibile
// =============================================================================

export function fixVideoPlan(plan: VideoPlan): { plan: VideoPlan; fixesApplied: number } {
  let fixes = 0;

  // Fix MG
  const fixedMG: PlannedMG[] = [];
  for (const mg of plan.motionGraphics) {
    // Skip MG senza descrizione valida
    if (!mg.description || typeof mg.description !== "string" || mg.description.trim().length < 10) {
      log("warn", `Rimosso MG con descrizione invalida @ ${mg.startMs}ms`);
      fixes++;
      continue;
    }

    // Skip bad timing
    if (mg.startMs >= mg.endMs) {
      log("warn", `Rimosso MG con timing invalido: ${mg.startMs}-${mg.endMs}`);
      fixes++;
      continue;
    }

    // Clamp duration
    let { startMs, endMs } = mg;
    const dur = endMs - startMs;
    if (dur < 1500) {
      endMs = startMs + 1500;
      fixes++;
      log("info", `Esteso MG "${mg.description.slice(0, 30)}..." a 1500ms`);
    }
    if (dur > 4000) {
      endMs = startMs + 4000;
      fixes++;
      log("info", `Tagliato MG "${mg.description.slice(0, 30)}..." a 4000ms`);
    }

    // Trunca descrizioni eccessivamente lunghe
    let { description } = mg;
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH);
      fixes++;
      log("info", `Troncata descrizione MG troppo lunga @ ${startMs}ms`);
    }

    fixedMG.push({ ...mg, startMs, endMs, description });
  }

  // Fix broll
  const fixedBroll: PlannedBroll[] = [];
  for (const br of plan.broll) {
    if (!br.query.trim()) {
      log("warn", "Rimosso broll senza query");
      fixes++;
      continue;
    }
    if (br.startMs >= br.endMs) {
      log("warn", `Rimosso broll con timing invalido: ${br.startMs}-${br.endMs}`);
      fixes++;
      continue;
    }

    let { startMs, endMs } = br;
    const dur = endMs - startMs;
    if (dur < 1500) { endMs = startMs + 1500; fixes++; }
    if (dur > 4000) { endMs = startMs + 4000; fixes++; }

    fixedBroll.push({ ...br, startMs, endMs });
  }

  // Fix music volumes
  let fixedMusic = plan.music;
  if (fixedMusic) {
    let changed = false;
    let { duckingVolume, fullVolume } = fixedMusic;
    if (duckingVolume < 0.05) { duckingVolume = 0.15; changed = true; }
    if (duckingVolume > 0.5) { duckingVolume = 0.25; changed = true; }
    if (fullVolume < 0.3) { fullVolume = 0.5; changed = true; }
    if (fullVolume > 1.0) { fullVolume = 0.7; changed = true; }
    if (changed) {
      fixedMusic = { ...fixedMusic, duckingVolume, fullVolume };
      fixes++;
      log("info", "Fixato volume musica fuori range");
    }
  }

  return {
    plan: {
      ...plan,
      motionGraphics: fixedMG,
      broll: fixedBroll,
      music: fixedMusic,
    },
    fixesApplied: fixes,
  };
}

// =============================================================================
// 4. TTS Script Auto-Fix — corregge problemi comuni nello script
// =============================================================================

export function fixScriptForTTS(script: string): { script: string; fixesApplied: number } {
  let fixed = script;
  let fixes = 0;

  // Fix: % → percento
  const pctMatches = fixed.match(/(\d+)%/g);
  if (pctMatches) {
    fixed = fixed.replace(/(\d+)%/g, "$1 percento");
    fixes += pctMatches.length;
  }

  // Fix: € → euro
  const euroMatches = fixed.match(/€\s*(\d+)/g) || fixed.match(/(\d+)\s*€/g);
  if (euroMatches) {
    fixed = fixed.replace(/€\s*(\d+)/g, "$1 euro");
    fixed = fixed.replace(/(\d+)\s*€/g, "$1 euro");
    fixes += euroMatches.length;
  }

  // Fix: dott. → dottore
  if (/\bdott\.\s/gi.test(fixed)) {
    fixed = fixed.replace(/\bdott\.\s/gi, "dottore ");
    fixes++;
  }

  // Fix: dott.ssa → dottoressa
  if (/\bdott\.ssa\b/gi.test(fixed)) {
    fixed = fixed.replace(/\bdott\.ssa\b/gi, "dottoressa");
    fixes++;
  }

  // Fix: es. → per esempio
  if (/\bes\.\s/gi.test(fixed)) {
    fixed = fixed.replace(/\bes\.\s/gi, "per esempio ");
    fixes++;
  }

  // Fix: multiple !!! → single !
  if (/!{2,}/.test(fixed)) {
    fixed = fixed.replace(/!{2,}/g, "!");
    fixes++;
  }

  // Fix: multiple ??? → single ?
  if (/\?{2,}/.test(fixed)) {
    fixed = fixed.replace(/\?{2,}/g, "?");
    fixes++;
  }

  // Fix: remove emoji (basic range)
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  if (emojiRegex.test(fixed)) {
    fixed = fixed.replace(emojiRegex, "");
    fixes++;
  }

  // Fix: remove hashtags
  if (/#\w+/.test(fixed)) {
    fixed = fixed.replace(/#(\w+)/g, "$1");
    fixes++;
  }

  // Clean up double spaces
  fixed = fixed.replace(/\s{2,}/g, " ").trim();

  if (fixes > 0) {
    log("info", `Script TTS auto-fix: ${fixes} correzioni applicate`);
  }

  return { script: fixed, fixesApplied: fixes };
}

// =============================================================================
// 5. Full Pipeline QA Report
// =============================================================================

export function generatePipelineReport(
  scriptIssues: QAReport | null,
  planIssues: QAReport | null,
): string {
  const lines: string[] = [
    "═══════════════════════════════════════",
    "         QA AGENT — REPORT FINALE",
    "═══════════════════════════════════════",
  ];

  if (scriptIssues) {
    lines.push("");
    lines.push(`📝 SCRIPT: ${scriptIssues.passed ? "PASSED ✅" : "ISSUES FOUND ⚠️"}`);
    lines.push(`   Issues: ${scriptIssues.issues.length} | Fixes: ${scriptIssues.fixesApplied}`);
    for (const i of scriptIssues.issues) {
      const icon = i.severity === "error" ? "❌" : i.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`   ${icon} [${i.step}] ${i.message}${i.autoFixed ? " (auto-fixato)" : ""}`);
    }
  }

  if (planIssues) {
    lines.push("");
    lines.push(`🎬 VIDEO PLAN: ${planIssues.passed ? "PASSED ✅" : "ISSUES FOUND ⚠️"}`);
    lines.push(`   Issues: ${planIssues.issues.length} | Fixes: ${planIssues.fixesApplied}`);
    for (const i of planIssues.issues) {
      const icon = i.severity === "error" ? "❌" : i.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`   ${icon} [${i.step}] ${i.message}${i.autoFixed ? " (auto-fixato)" : ""}`);
    }
  }

  lines.push("");
  lines.push("═══════════════════════════════════════");

  return lines.join("\n");
}
