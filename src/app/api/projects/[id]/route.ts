import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      renderJobs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return NextResponse.json({ message: "not found" }, { status: 404 });
  return NextResponse.json(project);
}
