import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClientDetail } from "./client-detail";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      _count: { select: { projects: true } },
    },
  });

  if (!client) notFound();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Tutti i clienti
        </Link>
        <div className="flex items-center gap-4 mt-2">
          <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
          <Badge variant="secondary">/{client.slug}</Badge>
          <Badge variant="outline">{client._count.projects} video</Badge>
        </div>
      </header>

      <ClientDetail
        client={{
          id: client.id,
          name: client.name,
          slug: client.slug,
          mockupUrls: client.mockupUrls ?? [],
          brandKit: client.brandColors as Record<string, unknown> | null,
          productName: client.productName,
        }}
      />
    </div>
  );
}
