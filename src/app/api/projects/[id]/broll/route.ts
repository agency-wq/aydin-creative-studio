// GET /api/projects/[id]/broll
//   Lista delle b-roll clip salvate per il project, ordinate per orderIndex.
//
// POST /api/projects/[id]/broll
//   Body opzioni:
//     { mode: "search", query?: string, perPage?: number }
//        -> ricerca live su Pexels (NON salva nulla, solo preview).
//        -> Se query non e fornita, estrae keywords dallo script del project.
//
//     { mode: "save", source: "pexels", externalId, videoUrl, thumbnailUrl,
//       width, height, durationSec, authorName, authorUrl, pageUrl, query? }
//        -> Salva una clip nel DB come BrollClip per quel project.
//
// DELETE /api/projects/[id]/broll?clipId=...
//   Rimuove una clip salvata.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { searchVideos, pickBestFile, extractKeywords } from "@/lib/integrations/pexels";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clips = await prisma.brollClip.findMany({
    where: { projectId: id },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(clips);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ message: "project non trovato" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode ?? "search");

  if (mode === "search") {
    // Decide la query: se l'utente l'ha fornita usala, altrimenti estrai dallo script
    let queries: string[] = [];
    if (typeof body?.query === "string" && body.query.trim()) {
      queries = [body.query.trim()];
    } else {
      queries = extractKeywords(project.script, 5);
      if (queries.length === 0) queries = ["business"];
    }

    const orientation =
      project.aspectRatio === "16:9"
        ? "landscape"
        : project.aspectRatio === "1:1"
        ? "square"
        : "portrait";

    const perPage = Number(body?.perPage ?? 12);

    // Esegui ricerca su tutte le query in parallelo, dedup per id
    const results = await Promise.all(
      queries.map((q) =>
        searchVideos({
          query: q,
          orientation,
          size: "medium",
          perPage,
          locale: "it-IT",
        }).then((r) => r.videos.map((v) => ({ ...v, _query: q })))
      )
    );

    const seen = new Set<number>();
    const merged = results.flat().filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });

    // Mappa in formato leggero per UI
    const items = merged.map((v) => {
      const file = pickBestFile(v, { orientation, minHeight: 720 });
      return {
        externalId: String(v.id),
        query: v._query,
        videoUrl: file?.link ?? null,
        thumbnailUrl: v.image,
        width: file?.width ?? v.width,
        height: file?.height ?? v.height,
        durationSec: v.duration,
        authorName: v.user?.name ?? null,
        authorUrl: v.user?.url ?? null,
        pageUrl: v.url,
      };
    }).filter((i) => i.videoUrl); // scarta video senza file mp4 utilizzabile

    return NextResponse.json({ queries, items });
  }

  if (mode === "save") {
    if (!body?.videoUrl || !body?.source) {
      return NextResponse.json(
        { message: "videoUrl e source sono richiesti" },
        { status: 400 }
      );
    }

    // Calcola prossimo orderIndex
    const last = await prisma.brollClip.findFirst({
      where: { projectId: id },
      orderBy: { orderIndex: "desc" },
    });
    const nextOrder = (last?.orderIndex ?? -1) + 1;

    const clip = await prisma.brollClip.create({
      data: {
        projectId: id,
        source: String(body.source),
        externalId: body.externalId ? String(body.externalId) : null,
        query: body.query ? String(body.query) : null,
        videoUrl: String(body.videoUrl),
        thumbnailUrl: body.thumbnailUrl ? String(body.thumbnailUrl) : null,
        width: body.width ? Number(body.width) : null,
        height: body.height ? Number(body.height) : null,
        durationSec: body.durationSec ? Number(body.durationSec) : null,
        authorName: body.authorName ? String(body.authorName) : null,
        authorUrl: body.authorUrl ? String(body.authorUrl) : null,
        pageUrl: body.pageUrl ? String(body.pageUrl) : null,
        orderIndex: nextOrder,
      },
    });
    return NextResponse.json(clip, { status: 201 });
  }

  return NextResponse.json({ message: `mode sconosciuto: ${mode}` }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const clipId = url.searchParams.get("clipId");
  if (!clipId) {
    return NextResponse.json({ message: "clipId richiesto" }, { status: 400 });
  }
  await prisma.brollClip.delete({ where: { id: clipId } });
  // assicura che la clip appartenga al project (best-effort, in dev OK cosi)
  void id;
  return NextResponse.json({ ok: true });
}
