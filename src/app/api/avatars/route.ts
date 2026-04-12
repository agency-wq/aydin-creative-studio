import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const search = searchParams.get("search")?.trim() ?? "";
  const gender = searchParams.get("gender") ?? ""; // "male" | "female" | "" (all)
  const aspect = searchParams.get("aspect") ?? ""; // "9:16" | "16:9" | "1:1" | ""
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(120, Math.max(1, Number(searchParams.get("pageSize") ?? "60")));

  // Filtri di default (sempre applicati):
  // - enabled: avatar non disabilitato manualmente
  // - hasLatinName: solo nomi latini (esclude cyrillic, cinese, simboli, numeri)
  // - hasPreview: solo avatar con thumbnail
  // - quality != legacy: nascondi gli avatar AVATAR_II/talking_photo (lip sync scarso)
  // L'utente puo bypass tutto con `?showAll=1` oppure gestire la quality con `?quality=`
  const showAll = searchParams.get("showAll") === "1";

  // Quality filter: "premium" (solo AVATAR_IV), "standard" (solo AVATAR_III),
  // "legacy" (tutto il resto incl. talking photo), "all" (nessun filtro quality).
  // Default: nasconde i legacy mostrando premium + standard.
  const qualityParam = searchParams.get("quality") ?? "";

  const where: Record<string, unknown> = { enabled: true };
  if (!showAll) {
    where.hasLatinName = true;
    where.hasPreview = true;
  }

  if (qualityParam === "premium" || qualityParam === "standard" || qualityParam === "legacy") {
    where.quality = qualityParam;
  } else if (qualityParam === "all") {
    // nessun filtro quality
  } else if (!showAll) {
    // default: nascondi i legacy
    where.quality = { in: ["premium", "standard"] };
  }

  if (gender && ["male", "female"].includes(gender)) {
    where.gender = gender;
  }

  if (aspect && ["9:16", "16:9", "1:1"].includes(aspect)) {
    where.aspect = aspect;
  }

  if (searchParams.get("favorite") === "1") {
    where.favorite = true;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, avatars, favoritesCount, qualityCounts] = await Promise.all([
    prisma.avatar.count({ where }),
    prisma.avatar.findMany({
      where,
      // Ordine: preferiti → premium > standard > legacy → rating alto → nome
      orderBy: [
        { favorite: "desc" },
        { quality: "asc" }, // "legacy" < "premium" < "standard" alfabeticamente, gestito con indice composito
        { rating: "desc" },
        { firstName: "asc" },
        { name: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        firstName: true,
        gender: true,
        aspect: true,
        previewImageUrl: true,
        previewVideoUrl: true,
        avatarType: true,
        defaultVoiceId: true,
        favorite: true,
        quality: true,
        tags: true,
        rating: true,
        lastTestedAt: true,
      },
    }),
    prisma.avatar.count({ where: { ...where, favorite: true } }),
    // Breakdown per quality (senza filtro quality corrente, ma con gli altri filtri)
    (async () => {
      const baseWhere = { ...where };
      delete (baseWhere as Record<string, unknown>).quality;
      const grouped = await prisma.avatar.groupBy({
        by: ["quality"],
        where: baseWhere,
        _count: true,
      });
      return grouped.reduce<Record<string, number>>((acc, g) => {
        acc[g.quality] = g._count;
        return acc;
      }, {});
    })(),
  ]);

  return NextResponse.json({
    avatars,
    total,
    favoritesCount,
    qualityCounts,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
