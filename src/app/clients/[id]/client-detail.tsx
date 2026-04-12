"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

type BrandKitData = {
  accentColor: string;
  textColor: string;
  bgColor: string;
  supportColor: string;
  bgColorSecondary?: string;
  extraColors?: string[];
  fontStyle: string;
  fontWeight: string;
  mood: string;
  borderRadius: number;
  motionStyle: string;
  productName?: string;
  mockupDescription?: string;
};

type ClientData = {
  id: string;
  name: string;
  slug: string;
  mockupUrls: string[];
  brandKit: Record<string, unknown> | null;
  productName: string | null;
};

// =============================================================================
// Font + mood labels
// =============================================================================

const FONT_LABELS: Record<string, string> = {
  "sans-serif": "Sans-serif (Montserrat / Inter)",
  serif: "Serif (Playfair Display / Source Serif 4)",
  display: "Display (Bebas Neue / Inter)",
  slab: "Slab Serif (Roboto Slab / Roboto)",
  handwritten: "Handwritten (Caveat / Inter)",
};

const MOOD_LABELS: Record<string, string> = {
  corporate: "Corporate",
  playful: "Playful",
  elegant: "Elegant",
  energetic: "Energetic",
  minimal: "Minimal",
  luxury: "Luxury",
  editorial: "Editorial",
};

const MOTION_LABELS: Record<string, string> = {
  snap: "Snap (entrate decise)",
  smooth: "Smooth (transizioni morbide)",
  bounce: "Bounce (animazioni elastiche)",
};

// =============================================================================
// Component
// =============================================================================

