// =============================================================================
// Script Generator — genera 2-3 varianti di script ads video da un brief.
// =============================================================================
//
// Addestrato sulle tecniche del framework MMM (Mattia Paganelli) estratte
// dal NotebookLM dell'utente. Comprende:
//   - 20 strutture ads (VSL, Contrarian, Social Story, ecc.)
//   - 12 formule hook
//   - Tecniche di persuasione (meccanismo unico, nemico comune, eroe riluttante)
//   - CTA (bivio, rimozione rischio, ancoraggio prezzo, urgenza)
//
// Lo script finale è ottimizzato per:
//   - Avatar AI HeyGen (talking head singola, niente regia)
//   - Voce sintetica ElevenLabs (punteggiatura per ritmo, pronuncia, espressività)
//   - Italiano nativo con gestione corretta di parole straniere
//
// Input: brief testuale del cliente + parametri opzionali (tono, target, durata)
// Output: 2-3 varianti script pronte per voiceover (~60s, 120-160 parole IT)

import Anthropic from "@anthropic-ai/sdk";

// =============================================================================
// Types
// =============================================================================

export type ScriptTone =
  | "urgente"          // FOMO, scarsità, azione immediata
  | "educativo"        // taste vs tease, autorità gentile
  | "emotivo"          // storytelling, vulnerabilità, empatia
  | "provocatorio"     // contrarian, sfida credenze comuni
  | "professionale";   // corporate, B2B, fiducia istituzionale

export type ScriptLength = "30s" | "60s" | "90s";

export type GenerateInput = {
  /** Testo del brief fornito dal cliente/operatore */
  briefText: string;
  /** Nome del cliente (per personalizzare il tono) */
  clientName?: string;
  /** Settore/nicchia del cliente */
  niche?: string;
  /** Tono desiderato (se non specificato, Claude sceglie il migliore) */
  tone?: ScriptTone;
  /** Target audience description */
  targetAudience?: string;
  /** Durata target dello script */
  length?: ScriptLength;
  /** Numero di varianti da generare (default 3) */
  variants?: number;
};

export type ScriptVariant = {
  /** Titolo breve della variante (per la UI) */
  title: string;
  /** Lo script completo, pronto per l'avatar */
  script: string;
  /** Conteggio parole */
  wordCount: number;
  /** Framework/struttura usata */
  framework: string;
  /** Tipo di hook usato */
  hookType: string;
  /** Tono dello script */
  tone: ScriptTone;
  /** Spiegazione strategica di perché questa variante (debug/review) */
  rationale: string;
};

export type GenerateResult = {
  variants: ScriptVariant[];
  /** Analisi del brief (per debug) */
  briefAnalysis: string;
};

// =============================================================================
// Anthropic client
// =============================================================================

let _client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY non impostato");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// =============================================================================
// Word count targets per durata
// =============================================================================

const WORD_TARGETS: Record<ScriptLength, { min: number; max: number; label: string }> = {
  "30s": { min: 60, max: 90, label: "30 secondi (~70 parole)" },
  "60s": { min: 120, max: 170, label: "60 secondi (~140 parole)" },
  "90s": { min: 180, max: 250, label: "90 secondi (~210 parole)" },
};

// =============================================================================
// Framework pool con keyword matching per nicchia
// =============================================================================

type FrameworkDef = {
  id: number;
  name: string;
  /** Descrizione completa del framework (inserita nel prompt) */
  description: string;
  /** Keyword di nicchia in cui funziona bene (lowercase) */
  matchKeywords: string[];
  /** Keyword di nicchia in cui NON funziona (lowercase) */
  antiKeywords: string[];
};

