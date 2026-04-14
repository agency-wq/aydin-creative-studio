// Pipeline b-roll Pexels — VERSIONE AI-DIRECTOR DRIVEN.
//
// Non estrae piu' keyword da regex stupida: riceve dal VideoPlan upstream
// (`lib/ai-director.ts`) una lista di `PlannedBroll` con query INGLESI
// semantiche, specifiche, e con 2-3 fallback per ogni momento.
//
// Per ogni PlannedBroll:
//   1. Cerca su Pexels la query primaria
//   2. Filtra per durata >= ~3s e per il filtro etnico hard
//   3. Se nessun risultato, riprova con la prima fallback, poi la seconda...
//   4. Sceglie il migliore (mp4 HD verticale dove possibile)
//   5. Salva un record BrollClip nel DB
//
// Ritorna i record salvati ALLINEATI all'ordine del piano, in modo che il
// worker possa zippare ogni record con il suo timestamp originale.

import { PrismaClient } from "../generated/prisma";
import { searchVideos, pickBestFile, type PexelsOrientation } from "./integrations/pexels";
import { isPexelsVideoExcluded } from "./ethnicity-filter";
import type { PlannedBroll, VideoPlan } from "./ai-director";

export type SavedBrollRecord = {
  id: string;
  startMs: number;
  endMs: number;
  videoUrl: string;
  durationSec: number;
};

export async function fetchBrollFromPlan(opts: {
  prisma: PrismaClient;
  projectId: string;
  plan: VideoPlan;
  orientation: PexelsOrientation;
  log?: (msg: string) => void;
}): Promise<{ savedCount: number; records: SavedBrollRecord[] }> {
  const log = opts.log ?? (() => {});

  // Reset b-roll precedenti per questo project (re-run pulito)
  await opts.prisma.brollClip.deleteMany({
    where: { projectId: opts.projectId, source: "pexels" },
  });

  if (opts.plan.broll.length === 0) {
    log("auto-broll: VideoPlan non contiene b-roll, skip");
    return { savedCount: 0, records: [] };
  }

  log(`auto-broll(plan-driven): cerco ${opts.plan.broll.length} clip su Pexels`);

  const records: SavedBrollRecord[] = [];
  let savedCount = 0;

  for (let i = 0; i < opts.plan.broll.length; i++) {
    const planned: PlannedBroll = opts.plan.broll[i];
    const queriesToTry = [planned.query, ...planned.fallbackQueries];

    let savedRecord: SavedBrollRecord | null = null;

    for (let qi = 0; qi < queriesToTry.length; qi++) {
      const q = queriesToTry[qi];
      try {
        // Cerca più risultati per avere più margine di selezione e filtraggio etnico
        const r = await searchVideos({
          query: q,
          orientation: opts.orientation,
          size: "medium",
          perPage: 15,
          // NOTA: niente locale "it-IT", le query sono ora INGLESI semantiche
        });

        // Filtra: durata >= 3s, ha mp4 utilizzabile, non escluso da filtro etnico
        const candidates = r.videos
          .map((v) => ({ v, file: pickBestFile(v, { orientation: opts.orientation, minHeight: 720 }) }))
          .filter((x) => x.file && x.v.duration >= 3 && !isPexelsVideoExcluded(x.file!.link, x.v.url));

        if (candidates.length === 0) {
          log(
            `auto-broll: ${i + 1}/${opts.plan.broll.length} query "${q}" -> 0 risultati dopo filtro etnico (${r.videos.length} raw), fallback...`
          );
          continue;
        }

        // Ordine preferenze:
        //   1. Video SENZA persone (no man/woman/person/people/doctor/talking nel slug)
        //   2. Per durata desc (clip piu lunghe = piu margine di trim)
        const PEOPLE_TERMS = [
          "man", "woman", "men", "women", "person", "people", "guy", "girl",
          "boy", "lady", "doctor", "patient", "talking", "speaking", "smiling",
          "laughing", "portrait", "face", "selfie", "couple", "family", "child",
          "baby", "kid", "teenager", "elderly", "senior", "worker", "employee",
          "businessman", "businesswoman",
        ];
        candidates.sort((a, b) => {
          const aSlug = `${a.v.url}`.toLowerCase();
          const bSlug = `${b.v.url}`.toLowerCase();
          const aHasPeople = PEOPLE_TERMS.some((t) => aSlug.includes(t)) ? 1 : 0;
          const bHasPeople = PEOPLE_TERMS.some((t) => bSlug.includes(t)) ? 1 : 0;
          if (aHasPeople !== bHasPeople) return aHasPeople - bHasPeople; // senza persone prima
          return b.v.duration - a.v.duration; // poi per durata
        });
        const chosen = candidates[0];
        if (!chosen.file) continue;

        const created = await opts.prisma.brollClip.create({
          data: {
            projectId: opts.projectId,
            source: "pexels",
            externalId: String(chosen.v.id),
            query: q,
            videoUrl: chosen.file.link,
            thumbnailUrl: chosen.v.image,
            width: chosen.file.width,
            height: chosen.file.height,
            durationSec: chosen.v.duration,
            authorName: chosen.v.user?.name ?? null,
            authorUrl: chosen.v.user?.url ?? null,
            pageUrl: chosen.v.url,
            orderIndex: i,
          },
        });

        savedRecord = {
          id: created.id,
          startMs: planned.startMs,
          endMs: planned.endMs,
          videoUrl: chosen.file.link,
          durationSec: chosen.v.duration,
        };
        log(
          `auto-broll: ${i + 1}/${opts.plan.broll.length} OK · "${q.slice(0, 50)}" @ ${Math.round(planned.startMs)}-${Math.round(planned.endMs)}ms`
        );
        break; // success, esci dal loop fallback
      } catch (e) {
        log(`auto-broll: ${i + 1}/${opts.plan.broll.length} query "${q}" errore: ${(e as Error).message.slice(0, 80)}`);
      }
    }

    if (savedRecord) {
      records.push(savedRecord);
      savedCount++;
    } else {
      log(
        `auto-broll: ${i + 1}/${opts.plan.broll.length} FALLITO · tutte le ${queriesToTry.length} query a vuoto · reason: ${planned.reason}`
      );
    }
  }

  log(`auto-broll(plan-driven): salvati ${savedCount}/${opts.plan.broll.length}`);
  return { savedCount, records };
}
