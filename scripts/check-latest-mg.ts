import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const project = await prisma.project.findFirst({
    orderBy: { updatedAt: "desc" },
    include: {
      motionGraphicsClips: { orderBy: { createdAt: "asc" } },
      brollClips: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) { console.log("no project"); return; }
  console.log(`PROJECT: ${project.id}`);
  console.log(`  title: ${project.title}`);
  console.log(`  status: ${project.status}`);
  console.log(`  updatedAt: ${project.updatedAt.toISOString()}`);
  console.log(`  finalVideoUrl: ${project.finalVideoUrl}`);
  console.log(`MG CLIPS (${project.motionGraphicsClips.length}):`);
  for (const c of project.motionGraphicsClips) {
    console.log(`  [${c.status}] template=${c.templateName ?? "(null)"} theme=${c.themeName ?? "(null)"}`);
    console.log(`    videoUrl="${c.videoUrl?.slice(0, 60)}"`);
    console.log(`    prompt="${c.prompt.slice(0, 80)}"`);
    console.log(`    createdAt=${c.createdAt.toISOString()}`);
  }
  console.log(`BROLL CLIPS (${project.brollClips.length}):`);
  for (const b of project.brollClips) {
    console.log(`  ${b.source} ${b.query} -> ${b.videoUrl.slice(0, 60)}`);
  }
}
main().finally(() => prisma.$disconnect());
