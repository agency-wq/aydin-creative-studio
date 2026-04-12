import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/avatars/suggest
 * Body: { script: string }
 * Ritorna 6 avatar suggeriti per lo script in input.
 *
 * Strategia (semplice ma efficace per script italiani brevi):
 * 1. Analisi del testo in italiano per dedurre:
 *    - gender preference (female/male/neutral)
 *    - context category (business, fitness, beauty, food, tech, lifestyle, education, ...)
 *    - tone (energico, calmo, professionale, casual)
 * 2. Pesco tra avatar 9:16 premium (AVATAR_IV) con preview validi:
 *    - Prima i preferiti che matchano gender
 *    - Poi premium (AVATAR_IV, lip sync perfetto) del gender giusto
 *    - Poi standard (AVATAR_III) come fallback
 *    - Mai legacy (talking photo / vecchi training) perche' lip sync pessimo
 * 3. Ritorno 6 avatar variati
 */

type GenderHint = "female" | "male" | "neutral";

function detectGender(text: string): GenderHint {
  const t = text.toLowerCase();

  // Parole chiaramente femminili
  const femaleSignals = [
    /\b(donna|donne|ragazza|ragazze|madre|mamma|sorella|figlia|moglie|fidanzata|imprenditrice|coach|fondatrice|psicologa|nutrizionista|estetista|makeup|trucco|capelli|ciclo|ciclo mestruale|gravidanza|parto|menopausa|allattamento|maternita|femminile|ginecolog|consulente femminile)\b/,
    /\b(la mia cliente|le mie clienti)\b/,
    /\bsono una\b/,
    /\bcoach al femminile\b/,
  ];
  // Parole chiaramente maschili
  const maleSignals = [
    /\b(uomo|uomini|ragazzo|ragazzi|padre|papa|fratello|figlio|marito|fidanzato|imprenditore|fondatore|psicologo|nutrizionista uomo|barbiere|barba|fitness maschile|maschile)\b/,
    /\bsono un\b/,
    /\b(business coach|sales coach|trainer)\b/,
  ];

  let femaleScore = 0;
  let maleScore = 0;
  for (const re of femaleSignals) if (re.test(t)) femaleScore++;
  for (const re of maleSignals) if (re.test(t)) maleScore++;

  if (femaleScore > maleScore) return "female";
  if (maleScore > femaleScore) return "male";
  return "neutral";
}

type Context =
  | "business"
  | "fitness"
  | "beauty"
  | "food"
  | "tech"
  | "lifestyle"
  | "education"
  | "marketing"
  | "casual"
  | "generic";

