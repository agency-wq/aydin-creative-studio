"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function NewClientPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (res.ok) {
        toast.success("Cliente creato");
        router.push("/clients");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message ?? "Errore creazione cliente");
      }
    });
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
          ← Tutti i clienti
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">Nuovo cliente</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Informazioni base</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome cliente</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  setSlug(
                    v
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }}
                placeholder="Es. Cliente Demo"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="cliente-demo"
                required
                pattern="[a-z0-9-]+"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={pending || !name || !slug}>
                {pending ? "Creazione…" : "Crea cliente"}
              </Button>
              <Link
                href="/clients"
                className="inline-flex h-8 items-center px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Annulla
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
