import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { enqueueAvatarVideo } from "@/lib/queue";

const CreateProjectSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(1).max(200),
  script: z.string().min(1).max(10000),
  avatarId: z.string().min(1),
  voiceProvider: z.enum(["heygen", "elevenlabs"]),
  // voiceId opzionale: se voiceProvider == "heygen" e non specificato, scegliamo automaticamente
  voiceId: z.string().min(1).optional().nullable(),
  captionPresetId: z.string().nullable().optional(),
  motionPresetId: z.string().nullable().optional(),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
});

// Pesca la voce HeyGen per l'avatar.
// Strategia:
//  1. Se l'avatar ha un default_voice_id → usa quello direttamente (HeyGen lo gestisce)
//  2. Fallback: null (il worker userà la voce ElevenLabs come TTS esterno)
function pickHeyGenVoiceForAvatar(
  avatar: { defaultVoiceId: string | null; gender: string }
): string | null {
  // HeyGen assegna già una voce di default a ogni avatar — la usiamo direttamente
  // senza bisogno di un record nella tabella Voice
  return avatar.defaultVoiceId ?? null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Dati non validi", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verifica esistenza referenze
  const [client, avatar] = await Promise.all([
    prisma.client.findUnique({ where: { id: parsed.data.clientId } }),
    prisma.avatar.findUnique({ where: { id: parsed.data.avatarId } }),
  ]);

  if (!client) return NextResponse.json({ message: "Cliente non trovato" }, { status: 404 });
  if (!avatar) return NextResponse.json({ message: "Avatar non trovato" }, { status: 404 });

  // Risoluzione voiceId
  let resolvedVoiceId = parsed.data.voiceId ?? null;

  if (parsed.data.voiceProvider === "heygen") {
    // Per HeyGen pesca AUTOMATICAMENTE la voce migliore (anche se l'utente l'ha specificata)
    // Cosi l'utente non deve mai scegliere una voce HeyGen.
    resolvedVoiceId = pickHeyGenVoiceForAvatar(avatar);
    if (!resolvedVoiceId) {
      return NextResponse.json(
        { message: "Nessuna voce HeyGen italiana disponibile" },
        { status: 500 }
      );
    }
  } else {
    // ElevenLabs: l'utente deve aver scelto la voce
    if (!resolvedVoiceId) {
      return NextResponse.json(
        { message: "Per ElevenLabs serve scegliere una voce" },
        { status: 400 }
      );
    }
    const voice = await prisma.voice.findUnique({
      where: { provider_id: { provider: "elevenlabs", id: resolvedVoiceId } },
    });
    if (!voice) {
      return NextResponse.json({ message: "Voce ElevenLabs non trovata" }, { status: 404 });
    }
  }

  const project = await prisma.project.create({
    data: {
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      script: parsed.data.script,
      avatarId: parsed.data.avatarId,
      voiceProvider: parsed.data.voiceProvider,
      voiceId: resolvedVoiceId,
      captionPresetId: parsed.data.captionPresetId,
      motionPresetId: parsed.data.motionPresetId,
      resolution: parsed.data.resolution,
      aspectRatio: parsed.data.aspectRatio,
      status: "QUEUED",
    },
  });

  // Tracciamento uso avatar per rotazione
  await prisma.avatarUsage.create({
    data: { avatarId: parsed.data.avatarId, clientId: parsed.data.clientId },
  });

  // Enqueue del job BullMQ — il worker (pnpm worker) lo prelevera
  try {
    await enqueueAvatarVideo({ projectId: project.id });
  } catch (err) {
    console.error("[api/projects] enqueue failed", err);
    // Non blocchiamo la creazione del progetto: resta in QUEUED, l'utente puo
    // ri-triggerare manualmente con un endpoint dedicato (TODO).
  }

  return NextResponse.json(project, { status: 201 });
}

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true },
    take: 50,
  });
  return NextResponse.json(projects);
}
