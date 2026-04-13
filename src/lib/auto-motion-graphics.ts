// Pipeline motion graphics — VERSIONE SENZA TEMPLATE.
//
// Non pianifica nulla per conto suo: riceve un VideoPlan dall'upstream
// `lib/ai-director.ts` (UNICA chiamata Claude che decide MG + broll insieme),
// e si limita a SALVARE i PlannedMG come record `MotionGraphicsClip` nel DB.
//
// Ogni record salvato porta:
//   - description (testo creativo libero, NO template name)
//   - themeName (palette/font)
//   - startMs/endMs (passati dal VideoPlan in memoria, non dal DB)
//
// Le colonne DB legacy `templateName`/`templateProps` vengono salvate come
// "DynamicScene" + { description: "..." } per compatibilità (nessuna migrazione).
//
// La traduzione description → RenderSpec (CSS/SVG/animazioni) avviene nel
// worker via `mg-translator.ts`, DOPO il salvataggio.

import { PrismaClient, Prisma } from "../generated/prisma";
import type { PlannedMG, VideoPlan } from "./ai-director";
import type { RenderSpec } from "../remotion/motion-graphics/dynamic/render-spec";

export type SavedMGRecord = {
  id: string;
  startMs: number;
  endMs: number;
  /** Descrizione creativa libera generata dall'AI Director */
  description: string;
  themeName: string | null;
  /** RenderSpec tradotto (popolato dopo la traduzione, non dal DB) */
  renderSpec?: RenderSpec;
};

/**
 * Salva nel DB i PlannedMG del VideoPlan come record MotionGraphicsClip
 * COMPLETED. Pulisce i record precedenti dello stesso project per re-run pulito.
 *
 * Il `presetId` e' usato solo per soft-link al MotionGraphicsPreset (per UI/log);
 * la theme/palette effettiva e' gia' contenuta in `plan.themeName`.
 */
export async function saveMotionGraphicsFromPlan(opts: {
  prisma: PrismaClient;
  projectId: string;
  presetId: string | null;
  plan: VideoPlan;
  log?: (msg: string) => void;
}): Promise<{ savedCount: number; failedCount: number; records: SavedMGRecord[] }> {
  const log = opts.log ?? (() => {});

  // Reset clip motion graphics precedenti per questo project (re-run pulito)
  await opts.prisma.motionGraphicsClip.deleteMany({ where: { projectId: opts.projectId } });

  // Risolvi il preset (solo per soft-link / nome leggibile in DB, opzionale)
  let presetName: string | null = null;
  let presetIdResolved: string | null = null;
  if (opts.presetId) {
    const p = await opts.prisma.motionGraphicsPreset.findUnique({
      where: { id: opts.presetId },
    });
    if (p) {
      presetName = p.name;
      presetIdResolved = p.id;
    }
  }
  if (!presetIdResolved) {
    const fallback = await opts.prisma.motionGraphicsPreset.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
    });
    if (fallback) {
      presetName = fallback.name;
      presetIdResolved = fallback.id;
    }
  }

  // Preset opzionale — il sistema dinamico non ne ha bisogno
  if (!presetIdResolved) {
    log("auto-mg: nessun preset DB, continuo con presetId=null (sistema dinamico)");
  }

  log(
    `auto-mg(plan-driven): saving ${opts.plan.motionGraphics.length} MG da VideoPlan (theme=${presetName ?? "default"})`
  );

  let savedCount = 0;
  let failedCount = 0;
  const records: SavedMGRecord[] = [];

  for (let i = 0; i < opts.plan.motionGraphics.length; i++) {
    const mg: PlannedMG = opts.plan.motionGraphics[i];
    try {
      const descShort = mg.description.slice(0, 60);
      const created = await opts.prisma.motionGraphicsClip.create({
        data: {
          projectId: opts.projectId,
          presetId: presetIdResolved,
          presetName,
          // Salva la descrizione creativa nel campo prompt (visibile nella UI)
          prompt: `[Dynamic] ${mg.reason || mg.description.slice(0, 120)}`,
          videoUrl: "", // legacy: vuoto, le clip Remotion non hanno mp4 esterno
          durationSec: Math.max(1, Math.round((mg.endMs - mg.startMs) / 1000)),
          model: "remotion-dynamic",
          costUsd: 0,
          status: "COMPLETED",
          // DB compat: usiamo "DynamicScene" come templateName e salviamo
          // la description nella templateProps JSON (nessuna migrazione Prisma necessaria)
          templateName: "DynamicScene",
          templateProps: { description: mg.description } as Prisma.InputJsonValue,
          themeName: mg.themeName,
        },
      });
      records.push({
        id: created.id,
        startMs: mg.startMs,
        endMs: mg.endMs,
        description: mg.description,
        themeName: mg.themeName,
      });
      savedCount++;
      log(
        `auto-mg: ${i + 1}/${opts.plan.motionGraphics.length} OK · "${descShort}..." @ ${Math.round(mg.startMs)}-${Math.round(mg.endMs)}ms`
      );
    } catch (err) {
      failedCount++;
      log(`auto-mg: ${i + 1}/${opts.plan.motionGraphics.length} FAIL: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  return { savedCount, failedCount, records };
}

