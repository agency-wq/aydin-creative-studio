// =============================================================================
// POST /api/clients/[id]/mockups — Upload mockup + auto-extract brand kit
// =============================================================================
//
// Accetta un'immagine (JPEG, PNG, WebP) via FormData.
// 1. Salva l'immagine in public/generated/mockups/{clientId}/
// 2. Chiama Claude Vision per estrarre il brand kit (colori, font, mood)
// 3. Aggiorna il Client con mockupUrls, brandColors, productName
// 4. Ritorna il brand kit estratto
//
// GET /api/clients/[id]/mockups — Lista mockup e brand kit del client

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient, Prisma } from "@/generated/prisma";
import { extractBrandKit, type BrandKit } from "@/lib/brand-kit";

const prisma = new PrismaClient();

const MOCKUP_PUBLIC_SUBDIR = "generated/mockups";
const REMOTION_PUBLIC_DIR = path.resolve(process.cwd(), "public");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================================
// POST — upload mockup + extract brand kit
// =============================================================================

export async function POST(req: Request, ctx: RouteContext) {
  const { id: clientId } = await ctx.params;

  // Verifica client
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "Client non trovato" }, { status: 404 });
  }

  // Parse FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData invalido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' mancante o invalido" }, { status: 400 });
  }

  // Validazioni
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File troppo grande: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 10 MB)` },
      { status: 400 }
    );
  }

  const mimeType = file.type;
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Tipo file non supportato: ${mimeType}. Usa JPEG, PNG, WebP o GIF.` },
      { status: 400 }
    );
  }

  // Salva file
  const ext = mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1];
  const timestamp = Date.now();
  const fileName = `${clientId}-${timestamp}.${ext}`;
  const mockupDir = path.join(REMOTION_PUBLIC_DIR, MOCKUP_PUBLIC_SUBDIR, clientId);
  const absPath = path.join(mockupDir, fileName);
  const relPath = `${MOCKUP_PUBLIC_SUBDIR}/${clientId}/${fileName}`;

  await fs.mkdir(mockupDir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, buf);

  // Estrai brand kit con Claude Vision
  const logs: string[] = [];
  const brandKit = await extractBrandKit(
    buf,
    mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
    (msg) => logs.push(msg)
  );

  // Aggiorna Client nel DB
  const existingMockups = client.mockupUrls ?? [];
  const updatedMockups = [...existingMockups, relPath];

  await prisma.client.update({
    where: { id: clientId },
    data: {
      mockupUrls: updatedMockups,
      brandColors: brandKit as unknown as Prisma.InputJsonValue,
      productName: brandKit.productName ?? client.productName,
    },
  });

  return NextResponse.json({
    success: true,
    mockupUrl: relPath,
    brandKit,
    logs,
    totalMockups: updatedMockups.length,
  });
}

// =============================================================================
// GET — lista mockup e brand kit
// =============================================================================

export async function GET(_req: Request, ctx: RouteContext) {
  const { id: clientId } = await ctx.params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      mockupUrls: true,
      brandColors: true,
      productName: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Client non trovato" }, { status: 404 });
  }

  return NextResponse.json({
    clientId: client.id,
    clientName: client.name,
    mockupUrls: client.mockupUrls,
    brandKit: client.brandColors as BrandKit | null,
    productName: client.productName,
  });
}

// =============================================================================
// DELETE — rimuovi un mockup
// =============================================================================

export async function DELETE(req: Request, ctx: RouteContext) {
  const { id: clientId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const mockupUrl = typeof body.mockupUrl === "string" ? body.mockupUrl : null;

  if (!mockupUrl) {
    return NextResponse.json({ error: "Campo 'mockupUrl' mancante" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "Client non trovato" }, { status: 404 });
  }

  // Rimuovi dall'array
  const updatedMockups = (client.mockupUrls ?? []).filter((u) => u !== mockupUrl);

  // Elimina file fisico
  const absPath = path.join(REMOTION_PUBLIC_DIR, mockupUrl);
  try {
    await fs.unlink(absPath);
  } catch {
    // File potrebbe non esistere, ignora
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { mockupUrls: updatedMockups },
  });

  return NextResponse.json({
    success: true,
    remainingMockups: updatedMockups.length,
  });
}
