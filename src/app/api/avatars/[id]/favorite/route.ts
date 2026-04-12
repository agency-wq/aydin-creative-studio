import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/avatars/[id]/favorite — toggle stato preferito
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const current = await prisma.avatar.findUnique({
    where: { id },
    select: { favorite: true },
  });

  if (!current) {
    return NextResponse.json({ message: "Avatar non trovato" }, { status: 404 });
  }

  const updated = await prisma.avatar.update({
    where: { id },
    data: { favorite: !current.favorite },
    select: { id: true, favorite: true },
  });

  return NextResponse.json(updated);
}
