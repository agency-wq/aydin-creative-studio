// POST /api/projects/[id]/motion-graphics
// Body: { presetId: string, prompt?: string, duration?: 4|6|8 }
// Genera una nuova MotionGraphicsClip via fal.ai (Veo 3.1 Fast).
//
// Modalita "fire-and-forget": crea un record in PENDING, lancia la generazione
// in background (no await), ritorna subito 202 con l'id della clip.
// Il frontend polla lo stato.
//
// GET /api/projects/[id]/motion-graphics
// Ritorna tutte le clip per il project.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generateMotionGraphicsClip,
  DEFAULT_MODEL,
  estimateClipCostUsd,
  type FalModelKey,
} from "@/lib/integrations/falai";
import { resolveStyleFrames } from "@/lib/style-frames";
import { applyEthnicityConstraint } from "@/lib/ethnicity-filter";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clips = await prisma.motionGraphicsClip.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clips);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const presetId = String(body?.presetId ?? "");
  const customPrompt = typeof body?.prompt === "string" ? body.prompt : undefined;
  const duration: number = [4, 5, 6, 8, 10].includes(body?.duration) ? body.duration : 5;
  const model: FalModelKey = (body?.model as FalModelKey) || DEFAULT_MODEL;

  if (!presetId) {
    return NextResponse.json({ message: "presetId richiesto" }, { status: 400 });
  }

  const [project, preset] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.motionGraphicsPreset.findUnique({ where: { id: presetId } }),
  ]);
  if (!project) return NextResponse.json({ message: "project non trovato" }, { status: 404 });
  if (!preset) return NextResponse.json({ message: "preset non trovato" }, { status: 404 });

  // Risolvi style frames con validazione URL + fallback Pexels Photos
  const frameUrls = await resolveStyleFrames({
    presetName: preset.name,
    cachedFrameUrls: preset.cachedFrameUrls ?? [],
    styleReferenceUrl: preset.styleReferenceUrl,
    log: (m) => console.log(`[motion-graphics] ${m}`),
  });
  if (frameUrls.length === 0) {
    return NextResponse.json(
      { message: "Preset senza style reference utilizzabile (anche fallback Pexels fallito)" },
      { status: 400 }
    );
  }

  // Applica il filtro etnico (vincolo di progetto: nessuna persona di colore /
  // cinese / etnia non europea nelle clip generate)
  const finalPrompt = applyEthnicityConstraint(customPrompt?.trim() || preset.prompt);

  // Crea record PENDING
  const clip = await prisma.motionGraphicsClip.create({
    data: {
      projectId: project.id,
      presetId: preset.id,
      presetName: preset.name,
      prompt: finalPrompt,
      videoUrl: "", // verra popolato a fine generazione
      durationSec: duration,
      model,
      costUsd: estimateClipCostUsd(model, duration),
      status: "PENDING",
    },
  });

  // Fire-and-forget background generation
  (async () => {
    try {
      await prisma.motionGraphicsClip.update({
        where: { id: clip.id },
        data: { status: "RUNNING" },
      });

      const aspect =
        project.aspectRatio === "16:9"
          ? "16:9"
          : project.aspectRatio === "1:1"
          ? "1:1"
          : "9:16";

      const result = await generateMotionGraphicsClip({
        prompt: finalPrompt,
        styleFrameUrls: frameUrls,
        duration,
        aspectRatio: aspect as "9:16" | "16:9" | "1:1",
        model,
        onTick: (s, attempt) => {
          if (attempt % 4 === 0) {
            console.log(`[motion-graphics] clip ${clip.id} status=${s.status} attempt=${attempt}`);
          }
        },
      });

      await prisma.motionGraphicsClip.update({
        where: { id: clip.id },
        data: {
          status: "COMPLETED",
          videoUrl: result.videoUrl,
          requestId: result.requestId,
          seed: result.seed,
          model: result.model,
          costUsd: result.estimatedCostUsd,
        },
      });
      console.log(`[motion-graphics] ✅ clip ${clip.id} pronta (model=${result.model}, ~$${result.estimatedCostUsd})`);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.error(`[motion-graphics] ❌ clip ${clip.id} fallita: ${msg}`);
      await prisma.motionGraphicsClip.update({
        where: { id: clip.id },
        data: { status: "FAILED", errorMessage: msg },
      });
    }
  })().catch((e) => console.error("[motion-graphics] background fatal", e));

  return NextResponse.json(clip, { status: 202 });
}
