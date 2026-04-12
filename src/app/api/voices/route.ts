import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const provider = searchParams.get("provider") ?? "";
  const gender = searchParams.get("gender") ?? "";
  const search = searchParams.get("search")?.trim() ?? "";

  const where: Record<string, unknown> = { enabled: true, language: "it" };
  if (provider && ["heygen", "elevenlabs"].includes(provider)) where.provider = provider;
  if (gender && ["male", "female"].includes(gender)) where.gender = gender;
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }
  if (searchParams.get("favorite") === "1") {
    where.favorite = true;
  }

  const voices = await prisma.voice.findMany({
    where,
    orderBy: [{ favorite: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(voices);
}