function detectContext(text: string): Context[] {
  const t = text.toLowerCase();
  const contexts: Context[] = [];

  const map: Record<Context, RegExp[]> = {
    business: [
      /\b(imprenditor|business|azienda|fattura|vendita|vendite|cliente|clienti|profit|investiment|coaching|consulenza|strategia|leadership|manager|ceo|startup|scaling|guadagn|reddito|soldi|euro|fatturato|conversione|funnel|lead|prospect)\b/,
    ],
    fitness: [
      /\b(allenament|workout|fitness|muscoli|palestra|corpo|dimagrimento|dieta|alimentazione|nutrizion|proteine|massa|calorie|cardio|forza|squat|addominali|brucia|grasso|tonifica|sport|yoga|pilates|stretching)\b/,
    ],
    beauty: [
      /\b(bellezza|skincare|cura della pelle|crema|makeup|trucco|capelli|estetic|massaggio|spa|trattamento|antiage|acne|brufoli|sopracciglia|smalto|manicure|hair stylist|salone)\b/,
    ],
    food: [
      /\b(cucina|ricetta|cuoco|chef|food|piatto|ingrediente|cucinare|forno|pasta|pizza|carne|pesce|verdura|dolci|dessert|cottura|ricette|menu|ristorante|prelibat|saporit)\b/,
    ],
    tech: [
      /\b(tecnologia|digitale|app|software|sito|web|sviluppatore|programmazione|coding|ai|intelligenza artificiale|chatgpt|automazione|tool|piattaforma|saas|api|database|cloud|computer|smartphone)\b/,
    ],
    lifestyle: [
      /\b(viaggio|viaggi|stile di vita|hobby|passione|creativ|arte|musica|libro|film|moda|outfit|fashion|design|interior|casa|famiglia|relazion|amore|amicizia)\b/,
    ],
    education: [
      /\b(impari|imparare|insegn|insegnare|corso|lezione|studi|scuola|universit|formazione|tutorial|guida|metodo|tecnica|step|principiant|esperto|certificazione|master|esame|teoria|pratica)\b/,
    ],
    marketing: [
      /\b(marketing|brand|branding|social|instagram|tiktok|facebook|youtube|reels|content|contenuto|engagement|follower|community|advertising|adv|copy|copywriting|seo|sem|adsense|inserzione)\b/,
    ],
    casual: [
      /\b(ciao|come va|amici|raga|allora|insomma|comunque|secondo me|onestamente|sinceramente)\b/,
    ],
    generic: [],
  };

  for (const [ctx, regexes] of Object.entries(map)) {
    if (regexes.some((re) => re.test(t))) {
      contexts.push(ctx as Context);
    }
  }

  if (contexts.length === 0) contexts.push("generic");
  return contexts;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const script = String(body?.script ?? "").trim();

  if (script.length < 30) {
    // Troppo corto per dare suggerimenti significativi
    return NextResponse.json({
      gender: "neutral",
      contexts: [],
      avatars: [],
      reason: "Scrivi almeno 30 caratteri di script per ricevere suggerimenti.",
    });
  }

  const gender = detectGender(script);
  const contexts = detectContext(script);

  // Costruisco il where per il match avatar
  const baseWhere: Record<string, unknown> = {
    enabled: true,
    hasLatinName: true,
    hasPreview: true,
    aspect: "9:16",
  };

  if (gender !== "neutral") {
    baseWhere.gender = gender;
  }

  // Select comune a tutte le query (include quality/tags/rating per il frontend)
  const avatarSelect = {
    id: true,
    name: true,
    firstName: true,
    gender: true,
    aspect: true,
    previewImageUrl: true,
    previewVideoUrl: true,
    favorite: true,
    avatarType: true,
    quality: true,
    tags: true,
    rating: true,
  } as const;

  // 1. Cerco prima nei preferiti (a prescindere dalla quality, rispettiamo il
  //    gusto dell'utente se ha marcato un favorito)
  const fromFavorites = await prisma.avatar.findMany({
    where: { ...baseWhere, favorite: true },
    take: 6,
    orderBy: { rating: "desc" },
    select: avatarSelect,
  });

  // 2. Riempio fino a 6 con premium (AVATAR_IV, lip sync perfetto)
  const remaining = 6 - fromFavorites.length;
  let extra: typeof fromFavorites = [];
  if (remaining > 0) {
    const excludeIds = fromFavorites.map((a) => a.id);
    extra = await prisma.avatar.findMany({
      where: {
        ...baseWhere,
        id: { notIn: excludeIds },
        quality: "premium",
      },
      take: remaining,
      orderBy: [{ rating: "desc" }, { name: "asc" }],
      select: avatarSelect,
    });
  }

  // 3. Se ancora non basta, fallback su standard (AVATAR_III)
  let extra2: typeof fromFavorites = [];
  const stillRemaining = 6 - fromFavorites.length - extra.length;
  if (stillRemaining > 0) {
    const excludeIds = [...fromFavorites, ...extra].map((a) => a.id);
    extra2 = await prisma.avatar.findMany({
      where: {
        ...baseWhere,
        id: { notIn: excludeIds },
        quality: "standard",
      },
      take: stillRemaining,
      orderBy: [{ rating: "desc" }, { name: "asc" }],
      select: avatarSelect,
    });
  }

  const avatars = [...fromFavorites, ...extra, ...extra2];

  return NextResponse.json({
    gender,
    contexts,
    avatars,
    reason: buildReason(gender, contexts),
  });
}

function buildReason(gender: GenderHint, contexts: Context[]): string {
  const parts: string[] = [];

  if (gender === "female") parts.push("voce/avatar femminile suggerito");
  else if (gender === "male") parts.push("voce/avatar maschile suggerito");

  if (contexts.length > 0 && !contexts.includes("generic")) {
    const labels: Record<Context, string> = {
      business: "business",
      fitness: "fitness",
      beauty: "beauty/estetica",
      food: "food/cucina",
      tech: "tech/digitale",
      lifestyle: "lifestyle",
      education: "educational",
      marketing: "marketing",
      casual: "casual",
      generic: "generico",
    };
    const ctxLabels = contexts.map((c) => labels[c]).join(", ");
    parts.push(`tema: ${ctxLabels}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Suggerimento generico";
}
