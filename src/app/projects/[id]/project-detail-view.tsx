"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MotionGraphicsSection } from "./motion-graphics-section";
import { TranscriptSection } from "./transcript-section";
import { BrollSection } from "./broll-section";

type RenderJob = {
  id: string;
  step: string;
  status: string;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

type Project = {
  id: string;
  title: string;
  script: string;
  status: string;
  avatarId: string;
  voiceProvider: string;
  voiceId: string;
  captionPresetId: string | null;
  motionPresetId: string | null;
  resolution: string;
  aspectRatio: string;
  finalVideoUrl: string | null;
  thumbnailUrl: string | null;
  transcript: {
    text?: string;
    language?: string;
    words?: Array<{ word: string; start: number; end: number; confidence: number }>;
  } | null;
  createdAt: string;
  client: { name: string };
  renderJobs: RenderJob[];
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza",
  QUEUED: "In coda",
  GENERATING_AUDIO: "Generazione audio",
  GENERATING_AVATAR: "Generazione avatar HeyGen",
  TRANSCRIBING: "Trascrizione",
  GENERATING_MOTION_GRAPHICS: "Motion graphics",
  GENERATING_BROLL: "B-roll",
  GENERATING_MUSIC: "Musica",
  RENDERING: "Render finale",
  COMPLETED: "Completato",
  FAILED: "Fallito",
};

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

/** Mappa status del progetto → percentuale progress bar + label step */
const STATUS_PROGRESS: Record<string, { pct: number; step: string }> = {
  QUEUED:                    { pct: 2,   step: "In coda, in attesa del worker..." },
  GENERATING_AUDIO:          { pct: 10,  step: "1/7 — Generazione audio ElevenLabs..." },
  GENERATING_AVATAR:         { pct: 20,  step: "2/7 — Generazione video avatar HeyGen..." },
  TRANSCRIBING:              { pct: 40,  step: "3/7 — Trascrizione audio..." },
  GENERATING_MOTION_GRAPHICS:{ pct: 55,  step: "4/7 — AI Director + motion graphics..." },
  GENERATING_BROLL:          { pct: 65,  step: "5/7 — Download b-roll..." },
  GENERATING_MUSIC:          { pct: 75,  step: "6/7 — Composizione musica..." },
  RENDERING:                 { pct: 85,  step: "7/7 — Render Remotion finale..." },
  COMPLETED:                 { pct: 100, step: "Completato" },
};

export function ProjectDetailView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Project;
}) {
  const [project, setProject] = useState<Project>(initial);

  useEffect(() => {
    if (TERMINAL.has(project.status)) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        if (!r.ok) return;
        const next = (await r.json()) as Project;
        if (!cancelled) setProject(next);
      } catch {
        // ignore network blips
      }
    };

    const interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, project.status]);

  const isRunning = !TERMINAL.has(project.status);
  const isFailed = project.status === "FAILED";
  const isDone = project.status === "COMPLETED";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">
          ← Libreria
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{project.title}</h1>
        <p className="text-muted-foreground mt-1">
          {project.client.name} · {new Date(project.createdAt).toLocaleString("it-IT")}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge
            variant={isDone ? "default" : isFailed ? "destructive" : "secondary"}
            className={isRunning ? "animate-pulse" : ""}
          >
            {STATUS_LABEL[project.status] ?? project.status}
          </Badge>
          {isRunning && (
            <span className="text-xs text-muted-foreground">
              auto-refresh ogni 4 sec…
            </span>
          )}
        </div>
        {isRunning && (
          <div className="mt-4">
            <Progress
              value={STATUS_PROGRESS[project.status]?.pct}
              label={STATUS_PROGRESS[project.status]?.step ?? project.status}
            />
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(isDone || isRunning) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Video</CardTitle>
              <CardDescription>
                {isDone
                  ? "Pronto. Click destro → salva con nome per scaricarlo."
                  : "Il video apparira qui appena la pipeline ha finito."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isDone && project.finalVideoUrl ? (
                <video
                  src={project.finalVideoUrl}
                  poster={project.thumbnailUrl ?? undefined}
                  controls
                  className="w-full max-w-sm mx-auto rounded-lg bg-black"
                />
              ) : (
                <div className="aspect-[9/16] max-w-sm mx-auto rounded-lg bg-muted/40 border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
                  In lavorazione…
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isFailed && (
          <Card className="lg:col-span-2 border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Generazione fallita</CardTitle>
              <CardDescription>
                {project.renderJobs[0]?.errorMessage ??
                  "Errore sconosciuto. Controlla i log del worker."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Script</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{project.script}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurazione</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Field label="Avatar ID" value={project.avatarId} mono />
              <Field label="Voice provider" value={project.voiceProvider} />
              <Field label="Voice ID" value={project.voiceId} mono />
              <Field label="Captions preset" value={project.captionPresetId ?? "—"} mono />
              <Field label="Motion preset" value={project.motionPresetId ?? "—"} mono />
              <Field label="Resolution" value={project.resolution} />
              <Field label="Aspect ratio" value={project.aspectRatio} />
            </dl>
          </CardContent>
        </Card>

        {isDone && (
          <TranscriptSection
            projectId={projectId}
            transcript={project.transcript}
          />
        )}

        {isDone && (
          <MotionGraphicsSection
            projectId={projectId}
            initialPresetId={project.motionPresetId}
          />
        )}

        {isDone && <BrollSection projectId={projectId} />}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Render jobs</CardTitle>
            <CardDescription>Storico esecuzioni pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            {project.renderJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun render job ancora. Avvia il worker con <code>pnpm worker</code>.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {project.renderJobs.map((j) => (
                  <li key={j.id} className="flex items-center gap-3">
                    <Badge variant="outline">{j.status}</Badge>
                    <span className="font-mono text-xs">{j.step}</span>
                    {j.errorMessage && (
                      <span className="text-xs text-destructive truncate max-w-xs">
                        {j.errorMessage}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(j.createdAt).toLocaleString("it-IT")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs truncate" : ""}>{value}</dd>
    </div>
  );
}
