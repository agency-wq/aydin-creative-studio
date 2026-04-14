// GET /api/projects/[id]/final-video
// Proxy verso il file server del worker che ha il video renderizzato.
// Se WORKER_PUBLIC_URL non è configurato, prova il file locale (dev mode).

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { stat } from "node:fs/promises";

const OUTPUT_DIR = path.resolve(process.cwd(), "..", "output");
const WORKER_URL = process.env.WORKER_PUBLIC_URL ?? process.env.RAILWAY_SERVICE_WORKER_URL ?? null;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filename = `${id}-final.mp4`;

  // 1. Se abbiamo un worker URL (Railway production), proxy verso il worker
  if (WORKER_URL) {
    const workerFileUrl = `${WORKER_URL}/output/${filename}`;
    const headers: Record<string, string> = {};
    const range = req.headers.get("range");
    if (range) headers["Range"] = range;

    try {
      const resp = await fetch(workerFileUrl, { headers });
      if (!resp.ok) {
        return NextResponse.json({ message: "render finale non trovato" }, { status: 404 });
      }
      const respHeaders = new Headers();
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const v = resp.headers.get(h);
        if (v) respHeaders.set(h, v);
      }
      if (!respHeaders.has("content-type")) respHeaders.set("content-type", "video/mp4");
      return new NextResponse(resp.body, {
        status: resp.status,
        headers: respHeaders,
      });
    } catch (err) {
      console.error(`[final-video] proxy error: ${(err as Error).message}`);
      return NextResponse.json({ message: "errore proxy verso worker" }, { status: 502 });
    }
  }

  // 2. Fallback: file locale (solo dev mode)
  const filePath = path.join(OUTPUT_DIR, filename);
  let fileSize: number;
  try {
    const s = await stat(filePath);
    fileSize = s.size;
  } catch {
    return NextResponse.json({ message: "render finale non trovato" }, { status: 404 });
  }

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
        },
      });
    }
  }

  const stream = fs.createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    },
  });
}
