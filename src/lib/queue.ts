// BullMQ queue setup. Una sola coda "avatar-video" per ora.
// Il worker live in src/lib/workers/avatar-video.worker.ts e gira come processo separato.

import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// Connessione condivisa per il producer (Next.js API routes).
// maxRetriesPerRequest=null e raccomandato da BullMQ per i client.
export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const AVATAR_VIDEO_QUEUE = "avatar-video";

export type AvatarVideoJobData = {
  projectId: string;
  /** Se true, salta HeyGen e ri-renderizza solo con Remotion (step 6-9).
   *  Richiede che il progetto abbia gia un video HeyGen completato. */
  retryRender?: boolean;
};

export const avatarVideoQueue = new Queue<AvatarVideoJobData>(AVATAR_VIDEO_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 }, // 7 giorni
    removeOnFail: { age: 60 * 60 * 24 * 30 }, // 30 giorni
  },
});

export const avatarVideoEvents = new QueueEvents(AVATAR_VIDEO_QUEUE, { connection });

export async function enqueueAvatarVideo(data: AvatarVideoJobData) {
  return avatarVideoQueue.add("generate", data, {
    jobId: `project-${data.projectId}`,
  });
}
