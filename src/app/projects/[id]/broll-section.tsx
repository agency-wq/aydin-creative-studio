"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SavedClip = {
  id: string;
  source: string;
  externalId: string | null;
  query: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  authorName: string | null;
  authorUrl: string | null;
  pageUrl: string | null;
  orderIndex: number;
  createdAt: string;
};

type SearchItem = {
  externalId: string;
  query: string;
  videoUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  durationSec: number;
  authorName: string | null;
  authorUrl: string | null;
  pageUrl: string;
};

type SearchResponse = {
  queries: string[];
  items: SearchItem[];
};

export function BrollSection({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<SavedClip[]>([]);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [usedQueries, setUsedQueries] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Carica clip salvate
  const loadSaved = async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/broll`, { cache: "no-store" });
      if (r.ok) setSaved(await r.json());
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSearch = async (customQuery?: string) => {
    setSearching(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/broll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "search",
          ...(customQuery ?? query.trim() ? { query: customQuery ?? query.trim() } : {}),
          perPage: 12,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.message ?? `errore ${r.status}`);
      }
      const data = (await r.json()) as SearchResponse;
      setResults(data.items);
      setUsedQueries(data.queries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async (item: SearchItem) => {
    setSavingId(item.externalId);
    try {
      const r = await fetch(`/api/projects/${projectId}/broll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "save",
          source: "pexels",
          externalId: item.externalId,
          query: item.query,
          videoUrl: item.videoUrl,
          thumbnailUrl: item.thumbnailUrl,
          width: item.width,
          height: item.height,
          durationSec: item.durationSec,
          authorName: item.authorName,
          authorUrl: item.authorUrl,
          pageUrl: item.pageUrl,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.message ?? `errore ${r.status}`);
      }
      await loadSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (clipId: string) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/broll?clipId=${clipId}`, {
        method: "DELETE",
      });
      if (r.ok) await loadSaved();
    } catch {
      // ignore
    }
  };

  const isAlreadySaved = (externalId: string) =>
    saved.some((s) => s.externalId === externalId);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>B-roll · Pexels</CardTitle>
        <CardDescription>
          Cerca clip stock gratuite. Senza query usa keywords automatiche dallo script.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search bar */}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Es. business meeting, ufficio moderno…"
            className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={() => handleSearch()} disabled={searching}>
            {searching ? "Ricerca…" : "Cerca su Pexels"}
          </Button>
          {query && (
            <Button variant="ghost" onClick={() => setQuery("")}>
              Reset
            </Button>
          )}
        </div>

        {usedQueries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Query usate:
            {usedQueries.map((q) => (
              <Badge key={q} variant="outline" className="text-[10px]">
                {q}
              </Badge>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Saved clips */}
        {saved.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">
              Clip salvate ({saved.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {saved.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg overflow-hidden border border-border bg-card relative group"
                >
                  <div className="aspect-[9/16] bg-muted/40">
                    <video
                      src={c.videoUrl}
                      poster={c.thumbnailUrl ?? undefined}
                      controls
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground truncate">
                        {c.authorName ?? "—"}
                      </span>
                      <Badge variant="default" className="text-[10px]">
                        {c.durationSec}s
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-[10px]"
                      onClick={() => handleDelete(c.id)}
                    >
                      Rimuovi
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Risultati ricerca ({results.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {results.map((item) => {
                const already = isAlreadySaved(item.externalId);
                return (
                  <div
                    key={item.externalId}
                    className="rounded-lg overflow-hidden border border-border bg-card"
                  >
                    <div className="aspect-[9/16] bg-muted/40 relative">
                      <video
                        src={item.videoUrl}
                        poster={item.thumbnailUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                        onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                        onMouseLeave={(e) => {
                          const v = e.currentTarget as HTMLVideoElement;
                          v.pause();
                          v.currentTime = 0;
                        }}
                      />
                      <Badge
                        variant="secondary"
                        className="absolute top-1 right-1 text-[10px]"
                      >
                        {item.durationSec}s
                      </Badge>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground truncate">
                          {item.authorName ?? "Pexels"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {item.width}×{item.height}
                        </span>
                      </div>
                      <Button
                        variant={already ? "secondary" : "default"}
                        size="sm"
                        className="w-full h-7 text-[10px]"
                        disabled={already || savingId === item.externalId}
                        onClick={() => handleSave(item)}
                      >
                        {already
                          ? "Salvata"
                          : savingId === item.externalId
                          ? "Salvataggio…"
                          : "+ Aggiungi"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {results.length === 0 && saved.length === 0 && !searching && (
          <p className="text-sm text-muted-foreground">
            Nessuna ricerca ancora. Clicca <strong>Cerca su Pexels</strong> per usare keywords automatiche
            dallo script, oppure inserisci una query custom.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
