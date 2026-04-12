// Costruisce un prompt unico per OGNI motion graphics clip di un project,
// in modo che le N clip generate siano DIVERSE fra loro e contestualizzate
// allo script del project (non tutte uguali col prompt copia-incolla del preset).
//
// Strategia:
//   - usa Claude Sonnet via @anthropic-ai/sdk se ANTHROPIC_API_KEY esiste
//   - altrimenti fallback statico deterministico (combina preset.prompt + script segment + camera direction)
//
// Output: array di N stringhe, una per clip.

import Anthropic from "@anthropic-ai/sdk";
import { applyEthnicityConstraint } from "./ethnicity-filter";

const CAMERA_DIRECTIONS = [
  "slow zoom in (cinematic dolly)",
  "slow zoom out reveal",
  "subtle lateral pan from left to right",
  "subtle lateral pan from right to left",
  "static composition with internal element animation",
  "punch-in opening, holds, then settles",
  "graceful fade-in and slow drift upward",
];

export type ClipPromptInput = {
  presetName: string;
  presetPrompt: string;
  script: string;
  count: number;
  durationSec: number;
};

/**
 * Divide lo script in N segmenti contigui di lunghezza approssimativamente uguale.
 * Ogni segmento e il "topic" della clip i-esima.
 */
function segmentScript(script: string, n: number): string[] {
  const cleaned = script.replace(/\s+/g, " ").trim();
  if (n <= 1) return [cleaned];
  // Split su frasi, poi raggruppa
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= n) {
    // Pad se necessario
    while (sentences.length < n) sentences.push(cleaned);
    return sentences;
  }
  const out: string[] = [];
  const per = Math.ceil(sentences.length / n);
  for (let i = 0; i < n; i++) {
    out.push(sentences.slice(i * per, (i + 1) * per).join(" "));
  }
  return out;
}

// =============================================================================
// Static fallback (no API call)
// =============================================================================

function buildStaticPrompts(input: ClipPromptInput): string[] {
  const segments = segmentScript(input.script, input.count);
  return segments.map((seg, i) => {
    const camera = CAMERA_DIRECTIONS[i % CAMERA_DIRECTIONS.length];
    const topic = seg.length > 180 ? seg.slice(0, 180).trim() + "..." : seg;
    const prompt =
      `${input.presetPrompt} ` +
      `Topic of this specific clip: "${topic}". ` +
      `Camera: ${camera}. ` +
      `Duration: ${input.durationSec}s. Vertical 9:16 cinematic aesthetic, polished motion design.`;
    return applyEthnicityConstraint(prompt);
  });
}

// =============================================================================
// Claude Sonnet (preferred when API key present)
// =============================================================================

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (anthropic) return anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  anthropic = new Anthropic({ apiKey: key });
  return anthropic;
}

async function buildPromptsWithClaude(input: ClipPromptInput): Promise<string[]> {
  const client = getAnthropic();
  if (!client) throw new Error("ANTHROPIC_API_KEY non impostato");

  const segments = segmentScript(input.script, input.count);

  const systemPrompt = [
    "You are a creative director for short-form vertical videos (9:16, 60s).",
    "You write image-to-video prompts for fal.ai Kling 2.6 Pro that produce CINEMATIC motion graphics in a specific YouTuber's visual style.",
    "Every prompt MUST be unique, vivid, and tied to the topic of that clip. Avoid generic phrases.",
    "Prompts MUST describe: (1) the visual element shown (typography, chart, illustration, particle, transition), (2) the camera movement, (3) the color/lighting palette consistent with the reference style.",
    "If any people appear, they must be European/Caucasian only — never depict African, Black, Asian, Chinese, Japanese, Korean, Indian, South Asian, Middle Eastern or Arab people.",
    "Output strictly as a JSON array of strings, one per clip, no preamble.",
  ].join(" ");

  const userPrompt = [
    `Style preset: ${input.presetName}`,
    `Style description: ${input.presetPrompt}`,
    `Total clips needed: ${input.count}`,
    `Each clip duration: ${input.durationSec}s`,
    "",
    "Topics per clip (1 segment = 1 clip):",
    ...segments.map((s, i) => `${i + 1}. ${s.slice(0, 280)}`),
    "",
    `Camera direction suggestions (vary across clips): ${CAMERA_DIRECTIONS.join("; ")}.`,
    "",
    "Return EXACTLY a JSON array of " + input.count + " strings, one per clip, in topic order.",
  ].join("\n");

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Parse: aspettiamo un JSON array. Tolleriamo prefissi/suffissi.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Claude non ha ritornato JSON array: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Output Claude non e un array");
  const prompts = parsed.map((p) => String(p));

  // Pad/trim to exact count
  while (prompts.length < input.count) prompts.push(prompts[prompts.length - 1] ?? input.presetPrompt);
  prompts.length = input.count;

  // Applica ethnicity constraint (idempotente, in caso Claude lo abbia gia incluso)
  return prompts.map(applyEthnicityConstraint);
}

// =============================================================================
// Public entry
// =============================================================================

export async function buildClipPrompts(
  input: ClipPromptInput,
  opts: { log?: (msg: string) => void } = {}
): Promise<string[]> {
  const log = opts.log ?? (() => {});
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const prompts = await buildPromptsWithClaude(input);
      log(`prompt-builder: Claude Sonnet ha generato ${prompts.length} prompt unici`);
      return prompts;
    } catch (e) {
      log(`prompt-builder: Claude fallita (${(e as Error).message}), fallback a statico`);
    }
  }
  const prompts = buildStaticPrompts(input);
  log(`prompt-builder: usato fallback statico (${prompts.length} prompt)`);
  return prompts;
}