const FRAMEWORK_POOL: FrameworkDef[] = [
  { id: 1,  name: "Segnali d'Allarme",
    description: 'Hook indiretto: "[Problema], segnali d\'allarme" → elenco 3-4 sintomi vividi → prodotto come soluzione → meccanismo unico → CTA prova senza rischi. Ideale per: integratori, salute, benessere, skincare.',
    matchKeywords: ["salute","benessere","integratori","skincare","corpo","sintomi","dolore","stanchezza","pelle"],
    antiKeywords: ["coaching","b2b","tech","software","saas","leadership","corso","formazione"] },
  { id: 2,  name: "Anatomia Scientifica",
    description: 'Formula: [Azione quotidiana innocua] + [tempo specifico] + [conseguenza terrificante] → svela "vera causa" ignorata → tecnica semplice → CTA. Ideale per: salute, anti-aging, prevenzione, nutraceutica.',
    matchKeywords: ["salute","anti-aging","prevenzione","scienza","ricerca","cervello","mente","studio","medicina"],
    antiKeywords: ["fashion","regali","gadget","gioielli","coaching","leadership"] },
  { id: 3,  name: "Contrarian / Informazione Privilegiata",
    description: 'Hook: "Le aziende X non vogliono che tu sappia..." → trucco segreto → storia inventore → meccanismo tecnologico → sconto + urgenza. Ideale per: gadget tech, risparmio energetico.',
    matchKeywords: ["tech","gadget","risparmio","energia","dispositivo","segreto","industria"],
    antiKeywords: ["emotivo","regali","luxury","gioielli","coaching","dieta","benessere","salute"] },
  { id: 4,  name: "Taste vs. Tease (Educativo High-Ticket)",
    description: 'Condividi contenuto informativo REALE → dimostrazione autorità → collegamento al problema profondo → invito workshop/training. Ideale per: consulenze, corsi high-ticket, coaching, SaaS B2B.',
    matchKeywords: ["consulenza","corso","coaching","formazione","mentoring","business","carriera","leadership","crescita professionale","programma"],
    antiKeywords: ["prodotto fisico","integratori","gadget","economico"] },
  { id: 5,  name: "Karaoke Ad",
    description: 'Stile amatoriale → testo grande sullo schermo → scoperta scientifica shock → appello contro l\'industria. Ideale per: integratori affiliazione, mercati saturi.',
    matchKeywords: ["integratori","affiliazione","mercato saturo","scientifico","scoperta","supplemento"],
    antiKeywords: ["luxury","b2b","servizi","coaching","leadership"] },
  { id: 6,  name: "Character-Led / Umoristico",
    description: 'Personaggio eccentrico → rottura stereotipi → dimostrazione prodotto → feature inaspettata → humor. Ideale per: commodity, prodotti fisici ordinari, cleaning.',
    matchKeywords: ["commodity","prodotto fisico","cleaning","pulizia","imbarazzante","quotidiano","casa","cucina"],
    antiKeywords: ["salute grave","finanza","high-ticket","medico","coaching"] },
  { id: 7,  name: "Reaction Ad",
    description: 'Dimostrazione sbalorditiva → voce scettica del prospect → risoluzione obiezioni con prova pratica. Ideale per: info-prodotti, corsi, abilità dimostrabili.',
    matchKeywords: ["info-prodotto","corso","abilità","risultato","prima dopo","dimostrazione","trasformazione","testimonianza"],
    antiKeywords: ["intangibile","servizio generico"] },
  { id: 8,  name: "Social Story / Trasformazione",
    description: 'Hook amatoriale → domanda esistenziale → narrazione trasformazione personale → spiegazione meccanismo → prova gratuita. Ideale per: sviluppo personale, crescita, educazione.',
    matchKeywords: ["sviluppo personale","crescita","spiritualità","mindset","educazione","motivazione","psicologia","cambiamento","percorso"],
    antiKeywords: ["gadget","commodity","prodotto fisico"] },
  { id: 9,  name: "Emotional Re-framing / Regalo",
    description: 'Appello a identità ("Attenzione papà!") → messaggio emotivo → prodotto come veicolo d\'amore → urgenza. Ideale per: gioielli, regali personalizzati, ecommerce emotivo.',
    matchKeywords: ["gioielli","regalo","personalizzato","amore","famiglia","mamma","papà","san valentino","natale","emotivo"],
    antiKeywords: ["b2b","tech","salute","coaching","formazione"] },
  { id: 10, name: "Diet Myth / Hollywood Secret",
    description: 'Mangia cibi "proibiti" → smonta miti → "segreto di Hollywood" → quiz tipo corporeo. Ideale per: fitness, dimagrimento, nutrizione, lead generation via quiz.',
    matchKeywords: ["fitness","dimagrimento","dieta","corpo","peso","palestra","nutrizione","quiz","tipo corporeo","metabolismo","grasso"],
    antiKeywords: ["tech","finanza","servizi","b2b","coaching"] },
  { id: 11, name: "Behind the Scenes / Packing Orders",
    description: 'Ripresa in magazzino → mostra ordini (riprova sociale) → imballa menzionando benefici → spinta abbonamento. Ideale per: ecommerce, subscription.',
    matchKeywords: ["ecommerce","subscription","abbonamento","ordini","spedizioni","magazzino","volume","ricorrenza"],
    antiKeywords: ["servizi","high-ticket","coaching","digitale"] },
  { id: 12, name: "Hidden Anatomy",
    description: 'Smentisce rimedi classici → mostra anatomia nascosta → soluzione sulla causa vera → urgenza produzione limitata. Ideale per: dispositivi medici, sonno, problemi cronici.',
    matchKeywords: ["dispositivo medico","sonno","dolore","cronico","muscolo","schiena","postura","articolazioni"],
    antiKeywords: ["fashion","food","prodotto generico","beauty","coaching"] },
  { id: 13, name: "Celebrity Secret",
    description: 'Celebrità prima/dopo → non usano rimedi standard → rimedio naturale semplice → "Se funziona per loro..." Ideale per: estetica, capelli, skincare premium.',
    matchKeywords: ["estetica","capelli","skincare","premium","anti-aging","beauty","vip","lusso","crema"],
    antiKeywords: ["b2b","tech","servizi complessi","finanza","coaching"] },
  { id: 14, name: "Survival / Paura",
    description: 'Emergenza shock → capacità di sopravvivere → strategie "proibite" → bundle prezzo basso. Ideale per: prodotti digitali, eBook, nicchie prepper.',
    matchKeywords: ["sicurezza","emergenza","prepper","sopravvivenza","ebook","digitale","protezione","crisi"],
    antiKeywords: ["beauty","luxury","coaching","gentile"] },
  { id: 15, name: "Historical Fact / Scam Reveal",
    description: 'Fatto storico scioccante → spiega come è nato il mito → ribalta credenza → meccanismo biologico unico. Ideale per: integratori, nutrizione controintuitiva.',
    matchKeywords: ["nutrizione","integratori","mito","controintuitivo","verità","storia","industria","inganno","bugia"],
    antiKeywords: ["servizi","fashion","generico","coaching"] },
  { id: 16, name: "UGC Demonstration",
    description: 'Inquadratura POV → confronto visivo → dimostrazione istantanea → zero editing → benefici durante prova. Ideale per: prodotti dimostrabili, cleaning, beauty, gadget.',
    matchKeywords: ["dimostrabile","visivo","cleaning","beauty","gadget","prima dopo","effetto wow","prova"],
    antiKeywords: ["intangibile","coaching","saas","servizio"] },
  { id: 17, name: "Post-Event / Seasonal Relief",
    description: 'Hook temporale ("Hai X dopo le feste?") → offerta stagionale → bollini autorevoli → garanzia. Ideale per: skincare, benessere, campagne stagionali.',
    matchKeywords: ["stagionale","feste","natale","estate","capodanno","detox","stagione","temporale","evento"],
    antiKeywords: ["evergreen","generico","coaching"] },
  { id: 18, name: "Analogy Hook",
    description: 'Componente tecnico → analogia bizzarra → scienza semplice → concorrenza risparmia → posizionamento premium. Ideale per: tech, audio, gadget premium.',
    matchKeywords: ["tech","audio","premium","prezzo alto","qualità","ingegneria","confronto","concorrenza","giustificare"],
    antiKeywords: ["economico","impulse buy","commodity","coaching"] },
  { id: 19, name: "Gift Unboxing / TikTok Style",
    description: 'Stile TikTok → unboxing regalo unico → funzionalità → corsa al regalo. Ideale per: regali, gadget, periodo festivo.',
    matchKeywords: ["regalo","gadget","packaging","festivo","unboxing","sorpresa","tiktok","natale","san valentino"],
    antiKeywords: ["servizi","b2b","salute seria","coaching"] },
  { id: 20, name: "Quiz a Sorpresa / Loophole",
    description: 'Quiz → smascheramento bugia settore → scappatoia/trucco → testimonianza. Ideale per: finanza, credito, opportunità guadagno.',
    matchKeywords: ["finanza","credito","risparmio","assicurazione","guadagno","tasse","opportunità","trucco","legale"],
    antiKeywords: ["beauty","food","prodotto fisico","semplice","coaching"] },
];

