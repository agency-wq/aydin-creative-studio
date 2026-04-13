import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Nomi tipicamente non-europei da escludere dalla griglia avatar.
// hasLatinName filtra gia cinesi/arabi/cirillici, ma nomi africani/indiani in
// alfabeto latino passano — li escludiamo qui per firstName (lowercase).
const EXCLUDED_FIRST_NAMES = [
  // Africani
  "abeni", "abiodun", "adaeze", "adaora", "adebayo", "adekunle", "adewale", "aisha",
  "akintunde", "amara", "amina", "aminata", "ayodele", "azikiwe", "babajide", "babatunde",
  "chiamaka", "chidi", "chimamanda", "chinelo", "chinedu", "chinonso", "chioma",
  "damilola", "emeka", "ezenwa", "fatima", "folake", "funke", "habiba", "ife",
  "ifeoma", "ikenna", "jabari", "kamau", "kemi", "kofi", "kwame", "kwesi",
  "latifah", "makena", "mandela", "mufasa", "nneka", "nnamdi", "nzinga",
  "obinna", "ogechi", "olabisi", "olufemi", "olumide", "oluwaseun", "omotola",
  "onyeka", "sade", "sanaa", "sekou", "taiwo", "temitope", "thandiwe", "tunde",
  "uzoma", "yinka", "zainab", "zuri",
  // Indiani / Sud-asiatici
  "aarav", "aditya", "ananya", "arjun", "deepak", "devika", "diya", "gaurav",
  "isha", "kavya", "kiran", "lakshmi", "manish", "meera", "mukesh", "nandini",
  "neha", "nikhil", "nisha", "pooja", "pradeep", "pranav", "priya", "rahul",
  "rajesh", "rakesh", "ravi", "rohit", "sachin", "sandeep", "sanjay", "sarita",
  "shivani", "sneha", "sunil", "suresh", "tanvi", "varun", "vidya", "vikram", "vivek",
  // Arabi / Medio Oriente
  "abdel", "abdullah", "ahmed", "ali", "amira", "farid", "fatimah", "hamid",
  "hassan", "hussein", "ibrahim", "ismail", "jamal", "karim", "khalid", "layla",
  "mahmoud", "mariam", "mohammad", "mostafa", "nadia", "nasser", "omar", "rashid",
  "reem", "saad", "salim", "samira", "tariq", "yasmin", "youssef", "zahra",
];

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
    // Escludi avatar con nomi tipicamente non-europei (africani, indiani, arabi, ecc.)
    // hasLatinName esclude gia cinesi/cirillici/arabi, ma nomi africani in alfabeto latino
    // passano il filtro. Usiamo un NOT contains su firstName per i piu comuni.
    where.NOT = [
      { firstName: { in: EXCLUDED_FIRST_NAMES } },
    ];
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
