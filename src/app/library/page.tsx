import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Libreria video</h1>
          <p className="text-muted-foreground mt-1">{projects.length} video totali</p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Nuovo video
        </Link>
      </header>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-6">Libreria vuota.</p>
            <Link
              href="/projects/new"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Crea primo video
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-primary/60 transition-colors h-full">
                <CardHeader>
                  <CardDescription>{p.client.name}</CardDescription>
                  <CardTitle className="text-base line-clamp-2">{p.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant={p.status === "COMPLETED" ? "default" : "secondary"}>
                      {p.status.toLowerCase().replaceAll("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
