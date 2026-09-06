import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT } from "@/db/schema";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { ERROR_PATTERNS } from "@/lib/ai/providers/mock";
import { tokenizeWords } from "@/lib/text";
import { getUserIdOrNull } from "@/server/current-user";
import { saveUserSentence } from "@/server/services/bank";
import { logChunkEvent, markChunkActivated } from "@/server/services/events";

export interface GenerationVerdict {
  usedChunk: boolean;
  correct: boolean;
  understandable: boolean;
  natural: boolean;
  ieltsUseful: boolean;
  pass: boolean;
  feedback: string;
  errors: { wrong: string; correct: string; explanation: string }[];
}

/** STEP 4 — judge the learner's own sentence about their own life. */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = (await req.json()) as { chunkId?: number; sentence?: string };
  const sentence = (body.sentence ?? "").trim();
  if (!body.chunkId || !sentence) {
    return NextResponse.json({ error: "chunkId and sentence required" }, { status: 400 });
  }

  const [chunk] = await db.select().from(chunksT).where(eq(chunksT.id, body.chunkId)).limit(1);
  if (!chunk || chunk.userId !== userId) {
    return NextResponse.json({ error: "chunk not found" }, { status: 404 });
  }

  const words = tokenizeWords(sentence);
  const usedChunk = CHUNK_DETECT[chunk.text] ? CHUNK_DETECT[chunk.text].test(sentence) : sentence.includes(chunk.text);
  const errors = ERROR_PATTERNS.filter((p) => p.re.test(sentence)).map((p) => ({
    wrong: p.wrong,
    correct: p.correct,
    explanation: p.explanation,
  }));

  const understandable = words.length >= 4 && usedChunk;
  const natural = words.length >= 6 && errors.length === 0;
  const ieltsUseful = usedChunk && words.length >= 8 && errors.length === 0;
  const correct = usedChunk && errors.length === 0;
  const pass = understandable && errors.length === 0;

  let feedback: string;
  if (!usedChunk) {
    feedback = `The sentence doesn't use "${chunk.text}" yet. Pattern: ${chunk.pattern || chunk.text}. Try again — your own life, one sentence.`;
  } else if (errors.length > 0) {
    feedback = `"${chunk.text}" is in — fix the highlighted issue and resubmit. One fix at a time is how errors die.`;
  } else if (words.length < 6) {
    feedback = `Good, but too short to be useful. Extend it: when? why? with whom?`;
  } else {
    feedback = `Accepted — this is now YOUR sentence for "${chunk.text}". Say it out loud once; it's queued for retrieval from tomorrow.`;
  }

  await logChunkEvent(userId, chunk.id, pass ? "generation_pass" : "generation", sentence);
  if (pass) {
    await saveUserSentence(userId, "chunk", chunk.id, sentence);
    await markChunkActivated(userId, chunk.id);
  }

  const verdict: GenerationVerdict = { usedChunk, correct, understandable, natural, ieltsUseful, pass, feedback, errors };
  return NextResponse.json({ verdict });
}
