"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
// Theme presets rimossi — Claude genera tutto dinamicamente dal brand kit del cliente

type Client = { id: string; name: string };

type Avatar = {
  id: string;
  name: string;
  firstName: string;
  gender: string;
  aspect: string;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  avatarType: string;
  favorite: boolean;
  quality?: "premium" | "standard" | "legacy";
  tags?: string[];
  rating?: number;
};

type QualityFilter = "premium" | "standard" | "legacy" | "all" | "default";

type Voice = {
  id: string;
  provider: string;
  name: string;
  gender: string | null;
  category: string | null;
  previewUrl: string | null;
  favorite: boolean;
};

type SuggestResponse = {
  gender: "female" | "male" | "neutral";
  contexts: string[];
  avatars: Avatar[];
  reason: string;
};

type CaptionsPreset = {
  id: string;
  name: string;
  description: string | null;
  remotionComponent: string;
  defaultProps: Record<string, unknown>;
};

export function NewProjectForm({
  clients,
  captionsPresets,
}: {
  clients: Client[];
  captionsPresets: CaptionsPreset[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Form state
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [avatarId, setAvatarId] = useState<string>("");

  // Script generator AI
  const [briefText, setBriefText] = useState("");
  const [scriptNiche, setScriptNiche] = useState("");
  const [scriptTone, setScriptTone] = useState<string>("");
  const [scriptLength, setScriptLength] = useState<string>("60s");
  const [scriptVariants, setScriptVariants] = useState<
    Array<{
      title: string;
      script: string;
      wordCount: number;
      framework: string;
      hookType: string;
      tone: string;
      rationale: string;
    }>
  >([]);
  const [scriptGenLoading, setScriptGenLoading] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<"heygen" | "elevenlabs">("elevenlabs");
  const [voiceId, setVoiceId] = useState<string>("");
  const [captionPresetId, setCaptionPresetId] = useState<string>("");
  // motionPresetId rimosso — Claude genera MG dinamicamente dal brand kit

  // Avatar filters + paging
  const [avatarSearch, setAvatarSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [aspectFilter, setAspectFilter] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [onlyFavoritesAvatar, setOnlyFavoritesAvatar] = useState(false);
  // Quality filter: "default" = nasconde i legacy (premium+standard).
  // L'utente puo forzare "premium" (solo AVATAR_IV, top lip sync), "legacy"
  // (solo vecchi per debug) o "all" (tutto senza filtro).
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("default");
  const [avatarPage, setAvatarPage] = useState(1);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [avatarTotal, setAvatarTotal] = useState(0);
  const [avatarFavCount, setAvatarFavCount] = useState(0);
  const [avatarQualityCounts, setAvatarQualityCounts] = useState<Record<string, number>>({});
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Voice filters
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceGender, setVoiceGender] = useState<"all" | "male" | "female">("all");
  const [onlyFavoritesVoice, setOnlyFavoritesVoice] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  // Suggested avatars (analisi del testo)
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // ============== Fetch avatars (debounced) ==============
  async function refreshAvatars() {
    setAvatarLoading(true);
    const params = new URLSearchParams();
    if (avatarSearch) params.set("search", avatarSearch);
    if (genderFilter !== "all") params.set("gender", genderFilter);
    if (aspectFilter) params.set("aspect", aspectFilter);
    if (onlyFavoritesAvatar) params.set("favorite", "1");
    if (qualityFilter !== "default") params.set("quality", qualityFilter);
    params.set("page", String(avatarPage));
    params.set("pageSize", "60");

    try {
      const res = await fetch(`/api/avatars?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAvatars(data.avatars);
        setAvatarTotal(data.total);
        setAvatarFavCount(data.favoritesCount ?? 0);
        setAvatarQualityCounts(data.qualityCounts ?? {});
      }
    } finally {
      setAvatarLoading(false);
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(refreshAvatars, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarSearch, genderFilter, aspectFilter, onlyFavoritesAvatar, qualityFilter, avatarPage]);

  // Reset page on filter change
  useEffect(() => {
    setAvatarPage(1);
  }, [avatarSearch, genderFilter, aspectFilter, onlyFavoritesAvatar, qualityFilter]);

  // ============== Suggest avatars when script is long enough ==============
  useEffect(() => {
    if (script.trim().length < 30) {
      setSuggestion(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await fetch("/api/avatars/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script }),
          signal: ctrl.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestion(data);
        }
      } catch {
        // ignore
      } finally {
        setSuggestLoading(false);
      }
    }, 600);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [script]);

  // ============== Toggle favorito ==============
  async function toggleAvatarFavorite(id: string) {
    const res = await fetch(`/api/avatars/${id}/favorite`, { method: "POST" });
    if (res.ok) {
      // Optimistic: aggiorna locally
      setAvatars((prev) =>
        prev.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a))
      );
      // Aggiorna anche tra i suggeriti
      setSuggestion((prev) =>
        prev
          ? {
              ...prev,
              avatars: prev.avatars.map((a) =>
                a.id === id ? { ...a, favorite: !a.favorite } : a
              ),
            }
          : prev
      );
      // Re-fetch in background per aggiornare il count e il sort
      refreshAvatars();
    }
  }

  async function toggleVoiceFavorite(id: string, provider: string) {
    const res = await fetch(`/api/voices/${id}/favorite?provider=${provider}`, {
      method: "POST",
    });
    if (res.ok) {
      setVoices((prev) =>
        prev.map((v) => (v.id === id ? { ...v, favorite: !v.favorite } : v))
      );
    }
  }

  // ============== Fetch voices ElevenLabs (only when provider == elevenlabs) ==============
  useEffect(() => {
    if (voiceProvider !== "elevenlabs") return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setVoicesLoading(true);
      const params = new URLSearchParams({ provider: "elevenlabs" });
      if (voiceSearch) params.set("search", voiceSearch);
      if (voiceGender !== "all") params.set("gender", voiceGender);
      if (onlyFavoritesVoice) params.set("favorite", "1");
      try {
        const res = await fetch(`/api/voices?${params.toString()}`, { signal: ctrl.signal });
        if (res.ok) setVoices(await res.json());
      } finally {
        setVoicesLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [voiceProvider, voiceSearch, voiceGender, onlyFavoritesVoice]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(avatarTotal / 60)), [avatarTotal]);

  // ============== Upload file brief ==============
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/scripts/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Errore upload");
      }
      const data = await res.json();
      setBriefText(data.text);
      toast.success(`"${data.fileName}" caricato (${data.charCount.toLocaleString()} caratteri)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFileUploading(false);
      // Reset input per permettere re-upload stesso file
      e.target.value = "";
    }
  }

  // ============== Genera script da brief ==============
  async function handleGenerateScripts() {
    if (!briefText.trim()) return toast.error("Inserisci un brief");
    setScriptGenLoading(true);
    setScriptVariants([]);
    try {
      const clientObj = clients.find((c) => c.id === clientId);
      const res = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefText: briefText.trim(),
          clientName: clientObj?.name,
          niche: scriptNiche || undefined,
          tone: scriptTone || undefined,
          length: scriptLength,
          variants: 3,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Errore generazione");
      }
      const data = await res.json();
      setScriptVariants(data.variants ?? []);
      if ((data.variants?.length ?? 0) === 0) {
        toast.error("Nessuna variante generata");
      } else {
        toast.success(`${data.variants.length} varianti generate`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setScriptGenLoading(false);
    }
  }

  function handleSelectVariant(variant: (typeof scriptVariants)[number]) {
    setScript(variant.script);
    toast.success(`Script "${variant.title}" selezionato`);
    // Auto-genera titolo se vuoto
    if (!title.trim()) {
      setTitle(variant.title);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!avatarId) return toast.error("Scegli un avatar");
    if (voiceProvider === "elevenlabs" && !voiceId) {
      return toast.error("Scegli una voce ElevenLabs");
    }

    startTransition(async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: title.trim() || "Senza titolo",
          script: script.trim(),
          avatarId,
          voiceProvider,
          voiceId: voiceProvider === "elevenlabs" ? voiceId : null,
          captionPresetId: captionPresetId || null,
          motionPresetId: null,
        }),
      });
      if (res.ok) {
        const project = await res.json();
        toast.success("Progetto creato — generazione in coda");
        router.push(`/projects/${project.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message ?? "Errore creazione progetto");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente + Titolo + Script */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">1 — Contenuto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo video</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Reel introduzione corso"
              />
            </div>
          </div>

          {/* AI Script Generator */}
          <div className="space-y-3 rounded-lg border border-dashed border-primary/30 p-4 bg-primary/5">
            <button
              type="button"
              onClick={() => setShowGenerator(!showGenerator)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <span className="text-lg">🤖</span>
              {showGenerator ? "Chiudi generatore AI" : "Genera script da brief con AI"}
              <span className="text-xs text-muted-foreground ml-1">
                (oppure scrivi manualmente sotto)
              </span>
            </button>

            {showGenerator && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="brief">Brief del cliente</Label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-primary hover:underline">
                      <span>{fileUploading ? "Carico…" : "📎 Carica file (PDF, DOCX, TXT)"}</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md"
                        onChange={handleFileUpload}
                        disabled={fileUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <Textarea
                    id="brief"
                    value={briefText}
                    onChange={(e) => setBriefText(e.target.value)}
                    placeholder="Incolla qui il brief oppure carica un file PDF/DOCX/TXT…"
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    {briefText.length.toLocaleString()} caratteri
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nicchia/Settore</Label>
                    <Input
                      value={scriptNiche}
                      onChange={(e) => setScriptNiche(e.target.value)}
                      placeholder="Es. fitness, SaaS, food…"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tono</Label>
                    <select
                      value={scriptTone}
                      onChange={(e) => setScriptTone(e.target.value)}
                      className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">Auto (varia per variante)</option>
                      <option value="urgente">Urgente (FOMO)</option>
                      <option value="educativo">Educativo (taste vs tease)</option>
                      <option value="emotivo">Emotivo (storytelling)</option>
                      <option value="provocatorio">Provocatorio (contrarian)</option>
                      <option value="professionale">Professionale (B2B)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Durata</Label>
                    <select
                      value={scriptLength}
                      onChange={(e) => setScriptLength(e.target.value)}
                      className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="30s">30 secondi (~70 parole)</option>
                      <option value="60s">60 secondi (~140 parole)</option>
                      <option value="90s">90 secondi (~210 parole)</option>
                    </select>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleGenerateScripts}
                  disabled={scriptGenLoading || !briefText.trim()}
                  className="w-full"
                >
                  {scriptGenLoading
                    ? "Genero varianti…"
                    : "Genera 3 varianti script"}
                </Button>

                {scriptGenLoading && (
                  <Progress label="Claude sta scrivendo gli script..." />
                )}

                {/* Variant cards */}
                {scriptVariants.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <p className="text-sm font-medium">
                      Scegli una variante (verrà copiata nello script sotto):
                    </p>
                    {scriptVariants.map((v, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-4 cursor-pointer transition-all hover:border-primary/60 hover:bg-primary/5 ${
                          script === v.script
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border"
                        }`}
                        onClick={() => handleSelectVariant(v)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">{v.title}</h4>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {v.framework}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {v.wordCount} parole
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-xs capitalize"
                            >
                              {v.tone}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-3">
                          {v.script}
                        </p>
                        <p className="text-xs text-muted-foreground italic">
                          Hook: {v.hookType} · {v.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="script">Script italiano</Label>
            <Textarea
              id="script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Scrivi qui lo script che l'avatar dovrà recitare in italiano, oppure usa il generatore AI sopra…"
              rows={6}
              required
            />
            <p className="text-xs text-muted-foreground">
              {script.split(/\s+/).filter(Boolean).length} parole · ~{Math.round(script.split(/\s+/).filter(Boolean).length / 2.3)} secondi parlati
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Suggested avatars (visible only when script >= 30 chars) */}
      {(suggestion?.avatars.length ?? 0) > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="text-2xl">✨</span>
              <div>
                <CardTitle className="font-display text-xl">Suggeriti per te</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  In base allo script · {suggestion?.reason}
                </p>
              </div>
              {suggestLoading && (
                <span className="text-xs text-muted-foreground ml-auto animate-pulse">
                  Analizzo…
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {suggestion?.avatars.map((a) => (
                <AvatarCard
                  key={a.id}
                  avatar={a}
                  selected={avatarId === a.id}
                  onSelect={() => setAvatarId(a.id)}
                  onToggleFavorite={() => toggleAvatarFavorite(a.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Avatar */}
      <Card>
        <CardHeader>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <CardTitle className="font-display text-xl">
              2 — Avatar{" "}
              <Badge variant="secondary" className="ml-2 align-middle">
                {avatarTotal.toLocaleString("it-IT")}
              </Badge>
              {avatarFavCount > 0 && (
                <Badge variant="outline" className="ml-1 align-middle">
                  ★ {avatarFavCount}
                </Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              value={avatarSearch}
              onChange={(e) => setAvatarSearch(e.target.value)}
              placeholder="Cerca per nome (es. Alessandro, Maria, Luca…)"
              className="flex-1 min-w-[240px]"
            />

            <button
              type="button"
              onClick={() => setOnlyFavoritesAvatar(!onlyFavoritesAvatar)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                onlyFavoritesAvatar
                  ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>★</span> Solo preferiti
            </button>

            <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
              {(["all", "male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenderFilter(g)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    genderFilter === g
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g === "all" ? "Tutti" : g === "male" ? "M" : "F"}
                </button>
              ))}
            </div>

            <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
              {(["9:16", "16:9", "1:1"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspectFilter(a)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    aspectFilter === a
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Quality filter: nasconde i legacy di default */}
          <div className="flex flex-wrap items-center gap-2 -mt-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Qualità lip sync
            </span>
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
              {(
                [
                  {
                    key: "default",
                    label: "Consigliati",
                    tooltip: "Solo premium (AVATAR_IV) — lip sync perfetto, fotorealismo top",
                  },
                  {
                    key: "premium",
                    label: "Solo premium",
                    tooltip: "Solo AVATAR_IV (il meglio disponibile, 2025-2026)",
                  },
                  {
                    key: "all",
                    label: "Tutti",
                    tooltip: "Mostra anche i legacy (talking photo, vecchi training)",
                  },
                ] as const
              ).map((q) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => setQualityFilter(q.key)}
                  title={q.tooltip}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    qualityFilter === q.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            {avatarQualityCounts.premium !== undefined && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {avatarQualityCounts.premium ?? 0} premium
                {avatarQualityCounts.legacy !== undefined
                  ? ` · ${avatarQualityCounts.legacy} legacy nascosti`
                  : ""}
              </span>
            )}
          </div>

          {avatarLoading && (
            <p className="text-xs text-muted-foreground">Carico avatar…</p>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[600px] overflow-y-auto p-1 scrollbar-thin">
            {avatars.map((a) => (
              <AvatarCard
                key={a.id}
                avatar={a}
                selected={avatarId === a.id}
                onSelect={() => setAvatarId(a.id)}
                onToggleFavorite={() => toggleAvatarFavorite(a.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAvatarPage((p) => Math.max(1, p - 1))}
                disabled={avatarPage === 1}
                className="px-3 py-1 rounded text-sm border border-border hover:bg-muted disabled:opacity-30"
              >
                ← Indietro
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                pagina {avatarPage} di {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setAvatarPage((p) => Math.min(totalPages, p + 1))}
                disabled={avatarPage === totalPages}
                className="px-3 py-1 rounded text-sm border border-border hover:bg-muted disabled:opacity-30"
              >
                Avanti →
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voce */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">3 — Voce</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setVoiceProvider("elevenlabs");
                setVoiceId("");
              }}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                voiceProvider === "elevenlabs"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-border/70"
              }`}
            >
              <div className="font-display text-lg">ElevenLabs</div>
              <div className="text-xs text-muted-foreground mt-1">
                Scegli tu la voce dalla libreria italiana (premium)
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceProvider("heygen");
                setVoiceId("");
              }}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                voiceProvider === "heygen"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-border/70"
              }`}
            >
              <div className="font-display text-lg">HeyGen <span className="text-xs italic text-muted-foreground">(automatica)</span></div>
              <div className="text-xs text-muted-foreground mt-1">
                Scegliamo noi la voce italiana migliore in base all'avatar
              </div>
            </button>
          </div>

          {voiceProvider === "elevenlabs" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Input
                  value={voiceSearch}
                  onChange={(e) => setVoiceSearch(e.target.value)}
                  placeholder="Cerca voce per nome…"
                  className="flex-1 min-w-[240px]"
                />
                <button
                  type="button"
                  onClick={() => setOnlyFavoritesVoice(!onlyFavoritesVoice)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                    onlyFavoritesVoice
                      ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>★</span> Solo preferiti
                </button>
                <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
                  {(["all", "male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setVoiceGender(g)}
                      className={`px-3 py-1 rounded-md text-xs transition-colors ${
                        voiceGender === g
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {g === "all" ? "Tutti" : g === "male" ? "M" : "F"}
                    </button>
                  ))}
                </div>
              </div>

              {voicesLoading && (
                <p className="text-xs text-muted-foreground">Carico voci…</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1 scrollbar-thin">
                {voices.map((v) => (
                  <VoiceCard
                    key={`${v.provider}-${v.id}`}
                    voice={v}
                    selected={voiceId === v.id}
                    onSelect={() => setVoiceId(v.id)}
                    onToggleFavorite={() => toggleVoiceFavorite(v.id, v.provider)}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preset Captions */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            4 — Captions cinematografici{" "}
            <span className="text-xs font-normal italic text-muted-foreground">opzionale</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {captionsPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCaptionPresetId(captionPresetId === p.id ? "" : p.id)}
                className={`group relative aspect-video p-4 rounded-xl border-2 text-left transition-all overflow-hidden ${
                  captionPresetId === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-border/70"
                }`}
              >
                <CaptionPreviewMock preset={p} />
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-background to-transparent">
                  <div className="text-sm font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-[10px] text-muted-foreground line-clamp-1">
                      {p.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Motion Graphics — AI-driven */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="font-display text-xl">
            5 — Motion Graphics{" "}
            <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
              AI
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-primary/30 bg-background/60 p-4 text-sm leading-relaxed space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">&#x2728;</span>
              <div>
                <div className="font-medium text-foreground mb-1">
                  Claude genera ogni motion graphic su misura
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Nessun template predefinito. Il <strong>Creative Director AI</strong> legge
                  lo script e scrive una descrizione creativa unica per ogni scena. Il{" "}
                  <strong>Traduttore Tecnico</strong> la trasforma in CSS, SVG e animazioni
                  — come un vero motion designer in After Effects.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">&#x1f3a8;</span>
              <div>
                <div className="font-medium text-foreground mb-1">
                  Colori e stile dal brand kit del cliente
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  I colori, i font e il mood vengono estratti automaticamente dal mockup
                  del prodotto caricato nel profilo cliente. Puoi configurare il brand kit
                  dalla{" "}
                  <a href={`/clients/${clientId}`} className="text-primary hover:underline">
                    pagina del cliente
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-3 sticky bottom-4 glass p-4 rounded-2xl border border-border/50">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Creazione…" : "✦ Genera video"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annulla
        </Button>
      </div>
    </form>
  );
}

// =====================================================================
// AvatarCard — bottone selezionabile con stella preferito
// =====================================================================

function AvatarCard({
  avatar,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  avatar: Avatar;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={`relative aspect-[9/16] rounded-xl overflow-hidden border-2 transition-all group ${
        selected
          ? "border-primary ring-2 ring-primary/40 scale-[1.02]"
          : "border-transparent hover:border-border hover:scale-[1.02]"
      }`}
    >
      <button type="button" onClick={onSelect} className="absolute inset-0 w-full h-full">
        {avatar.previewImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={avatar.previewImageUrl}
            alt={avatar.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-center px-1">
            {avatar.firstName}
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5">
          <div className="text-[10px] text-white truncate font-medium">
            {avatar.firstName}
          </div>
        </div>
      </button>

      {/* Stella preferito (in alto a sinistra, sopra il button) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={`absolute top-1 left-1 size-6 rounded-full flex items-center justify-center text-sm transition-all backdrop-blur ${
          avatar.favorite
            ? "bg-yellow-500/90 text-black"
            : "bg-black/40 text-white/60 opacity-0 group-hover:opacity-100 hover:bg-yellow-500/80 hover:text-black"
        }`}
        title={avatar.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      >
        {avatar.favorite ? "★" : "☆"}
      </button>

      {selected && (
        <div className="absolute top-1 right-1 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold pointer-events-none">
          ✓
        </div>
      )}

      {/* Quality badge: IV per premium, legacy per i pupazzosi */}
      {avatar.quality === "premium" && !selected && (
        <div
          className="absolute top-1 right-1 px-1.5 h-5 rounded bg-emerald-500/90 text-black flex items-center justify-center text-[9px] font-bold pointer-events-none tracking-wider"
          title="AVATAR_IV — lip sync perfetto"
        >
          IV
        </div>
      )}
      {avatar.quality === "legacy" && !selected && (
        <div
          className="absolute top-1 right-1 px-1.5 h-5 rounded bg-amber-500/90 text-black flex items-center justify-center text-[9px] font-bold pointer-events-none tracking-wider"
          title="Legacy / talking photo — lip sync limitato"
        >
          LEG
        </div>
      )}
    </div>
  );
}

// =====================================================================
// VoiceCard — bottone voce con preview audio + stella preferito
// =====================================================================

function VoiceCard({
  voice,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  voice: Voice;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={`relative text-left p-3 rounded-xl border transition-all ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-border/70"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left pr-8"
      >
        <div className="text-sm font-medium line-clamp-1">{voice.name}</div>
        <div className="flex items-center gap-1 mt-1.5">
          {voice.gender && (
            <Badge variant="secondary" className="text-[10px]">
              {voice.gender}
            </Badge>
          )}
          {voice.category && (
            <Badge variant="outline" className="text-[10px]">
              {voice.category}
            </Badge>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={`absolute top-2 right-2 size-7 rounded-full flex items-center justify-center text-sm transition-all ${
          voice.favorite
            ? "bg-yellow-500/90 text-black"
            : "bg-muted text-muted-foreground hover:bg-yellow-500/30 hover:text-yellow-300"
        }`}
        title={voice.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      >
        {voice.favorite ? "★" : "☆"}
      </button>

      {voice.previewUrl && (
        /* eslint-disable-next-line jsx-a11y/media-has-caption */
        <audio
          controls
          src={voice.previewUrl}
          className="w-full h-7 mt-2"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

// =====================================================================
// Caption preview mock — animazione CSS che ricorda lo stile del preset
// =====================================================================

function CaptionPreviewMock({ preset }: { preset: CaptionsPreset }) {
  const props = preset.defaultProps as Record<string, string | number | undefined>;
  const baseClass = "absolute inset-0 flex items-center justify-center text-center bg-zinc-900";

  switch (preset.remotionComponent) {
    case "Karaoke":
      return (
        <div className={baseClass}>
          <div className="text-xl font-bold">
            <span className="text-yellow-400">parola</span>{" "}
            <span className="text-white/40">corrente</span>
          </div>
        </div>
      );
    case "Pop3D":
      return (
        <div className={baseClass}>
          <div className="text-2xl font-extrabold text-white animate-pulse">POP!</div>
        </div>
      );
    case "Minimal":
      return (
        <div className={baseClass}>
          <div className="text-base font-light text-white">— minimal sub —</div>
        </div>
      );
    case "BeastMode":
      return (
        <div className={baseClass}>
          <div className="text-2xl font-black text-yellow-300 drop-shadow-[0_2px_0_rgba(255,0,0,1)]">
            INSANE!
          </div>
        </div>
      );
    case "Editorial":
      return (
        <div className={baseClass}>
          <div className="text-base italic text-white font-serif bg-black/60 px-3 py-1 rounded">
            Editorial
          </div>
        </div>
      );
    case "Glow":
      return (
        <div className={baseClass}>
          <div className="text-xl font-semibold text-white" style={{ textShadow: "0 0 12px #00E5FF, 0 0 24px #00E5FF" }}>
            glow
          </div>
        </div>
      );
    case "Typewriter":
      return (
        <div className={baseClass}>
          <div className="text-base font-mono text-white">
            type|<span className="animate-pulse">_</span>
          </div>
        </div>
      );
    case "HighlightBox":
      return (
        <div className={baseClass}>
          <div className="text-base font-bold text-black bg-yellow-300 px-2 py-0.5">
            highlight
          </div>
        </div>
      );
    case "SubtitleBar":
      return (
        <div className={baseClass}>
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent flex items-end justify-center pb-2">
            <div className="text-xs text-white">subtitle bar</div>
          </div>
        </div>
      );
    case "WordStack":
      return (
        <div className={baseClass}>
          <div className="text-3xl font-black uppercase text-white">WORD</div>
        </div>
      );
    case "TikTokBold":
      return (
        <div className={baseClass}>
          <div
            className="text-xl font-black uppercase text-white"
            style={{ WebkitTextStroke: "2px black" }}
          >
            TIKTOK
          </div>
        </div>
      );
    case "Comic":
      return (
        <div className={baseClass}>
          <div className="text-base font-bold text-black bg-white px-2 py-1 rounded-full shadow-lg">
            BOOM!
          </div>
        </div>
      );
    default:
      return (
        <div className={baseClass}>
          <div className="text-xs text-muted-foreground">{props.fontFamily ?? "Caption"}</div>
        </div>
      );
  }
}

// MotionPresetCard rimossa — MG ora dinamiche via AI, nessun preset visivo
