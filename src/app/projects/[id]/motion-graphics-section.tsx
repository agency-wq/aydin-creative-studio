"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Clip = {
  id: string;
  presetName: string | null;
  prompt: string;
  videoUrl: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  errorMessage: string | null;
  durationSec: number | null;
  model: string | null;
  costUsd: number | null;
  createdAt: string;
};

type Preset = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  prompt: string;
};

type FalModel = {
  key: string;
  label: string;
  costPerSecondUsd: number;
  supportedDurations: number[];
  supportedAspects: string[];
  costPreviewUsd: { duration: number; usd: number }[];
};

type ModelsResponse = {
  defaultModel: string;
  models: FalModel[];
};

const HAS_RUNNING = (clips: Clip[]) =>
  clips.some((c) => c.status === "PENDING" || c.status === "RUNNING");

export function MotionGraphicsSection({
  projectId,
  initialPresetId,
}: {
  projectId: string;
  initialPresetId: string | null;
}) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [models, setModels] = useState<FalModel[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialPresetId);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<number>(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carica preset disponibili
  useEffect(() => {
    fetch("/api/motion-graphics-presets")
      .then((r) => r.json())
      .then((p) => setPresets(p))
      .catch(() => setPresets([]));
  }, []);

  // Carica modelli fal disponibili
  useEffect(() => {
    fetch("/api/fal/models")
      .then((r) => r.json())
      .then((data: ModelsResponse) => {
        setModels(data.models);
        setSelectedModel(data.defaultModel);
        // imposta una durata default valida per il modello default
        const def = data.models.find((m) => m.key === data.defaultModel);
        if (def) setSelectedDuration(def.supportedDurations[0]);
      })
      .catch(() => setModels([]));
  }, []);

  // Carica le clip esistenti
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/motion-graphics`, { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as Clip[];
        if (!cancelled) setClips(data);
      } catch {
        // ignore
      }
    };
    load();

    // Polling solo se ci sono clip in lavorazione
    const interval = setInterval(() => {
      if (HAS_RUNNING(clips) || generating) load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, clips, generating]);

  const currentModel = useMemo(
    () => models.find((m) => m.key === selectedModel),
    [models, selectedModel]
  );

  // Quando cambia modello, normalizza la durata
  useEffect(() => {
    if (!currentModel) return;
    if (!currentModel.supportedDurations.includes(selectedDuration)) {
      setSelectedDuration(currentModel.supportedDurations[0]);
    }
  }, [currentModel, selectedDuration]);

  const estimatedCost = useMemo(() => {
    if (!currentModel) return null;
    const entry = currentModel.costPreviewUsd.find((p) => p.duration === selectedDuration);
    return entry?.usd ?? null;
  }, [currentModel, selectedDuration]);

  const handleGenerate = async () => {
    if (!selectedPresetId) {
      setError("Seleziona un preset");
      return;
    }
    if (!selectedModel) {
      setError("Seleziona un modello");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/motion-graphics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: selectedPresetId,
          duration: selectedDuration,
          model: selectedModel,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.message ?? `errore ${r.status}`);
      }
      const newClip = (await r.json()) as Clip;
      setClips((prev) => [newClip, ...prev]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Motion graphics</CardTitle>
        <CardDescription>
          Genera clip in stile YouTuber via fal.ai. Scegli modello, preset e durata.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">Preset stile</label>
            <select
              value={selectedPresetId ?? ""}
              onChange={(e) => setSelectedPresetId(e.target.value || null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— scegli un preset —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Modello fal.ai</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} · ${m.costPerSecondUsd}/s
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Durata</label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={!currentModel}
            >
              {currentModel?.supportedDurations.map((d) => (
                <option key={d} value={d}>
                  {d} sec
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-muted-foreground">
            {estimatedCost != null && (
              <>
                Costo stimato per clip: <span className="font-semibold text-foreground">${estimatedCost.toFixed(2)}</span>
                {currentModel && (
                  <> · {currentModel.label}</>
                )}
              </>
            )}
          </div>
          <Button onClick={handleGenerate} disabled={!selectedPresetId || !selectedModel || generating}>
            {generating ? "Avvio…" : "Genera clip"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {clips.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna clip generata ancora. Click su <strong>Genera clip</strong> per partire.
            Tempo medio ~1-2 minuti.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {clips.map((c) => (
              <ClipCard key={c.id} clip={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const isReady = clip.status === "COMPLETED" && clip.videoUrl;
  const isFailed = clip.status === "FAILED";
  const isRunning = clip.status === "RUNNING" || clip.status === "PENDING";

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-card">
      <div className="aspect-[9/16] bg-muted/40 flex items-center justify-center">
        {isReady ? (
          <video src={clip.videoUrl} controls className="w-full h-full object-cover" />
        ) : isFailed ? (
          <div className="text-xs text-destructive p-2 text-center">
            Errore<br />
            {clip.errorMessage?.slice(0, 80)}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground animate-pulse">in lavorazione…</div>
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium truncate">{clip.presetName ?? "—"}</span>
          <Badge
            variant={isReady ? "default" : isFailed ? "destructive" : "secondary"}
            className={isRunning ? "animate-pulse text-[10px]" : "text-[10px]"}
          >
            {clip.status}
          </Badge>
        </div>
        {(clip.model || clip.costUsd != null) && (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="truncate">{clip.model ?? "—"}</span>
            {clip.costUsd != null && <span>${clip.costUsd.toFixed(2)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