export function ClientDetail({ client: initialClient }: { client: ClientData }) {
  const [client, setClient] = useState(initialClient);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const brandKit = client.brandKit as BrandKitData | null;

  // =========================================================================
  // Upload mockup
  // =========================================================================

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File troppo grande (max 10 MB)");
        return;
      }

      const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
      if (!allowed.has(file.type)) {
        toast.error("Tipo non supportato. Usa JPEG, PNG, WebP o GIF.");
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch(`/api/clients/${client.id}/mockups`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Errore upload");
        }

        const data = await res.json();
        setClient((prev) => ({
          ...prev,
          mockupUrls: [...(prev.mockupUrls ?? []), data.mockupUrl],
          brandKit: data.brandKit,
          productName: data.brandKit?.productName ?? prev.productName,
        }));

        toast.success("Mockup caricato e brand kit estratto!");
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [client.id]
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  // =========================================================================
  // Delete mockup
  // =========================================================================

  async function handleDeleteMockup(mockupUrl: string) {
    try {
      const res = await fetch(`/api/clients/${client.id}/mockups`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mockupUrl }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Errore eliminazione");
      }

      setClient((prev) => ({
        ...prev,
        mockupUrls: prev.mockupUrls.filter((u) => u !== mockupUrl),
      }));

      toast.success("Mockup rimosso");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* ================================================================ */}
      {/* UPLOAD MOCKUP */}
      {/* ================================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Mockup prodotto</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Carica la copertina della guida, lead magnet o prodotto. Claude analizza
            l&apos;immagine ed estrae automaticamente i colori, lo stile tipografico e il mood
            del brand.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <label
            className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all ${
              dragOver
                ? "border-primary bg-primary/10 scale-[1.01]"
                : uploading
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            <div className="text-4xl opacity-50">
              {uploading ? "..." : dragOver ? "+" : "\u2b06"}
            </div>
            <div className="text-sm text-muted-foreground text-center">
              {uploading ? (
                <span className="text-primary font-medium animate-pulse">
                  Claude sta analizzando il mockup...
                </span>
              ) : (
                <>
                  <span className="text-foreground font-medium">
                    Trascina qui il mockup
                  </span>{" "}
                  oppure clicca per selezionare
                  <br />
                  <span className="text-xs">
                    JPEG, PNG, WebP o GIF &middot; max 10 MB
                  </span>
                </>
              )}
            </div>
          </label>

          {/* Mockup gallery */}
          {(client.mockupUrls?.length ?? 0) > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {client.mockupUrls.map((url) => (
                <div key={url} className="relative group rounded-lg overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/${url}`}
                    alt="Mockup"
                    className="w-full aspect-[3/4] object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteMockup(url)}
                    className="absolute top-1.5 right-1.5 size-7 rounded-full bg-red-500/80 text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    title="Rimuovi mockup"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* BRAND KIT — mostrato solo dopo upload */}
      {/* ================================================================ */}
      {brandKit && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl flex items-center justify-center text-xl"
                style={{ backgroundColor: brandKit.accentColor, color: brandKit.bgColor }}>
                B
              </div>
              <div>
                <CardTitle className="font-display text-xl">
                  Brand Kit{" "}
                  {client.productName && (
                    <span className="text-primary">
                      &mdash; {client.productName}
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estratto automaticamente da Claude Vision
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Descrizione mockup */}
            {brandKit.mockupDescription && (
              <p className="text-sm text-muted-foreground italic">
                &ldquo;{brandKit.mockupDescription}&rdquo;
              </p>
            )}

            {/* Palette colori */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Palette colori
              </h3>
              <div className="flex flex-wrap gap-3">
                <ColorSwatch color={brandKit.accentColor} label="Accent" />
                <ColorSwatch color={brandKit.textColor} label="Testo" />
                <ColorSwatch color={brandKit.bgColor} label="Sfondo" />
                <ColorSwatch color={brandKit.supportColor} label="Supporto" />
                {brandKit.bgColorSecondary && (
                  <ColorSwatch color={brandKit.bgColorSecondary} label="Sfondo 2" />
                )}
                {brandKit.extraColors?.map((c, i) => (
                  <ColorSwatch key={i} color={c} label={`Extra ${i + 1}`} />
                ))}
              </div>
            </div>

            {/* Preview palette applicata */}
            <div
              className="rounded-xl p-6 flex flex-col items-center gap-2"
              style={{
                background: brandKit.bgColorSecondary
                  ? `linear-gradient(135deg, ${brandKit.bgColor} 0%, ${brandKit.bgColorSecondary} 100%)`
                  : brandKit.bgColor,
                borderRadius: brandKit.borderRadius,
              }}
            >
              <div
                style={{
                  color: brandKit.accentColor,
                  fontSize: 42,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                87%
              </div>
              <div
                style={{
                  color: brandKit.textColor,
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: 0.9,
                }}
              >
                di crescita organica
              </div>
              <div
                className="mt-2 px-3 py-1 text-xs font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: brandKit.accentColor,
                  color: brandKit.bgColor,
                  borderRadius: brandKit.borderRadius,
                }}
              >
                {brandKit.motionStyle}
              </div>
            </div>

            {/* Info griglia */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <InfoBlock
                label="Font"
                value={FONT_LABELS[brandKit.fontStyle] ?? brandKit.fontStyle}
              />
              <InfoBlock
                label="Peso"
                value={brandKit.fontWeight}
              />
              <InfoBlock
                label="Mood"
                value={MOOD_LABELS[brandKit.mood] ?? brandKit.mood}
              />
              <InfoBlock
                label="Motion"
                value={MOTION_LABELS[brandKit.motionStyle] ?? brandKit.motionStyle}
              />
            </div>

            {/* Corner radius */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Border radius:</span>
              <div className="flex items-center gap-2">
                <div
                  className="size-8 border-2"
                  style={{
                    borderColor: brandKit.accentColor,
                    borderRadius: brandKit.borderRadius,
                  }}
                />
                <span className="font-mono text-xs">{brandKit.borderRadius}px</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================ */}
      {/* PROGETTI RECENTI */}
      {/* ================================================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-xl">Azioni</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/projects/new?client=${client.id}`}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + Nuovo video per {client.name}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="size-12 rounded-lg border border-border/40 shadow-sm"
        style={{ backgroundColor: color }}
        title={color}
      />
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-[10px] text-muted-foreground/70">{color}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
