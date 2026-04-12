"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Word = {
  word: string;
  start: number; // ms
  end: number; // ms
  confidence: number;
};

type TranscriptData = {
  text?: string;
  language?: string;
  words?: Word[];
  durationMs?: number;
} | null;

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function TranscriptSection({
  transcript,
}: {
  projectId: string;
  transcript: TranscriptData;
}) {
  if (!transcript) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Trascrizione</CardTitle>
          <CardDescription>
            La trascrizione apparira qui quando AssemblyAI sara configurato e
            il prossimo video verra generato.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const words = transcript.words ?? [];
  const wordCount = words.length;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Trascrizione</CardTitle>
            <CardDescription>
              {wordCount} parole · {transcript.language ?? "it"}
              {transcript.durationMs ? ` · ${formatMs(transcript.durationMs)}` : ""}
            </CardDescription>
          </div>
          <Badge variant="outline">word-level timestamps</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/40 p-4">
          <p className="text-sm leading-relaxed">{transcript.text}</p>
        </div>

        {wordCount > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Mostra timestamp parola per parola ({wordCount})
            </summary>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {words.map((w, i) => (
                  <div key={i} className="contents">
                    <span className="text-muted-foreground">{formatMs(w.start)}</span>
                    <span>{w.word}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
