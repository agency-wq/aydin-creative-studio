import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const presets = await prisma.motionGraphicsPreset.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      creatorAvatarUrl: true,
      prompt: true,
      styleReferenceUrl: true,
    },
  });
  return NextResponse.json(presets);
}