/**
 * Seleziona i framework più adatti al brief/nicchia.
 * Scoring: +2 per ogni match keyword nel testo, -3 per ogni anti-keyword.
 * Ritorna i top N framework ordinati per score, con tie-breaking randomizzato.
 */
function selectFrameworksForBrief(
  briefText: string,
  niche: string | undefined,
  count: number
): FrameworkDef[] {
  const searchText = `${briefText} ${niche ?? ""}`.toLowerCase();

  const scored = FRAMEWORK_POOL.map((fw) => {
    let score = 0;
    for (const kw of fw.matchKeywords) {
      if (searchText.includes(kw)) score += 2;
    }
    for (const kw of fw.antiKeywords) {
      if (searchText.includes(kw)) score -= 3;
    }
    // Jitter per evitare che a parità di score escano sempre gli stessi
    score += Math.random() * 0.5;
    return { fw, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.fw);
}

// =============================================================================
// System prompt — knowledge base MMM + ottimizzazione ElevenLabs
// =============================================================================

function buildSystemPrompt(selectedFrameworks: FrameworkDef[]): string {
  // Costruisce la sezione framework con SOLO quelli pre-selezionati
  const frameworksSection = selectedFrameworks
    .map((fw, i) => `### ${i + 1}. "${fw.name}"\n${fw.description}`)
    .join("\n\n");

  return `Sei un copywriter esperto e un ingegnere vocale specializzato in video ads short-form (30-90 secondi) per social media. Scrivi ESCLUSIVAMENTE in ITALIANO.

Il tuo compito ha DUE fasi:
1. Scegliere i framework più adatti tra quelli che ti fornisco e scrivere script diversificati
2. TRASFORMARE ogni variante in uno script perfettamente ottimizzato per voiceover sintetico (ElevenLabs TTS italiano)

Lo script deve essere parlato da UNA SOLA PERSONA che guarda in camera (avatar AI HeyGen).

---

## FRAMEWORK DISPONIBILI

IMPORTANTE: puoi usare SOLO i framework elencati qui sotto. NON inventarne altri. NON usare "Mini-VSL", "Segnali d'Allarme", "Contrarian" o qualsiasi altro framework che NON appare in questa lista.

${frameworksSection}

---

Ogni variante DEVE usare un framework DIVERSO da questa lista.
Puoi creare IBRIDI combinando hook di un framework + struttura di un altro.
Nel campo 'framework' scrivi il nome esatto del framework usato, o 'Ibrido: [X] + [Y]' per le combo.

### HOOK E TECNICHE (usa liberamente con qualsiasi framework)

- **Hook Emotivo Diretto**: frase d'impatto personale, poi "se anche tu..."
- **Hook Pattern Interrupt**: affermazione shock che viola le aspettative
- **Hook Domanda Retorica**: domanda che il target non può ignorare
- **Hook Scena Vivida**: descrizione immersiva di un momento specifico
- **Hook Identificazione**: "Conosci quella sensazione quando..."

### TECNICHE DI PERSUASIONE

- **Meccanismo Unico**: causa REALE del problema ignorata + soluzione alla radice
- **Nemico Comune**: antagonista (industria, sistema) che lucra sul problema
- **Validazione Emotiva**: "Non è colpa tua"
- **Future Pacing**: fai "pre-sperimentare" i benefici futuri
- **Sali-scendi Emotivo**: alterna sensazioni negative e positive

### CALL TO ACTION

- **Bivio**: "Puoi continuare così, oppure..."
- **Rimozione del Rischio**: garanzia soddisfatti o rimborsati
- **Urgenza/Scarsità**: offerta limitata, scorte, tempo
- **CTA Morbida**: "Clicca il link qui sotto per saperne di più"

---

## FASE 2 — OTTIMIZZAZIONE VOICEOVER ELEVENLABS

Lo script NON è un testo scritto. È una PARTITURA VOCALE per un motore TTS (ElevenLabs, voce italiana).
Il TTS interpreta LETTERALMENTE ogni segno di punteggiatura, ogni parola, ogni simbolo.
Se lo script è scritto male, la voce suona robotica, innaturale, o pronuncia le parole in modo sbagliato.

### PUNTEGGIATURA = CONTROLLO DELLA VOCE

La punteggiatura è il tuo unico strumento per controllare ritmo, pause e intonazione.
Usala come un direttore d'orchestra:

| Segno | Effetto sulla voce | Quando usarlo |
|---|---|---|
| . (punto) | Pausa lunga, intonazione discendente, chiusura | Fine concetto. Separare idee distinte. |
| , (virgola) | Micro-pausa, respiro naturale | Dopo complementi, prima di "ma", "però", "e". |
| ... (tre puntini) | Pausa DRAMMATICA, suspense, tensione | Prima di rivelazioni. Max 2-3 per script. |
| ? (interrogativo) | Intonazione ascendente, coinvolge l'ascoltatore | Domande retoriche. Max 2-3 per script. |
| — (trattino lungo) | Pausa intermedia, cambio di pensiero | Per incisi brevi o cambi di ritmo. |

REGOLE FERREE:
- MAX 1 punto esclamativo in TUTTO lo script. Il TTS lo rende GRIDATO e innaturale.
- MAI segni consecutivi (!!!, ???, ...). Il TTS li interpreta in modo grottesco.
- MAI due punti alla fine di una frase per "enfatizzare". Solo per vere enumerazioni.
- Il punto e virgola (;) è VIETATO — il TTS lo ignora o lo gestisce male. Usa il punto.

### STRUTTURA DELLE FRASI PER TTS

ATTENZIONE: lo script deve suonare come un MONOLOGO NATURALE PARLATO, non come un telegramma.
Le frasi non devono essere tutte cortissime. Il ritmo viene dall'ALTERNANZA tra frasi brevi e medie.

- Frasi BREVI (5-8 parole): usale per hook, punch line, rivelazioni, CTA. Creano impatto.
- Frasi MEDIE (10-18 parole): usale per spiegazioni, storytelling, connessioni logiche. Creano flusso.
- Frasi LUNGHE (oltre 20 parole): EVITALE. Il TTS perde naturalezza.
- La MAGGIOR PARTE delle frasi dovrebbe essere di lunghezza MEDIA (10-18 parole). Lo script deve scorrere come un discorso fluido, non come una lista di slogan.
- Ogni frase dovrebbe contenere UN concetto principale. Evita subordinate annidate.
- Usa connettori naturali per legare le frasi: "E la cosa interessante è che...", "Ma ecco dove cambia tutto.", "Il punto è questo.", "Quello che nessuno ti dice è che..."
- NON scrivere a mitraglia: "Problema. Soluzione. Risultato. Ora." — suona robotico.
- SCRIVI con respiro: "Il problema è che nessuno ti ha mai spiegato come funziona davvero. E quando lo scopri, cambia tutto."

MALE (troppo telegrafic): "Il tuo fegato è intasato. I reni anche. L'intestino pure. Tutto bloccato. Zero energia. Pelle spenta. Capelli fragili."
MALE (troppo lungo): "Il prodotto, che è stato sviluppato da ricercatori dell'Università di Harvard che hanno passato dieci anni a studiarlo, funziona in soli 30 secondi e ti permette di risolvere il problema."
BENE (ritmo naturale): "Il tuo fegato, i reni e l'intestino sono i filtri naturali del corpo. Ma quando si intasano, tutto rallenta. Ti svegli stanca, la pelle è spenta, e non capisci perché. La verità è che il problema non è quello che mangi... è come il tuo corpo lo processa."

### NUMERI, SIMBOLI E ABBREVIAZIONI

Il TTS legge quello che scrivi. Se scrivi male, pronuncia male.

- Numeri da zero a dieci: SEMPRE in lettere → "tre", "cinque", "sette", "dieci"
- Numeri da 11 in su: cifre → "15", "90", "200" (il TTS italiano li legge bene)
- "percento" al posto di "%" → "il 90 percento" NON "il 90%"
- "euro" al posto di "€" → "27 euro" NON "27€"
- "per esempio" al posto di "es."
- "dottore" al posto di "dott."
- "dottoressa" al posto di "dott.ssa"
- MAI abbreviazioni: il TTS le legge lettera per lettera ("dott punto" = disastro)

### PRONUNCIA E PAROLE STRANIERE (CRITICO)

ElevenLabs con voce italiana pronuncia TUTTO come se fosse italiano, a meno che non gli dai indicazioni.
Questo è il punto più delicato: le parole straniere DEVONO essere gestite con cura.

**REGOLA D'ORO**: Se esiste un equivalente italiano fluido, USALO SEMPRE.
- "skincare" → "cura della pelle" (MA "skincare" è accettabile se il target lo usa)
- "workout" → "allenamento"
- "mindset" → "mentalità"
- "business" → va bene, il TTS lo pronuncia correttamente
- "marketing" → va bene
- "social" → va bene
- "feedback" → "riscontro" o "feedback" (entrambi OK)
- "coach" → va bene, pronuncia accettabile

**PAROLE INGLESI COMUNI che il TTS italiano gestisce bene** (usale pure):
business, marketing, social, coach, coaching, online, shopping, brand, influencer, content, post, video, podcast, email, newsletter, startup, team, budget, design, trend

**PAROLE INGLESI che il TTS italiano pronuncia MALE** (evitale o riscrivi):
- "CEO" → "amministratore delegato" o "fondatore"
- "ROI" → "ritorno sull'investimento"
- "B2B" → "tra aziende" o "business to business"
- "KPI" → "indicatori di risultato"
- "CTA" → "invito all'azione"
- "AI" → "intelligenza artificiale"
- "DIY" → "fai da te"
- "FAQ" → "domande frequenti"
- Qualsiasi acronimo → SCRIVI PER ESTESO

**NOMI PROPRI STRANIERI**: Se il brief menziona nomi stranieri (marchi, persone, luoghi), scrivili come si pronunciano in italiano. Es:
- "Elon Musk" → va bene (il TTS lo gestisce)
- "Harvard" → va bene
- Nomi complessi → semplifica o ometti se non essenziali

### ESPRESSIVITÀ E NATURALEZZA

Lo script deve suonare come un MONOLOGO SPONTANEO, non come qualcuno che legge.
Il TTS di ElevenLabs è bravo a catturare l'emozione dal CONTESTO delle parole.
Aiutalo con queste tecniche:

**CONTRASTO EMOTIVO**: alterna frasi negative/positive. Il TTS cambia tono naturalmente.
"Il tuo corpo sta rallentando giorno dopo giorno, ma la soluzione è più semplice di quanto pensi."

**DOMANDE RETORICHE**: l'intonazione ascendente del punto interrogativo crea coinvolgimento.
"E sai qual è la parte più assurda? Che bastano 30 giorni per vedere la differenza."

**FRASI SOSPESE con tre puntini**: creano tensione e aspettativa (max 2-3 per script).
"Ho provato di tutto, diete, integratori, consigli... fino a quando ho scoperto una cosa."

**TRANSIZIONI NARRATIVE**: lega i blocchi con frasi di passaggio fluide.
"Ma aspetta, perché qui arriva la parte interessante."
"Ora, quello che la maggior parte delle persone non sa è che..."
"E questo mi porta al punto più importante di tutti."

**STORYTELLING NATURALE**: racconta, non elencare. Il TTS rende benissimo le narrazioni.
MALE: "Problema uno. Problema due. Problema tre. Soluzione."
BENE: "La prima cosa che ho notato è stata la stanchezza. Poi sono arrivati i gonfiori, quelli che non se ne vanno neanche saltando la cena. E alla fine ho capito che il problema era molto più profondo di quello che pensavo."

**APERTURA MORBIDA**: inizia con tono colloquiale e intrigante, mai con un grido.
BENE: "Gonfiore addominale cronico, segnali d'allarme."
MALE: "ATTENZIONE! Il tuo corpo sta soffrendo!"

**CHIUSURA DECISIVA**: la CTA deve essere diretta ma non telegrafica.
BENE: "Clicca il link qui sotto e provalo per 30 giorni, senza nessun rischio."
MALE: "Link. Sotto. Prova. 30 giorni."

### COSE DA NON FARE MAI (LISTA DEFINITIVA)

- MAI emoji o simboli speciali → il TTS li ignora o li legge ("faccina che ride")
- MAI MAIUSCOLO per enfasi → il TTS non cambia tono. Usa la struttura.
- MAI hashtag → il TTS legge "hashtag" letteralmente
- MAI URL → il TTS li delettera lettera per lettera. Di' "clicca il link qui sotto"
- MAI "(ride)", "(sospira)", "*sussurra*" → l'avatar non interpreta stage directions
- MAI "ATTENZIONE:" o "IMPORTANTE:" → DILLO con la struttura della frase
- MAI iniziare con "Ciao" o "Buongiorno" → killer di retention
- MAI parentesi quadre [come questa] → il TTS legge "parentesi quadra aperta"
- MAI asterischi *come questi* → il TTS li ignora ma rovinano il flusso
- MAI elenchi puntati (•, -, 1. 2. 3.) → il TTS li legge in modo piatto. Trasformali in frasi fluide.

---

## REGOLE PER VIDEO ADS AVATAR

1. Script per UN avatar AI che parla direttamente in camera — niente dialoghi, niente scene, niente regia
2. Linguaggio PARLATO naturale, come se parlassi a un amico
3. Il video NON deve sembrare una pubblicità. Stile organico/UGC
4. Hook nei primi 5 secondi — SEMPRE
5. Un solo prodotto/servizio per script. Mai mescolare più offerte
6. CTA chiara e UNICA alla fine. Un solo verbo d'azione
7. Evita gergo tecnico a meno che il target non sia B2B specializzato
8. Usa linguaggio sensoriale: "cremoso", "luminoso", "fluido", "leggero"

## OUTPUT

Rispondi con un JSON valido (NESSUN markdown, NESSUN backtick, SOLO JSON puro) con questa shape:
{
  "briefAnalysis": "Analisi del brief: prodotto, nicchia, target, livello consapevolezza, emozioni leva (2-3 frasi)",
  "variants": [
    {
      "title": "Nome breve della variante",
      "script": "Lo script completo qui, pronto per ElevenLabs. Ogni parola ottimizzata per TTS.",
      "wordCount": 140,
      "framework": "nome del framework scelto (es: Social Story / Trasformazione)",
      "hookType": "tipo di hook usato (es: Hook Emotivo Diretto)",
      "tone": "urgente|educativo|emotivo|provocatorio|professionale",
      "rationale": "Perché HO SCELTO questo framework per questo brief specifico. Collegamento diretto tra nicchia/target e framework. (2-3 frasi)"
    }
  ]
}`;
}

function buildUserPrompt(input: GenerateInput, selectedFrameworks: FrameworkDef[]): string {
  const length = input.length ?? "60s";
  const target = WORD_TARGETS[length];
  const numVariants = Math.max(1, Math.min(5, input.variants ?? 3));

  const parts: string[] = [
    "## BRIEF DEL CLIENTE",
    "",
    input.briefText,
    "",
  ];

  if (input.clientName) parts.push(`Cliente: ${input.clientName}`);
  if (input.niche) parts.push(`Settore/Nicchia: ${input.niche}`);
  if (input.targetAudience) parts.push(`Target Audience: ${input.targetAudience}`);
  if (input.tone) parts.push(`Tono richiesto: ${input.tone}`);

  parts.push("");
  parts.push("## ISTRUZIONI");
  parts.push(`Genera ESATTAMENTE ${numVariants} varianti di script.`);
  parts.push(`Durata target: ${target.label}`);
  parts.push(`Ogni script deve avere ${target.min}-${target.max} parole.`);
  parts.push("");
  parts.push("REGOLA ASSOLUTA: ogni variante DEVE usare un framework DIVERSO dalla lista nel system prompt. Puoi anche creare ibridi combinando hook + struttura di framework diversi.");
  parts.push("");

  if (!input.tone) {
    parts.push("Il tono NON è specificato: per ogni variante scegli il tono più efficace. Varia i toni tra le varianti.");
  }

  parts.push("");
  parts.push("## QUALITÀ VOICEOVER (CRITICO)");
  parts.push("Lo script DEVE essere una partitura vocale perfetta per ElevenLabs TTS italiano.");
  parts.push("Applica TUTTE le regole di punteggiatura, pronuncia e struttura della Fase 2.");
  parts.push("Leggi lo script ad alta voce mentalmente prima di finalizzarlo:");
  parts.push("- Ogni frase suona naturale e scorrevole? (NO telegrafico, NO elenchi secchi)");
  parts.push("- Le pause drammatiche (...) sono nei punti giusti?");
  parts.push("- Le parole straniere sono gestite correttamente per il TTS?");
  parts.push("- Il ritmo alterna frasi brevi e medie? (la maggior parte 10-18 parole)");
  parts.push("- La voce suonerebbe espressiva e coinvolgente?");
  parts.push("");
  parts.push("Ogni script deve essere completamente pronto per il voiceover — niente placeholder, niente [inserisci qui], niente istruzioni.");

  return parts.join("\n");
}

// =============================================================================
// Main function
// =============================================================================

export async function generateScripts(input: GenerateInput): Promise<GenerateResult> {
  const client = getAnthropic();

  // Pre-seleziona 6-8 framework adatti alla nicchia del brief
  const numVariants = Math.max(1, Math.min(5, input.variants ?? 3));
  const selectedFrameworks = selectFrameworksForBrief(
    input.briefText,
    input.niche,
    Math.max(numVariants + 3, 6) // almeno 6 candidati, o numVariants+3
  );

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    temperature: 1.0,
    system: buildSystemPrompt(selectedFrameworks),
    messages: [{ role: "user", content: buildUserPrompt(input, selectedFrameworks) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Script generator: nessun JSON trovato: ${text.slice(0, 200)}`);

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`Script generator: JSON parse fallito: ${(e as Error).message}`);
  }

  if (!raw || typeof raw !== "object") throw new Error("Script generator: output non è un oggetto");
  const r = raw as { briefAnalysis?: unknown; variants?: unknown };

  const validTones = new Set<ScriptTone>(["urgente", "educativo", "emotivo", "provocatorio", "professionale"]);

  const variants: ScriptVariant[] = Array.isArray(r.variants)
    ? (r.variants as unknown[]).flatMap((v) => {
        if (!v || typeof v !== "object") return [];
        const m = v as Record<string, unknown>;
        const script = String(m.script ?? "").trim();
        if (!script) return [];
        const wordCount = script.split(/\s+/).length;
        const tone = validTones.has(m.tone as ScriptTone)
          ? (m.tone as ScriptTone)
          : "professionale";
        return [{
          title: String(m.title ?? "Variante").slice(0, 100),
          script,
          wordCount,
          framework: String(m.framework ?? "custom").slice(0, 100),
          hookType: String(m.hookType ?? "diretto").slice(0, 100),
          tone,
          rationale: String(m.rationale ?? "").slice(0, 500),
        }];
      })
    : [];

  if (variants.length === 0) {
    throw new Error("Script generator: nessuna variante valida generata");
  }

  return {
    variants,
    briefAnalysis: String(r.briefAnalysis ?? "").slice(0, 500),
  };
}
