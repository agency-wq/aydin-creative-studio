import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { avatarVideoQueue } from "@/lib/queue";

/**
 * POST /api/projects/[id]/retry-render
 * Ri-renderizza un progetto esistente senza chiamare HeyGen.
 * Richiede che il progetto abbia gia un finalVideoUrl valido (raw HeyGen).
 * Il worker ri-eseguira: trascrizione → AI Director → MG → broll → Remotion render.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, status: true, finalVideoUrl: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Progetto non trovato" }, { status: 404 });
  }

  if (!project.finalVideoUrl || !project.finalVideoUrl.startsWith("http")) {
    return NextResponse.json(
      { message: "Il progetto non ha un video HeyGen valido da ri-renderizzare" },
      { status: 400 }
    );
  }

  // Aggiorna status a QUEUED
  await prisma.project.update({
    where: { id },
    data: { status: "QUEUED" },
  });

  // Enqueue il job con flag retryRender
  await avatarVideoQueue.add(
    "retry-render",
    { projectId: id, retryRender: true },
    { jobId: `retry-${id}-${Date.now()}` }
  );

  return NextResponse.json({
    message: "Retry render avviato",
    projectId: id,
  });
}
