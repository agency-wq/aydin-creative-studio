import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    clientCount,
    projectCount,
    avatarCount,
    voiceCount,
    motionPresetCount,
    captionPresetCount,
    recentProjects,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.project.count(),
    prisma.avatar.count({ where: { enabled: true } }),
    prisma.voice.count({ where: { enabled: true } }),
    prisma.motionGraphicsPreset.count({ where: { enabled: true } }),
    prisma.captionsPreset.count({ where: { enabled: true } }),
    prisma.project.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { client: true },
    }),
  ]);

  const stats = [
    { label: "Clienti", value: clientCount, href: "/clients" },
    { label: "Video totali", value: projectCount, href: "/library" },
    { label: "Avatar in libreria", value: avatarCount, href: "/avatars" },
    { label: "Voci italiane", value: voiceCount, href: "/voices" },
    { label: "Preset Motion Graphics", value: motionPresetCount, href: "/presets" },
    { label: "Preset Captions", value: captionPresetCount, href: "/presets" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Aydin Creative Studio — produzione video AI per i tuoi clienti
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Nuovo video
        </Link>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:border-primary/60 transition-colors">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wide">
                  {s.label}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Video recenti</h2>
          {recentProjects.length > 0 && (
            <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">
              Vedi tutti →
            </Link>
          )}
        </div>

        {recentProjects.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground mb-6">
                Nessun video ancora. Crea il primo per partire.
              </p>
              <Link
                href="/projects/new"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Crea il primo video
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentProjects.map((p) => (
              <Card key={p.id}>
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
