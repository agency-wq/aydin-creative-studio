import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectDetailView } from "./project-detail-view";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      renderJobs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) notFound();

  // Serializza Date in stringhe per il client
  const initial = JSON.parse(JSON.stringify(project));

  return <ProjectDetailView projectId={id} initial={initial} />;
}
