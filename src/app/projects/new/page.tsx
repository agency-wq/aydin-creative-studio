import { prisma } from "@/lib/db";
import { NewProjectForm } from "./new-project-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  // Avatar e voci sono ora caricati lato client tramite API paginata.
  // Qui passiamo solo clienti + preset (statici).
  const [clients, captionsPresets] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.captionsPreset.findMany({ where: { enabled: true } }),
  ]);

  if (clients.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-4">Nuovo video</h1>
        <p className="text-muted-foreground mb-6">
          Devi prima creare almeno un cliente prima di poter generare un video.
        </p>
        <Link
          href="/clients/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Crea il primo cliente
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">Nuovo video</h1>
        <p className="text-muted-foreground mt-1">
          Seleziona cliente, avatar, voce e stile. La generazione partira in background.
        </p>
      </header>

      <NewProjectForm
        clients={clients}
        captionsPresets={captionsPresets.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          remotionComponent: p.remotionComponent,
          defaultProps: (p.defaultProps ?? {}) as Record<string, unknown>,
        }))}
      />
    </div>
  );
}
