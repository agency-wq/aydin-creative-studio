import { NextResponse } from "next/server";

// @ts-expect-error - pdf-parse non ha i tipi
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

/**
 * POST /api/scripts/upload
 *
 * Accetta un file (PDF, DOCX, TXT) via FormData e ritorna il testo estratto.
 * Il frontend lo incolla nel campo brief per poi chiamare /api/scripts/generate.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Nessun file allegato" },
        { status: 400 }
      );
    }

    // Max 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File troppo grande (max 10 MB)" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let text = "";

    if (name.endsWith(".pdf")) {
      const result = await pdfParse(buf);
      text = result.text ?? "";
    } else if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value ?? "";
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = buf.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Formato non supportato. Usa PDF, DOCX o TXT." },
        { status: 400 }
      );
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Il file non contiene testo estraibile" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text,
      charCount: text.length,
      fileName: file.name,
    });
  } catch (err) {
    console.error("[api/scripts/upload]", err);
    return NextResponse.json(
      { error: "Errore nell'estrazione del testo dal file" },
      { status: 500 }
    );
  }
}
