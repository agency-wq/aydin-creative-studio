// POST /api/projects/[id]/transcribe
// Trascrive il finalVideoUrl di un progetto gia COMPLETED.
// Utile per ri-eseguire la trascrizione senza ri-generare il video.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { transcribeAudio } from "@/lib/integrations/assemblyai";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ message: "project non trovato" }, { status: 404 });
  }
  if (!project.finalVideoUrl) {
    return NextResponse.json(
      { message: "project senza finalVideoUrl, niente da trascrivere" },
      { status: 400 }
    );
  }
  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { message: "ASSEMBLYAI_API_KEY non configurata" },
      { status: 500 }
    );
  }

  try {
    console.log(`[transcribe] start ${id}`);
    const result = await transcribeAudio({
      audioUrl: project.finalVideoUrl,
      languageCode: "it",
      onTick: (t, attempt) => {
        if (attempt % 3 === 0) {
          console.log(`[transcribe] ${id} attempt=${attempt} status=${t.status}`);
        }
      },
    });

    const transcriptData = {
      text: result.text,
      language: result.language,
      durationMs: result.durationMs,
      words: result.words,
    };

    await prisma.project.update({
      where: { id },
      data: { transcript: transcriptData },
    });

    console.log(`[transcribe] ✅ ${id} (${result.words.length} parole)`);
    return NextResponse.json({
      ok: true,
      wordCount: result.words.length,
      preview: result.text.slice(0, 120),
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[transcribe] ❌ ${id}: ${msg}`);
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
