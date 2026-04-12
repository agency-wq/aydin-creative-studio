import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    include: {
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clienti</h1>
          <p className="text-muted-foreground mt-1">
            Workspace separati per ogni cliente Aydin
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Nuovo cliente
        </Link>
      </header>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-6">
              Nessun cliente ancora. Aggiungi il primo per iniziare a creare video.
            </p>
            <Link
              href="/clients/new"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Aggiungi primo cliente
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`}>
              <Card className="hover:border-primary/60 transition-colors h-full">
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <CardDescription>/{c.slug}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{c._count.projects} video</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
