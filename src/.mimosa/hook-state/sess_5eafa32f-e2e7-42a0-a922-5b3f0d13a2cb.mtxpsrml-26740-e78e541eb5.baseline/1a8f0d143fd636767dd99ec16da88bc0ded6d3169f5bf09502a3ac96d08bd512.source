import { NextResponse } from "next/server";
import { getProvider } from "@/lib/ai";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { db } from "@/db";
import { chunks as chunksT, sentences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserIdOrNull } from "@/server/current-user";
import { recordEvent } from "@/server/services/progress";
import { readJsonBody, stringField, badRequest } from "@/lib/request";
import type { MatchedChunkHint } from "@/lib/ai/provider";

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ sentence?: unknown; sentenceId?: number }>(req);
  const sentence = stringField(body, "sentence", 2000);
  if (!sentence) {
    return badRequest(
      body == null ? "invalid JSON body" : "sentence required (string, ≤ 2000 chars)",
      body == null ? 400 : 400,
    );
  }

  // Grounding: which corpus chunks appear in this sentence?
  // The table holds both corpus seeds and the user's saved copies of the same
  // text — dedupe by text or one chunk renders twice (and starves the 4 slots).
  const all = await db.select().from(chunksT);
  const seenText = new Set<string>();
  const matched: MatchedChunkHint[] = [];
  for (const c of all) {
    if (matched.length >= 4) break;
    if (seenText.has(c.text) || !CHUNK_DETECT[c.text]?.test(sentence)) continue;
    seenText.add(c.text);
    matched.push({
      text: c.text,
      pattern: c.pattern,
      meaningEn: c.meaningEn,
      meaningZh: c.meaningZh,
      examples: c.examples,
    });
  }

  const result = await getProvider().sentence({ sentence, matchedChunks: matched });
  await recordEvent(userId, "understood");

  // Cache the analysis on the sentence row when it belongs to the corpus.
  const sentenceId = typeof body?.sentenceId === "number" ? body.sentenceId : 0;
  if (sentenceId) {
    await db
      .update(sentences)
      .set({ sentenceAnalysis: result })
      .where(eq(sentences.id, sentenceId));
  }
  return NextResponse.json(result);
}
