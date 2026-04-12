import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/voices/[id]/favorite?provider=heygen|elevenlabs — toggle stato preferito
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const provider = new URL(req.url).searchParams.get("provider");

  if (!provider || !["heygen", "elevenlabs"].includes(provider)) {
    return NextResponse.json(
      { message: "provider mancante o non valido" },
      { status: 400 }
    );
  }

  const current = await prisma.voice.findUnique({
    where: { provider_id: { provider, id } },
    select: { favorite: true },
  });

  if (!current) {
    return NextResponse.json({ message: "Voce non trovata" }, { status: 404 });
  }

  const updated = await prisma.voice.update({
    where: { provider_id: { provider, id } },
    data: { favorite: !current.favorite },
    select: { id: true, provider: true, favorite: true },
  });

  return NextResponse.json(updated);
}
