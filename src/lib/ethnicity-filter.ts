// Filtro etnico per b-roll Pexels e motion graphics fal.ai.
// Vincolo esplicito del progetto: escludere persone di colore, cinesi e piu in generale
// etnie non europee da qualsiasi clip generata o recuperata automaticamente.
//
// Due strategie:
//   1. Pexels videos: blocklist di termini nel URL (Pexels slug-ifica il titolo nel link).
//   2. fal.ai motion graphics: direttiva esplicita nel prompt ("if any people appear ...").

export const EXCLUDED_ETHNICITY_TERMS: string[] = [
  // African / Black
  "african",
  "afro",
  "afro-american",
  "black-man",
  "black-woman",
  "black-male",
  "black-female",
  "black-people",
  "black-person",
  "black-guy",
  "black-lady",
  "black-boy",
  "black-girl",
  "dark-skin",
  "dark-skinned",
  "melanin",
  "ethiopian",
  "nigerian",
  "kenyan",
  "ghanaian",
  "congolese",
  "somali",
  "senegalese",
  "ugandan",
  "south-african",
  // Asian (generico + specifici)
  "asian",
  "asiatic",
  "oriental",
  "chinese",
  "china",
  "japanese",
  "japan",
  "korean",
  "korea",
  "vietnamese",
  "vietnam",
  "thai",
  "thailand",
  "filipino",
  "philippine",
  "indonesian",
  "malaysian",
  "mongolian",
  // South Asian
  "indian",
  "india",
  "hindu",
  "sikh",
  "pakistani",
  "bangladeshi",
  "nepali",
  "sri-lankan",
  // Middle Eastern (vincolo del piano originale: solo europei/italiani)
  "arab",
  "arabic",
  "middle-east",
  "middle-eastern",
  "persian",
  "iranian",
  "egyptian",
  "moroccan",
];

/**
 * Controlla se un video Pexels va escluso perche il suo URL slug contiene
 * uno dei termini etnici vietati. Verifica sia videoUrl (.mp4 link) che pageUrl
 * (pagina pexels.com/video/...).
 */
export function isPexelsVideoExcluded(videoUrl: string, pageUrl?: string | null): boolean {
  const blob = `${videoUrl} ${pageUrl ?? ""}`.toLowerCase();
  return EXCLUDED_ETHNICITY_TERMS.some((term) => {
    // Match come parola/slug separata: bordi parola oppure trattini
    const re = new RegExp(`(^|[^a-z])${term.replace(/-/g, "-")}([^a-z]|$)`, "i");
    return re.test(blob);
  });
}

/**
 * Direttiva esplicita da appendere a un prompt fal.ai per evitare che
 * vengano generate persone di etnie non-europee. Idempotente (non duplica
 * il constraint se gia presente).
 */
const ETHNICITY_CONSTRAINT_MARKER = "[ETHNICITY_CONSTRAINT_v1]";

export function applyEthnicityConstraint(prompt: string): string {
  if (prompt.includes(ETHNICITY_CONSTRAINT_MARKER)) return prompt;
  const constraint =
    ` ${ETHNICITY_CONSTRAINT_MARKER} If any people appear in the video, they must be European or Caucasian only. Do not depict African, Black, Asian, Chinese, Japanese, Korean, Indian, South Asian, Middle Eastern or Arab people or features.`;
  return prompt.trim() + constraint;
}
