import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { chunkEvents, chunks } from "@/db/schema";

export type ChunkEventType =
  | "guess"
  | "analysis"
  | "generation"
  | "generation_pass"
  | "retrieval_attempt"
  | "retrieval_success"
  | "context_transfer"
  | "speaking_use"
  | "ielts_use"
  | "listen_recall"
  | "listen_shadow";

/** The honest ledger: every real interaction with an expression is recorded. */
export async function logChunkEvent(
  userId: number,
  chunkId: number,
  type: ChunkEventType,
  detail = "",
): Promise<void> {
  await db.insert(chunkEvents).values({ userId, chunkId, type, detail: detail.slice(0, 500) });
}

/** Passive → Active. Fires on: production retrieval success, accepted own
 *  sentence, or real use in speaking/writing. Idempotent. */
export async function markChunkActivated(userId: number, chunkId: number): Promise<boolean> {
  const res = await db
    .update(chunks)
    .set({ activatedAt: Date.now() })
    .where(and(eq(chunks.id, chunkId), eq(chunks.userId, userId), isNotNull(chunks.userId)))
    .returning({ id: chunks.id });
  return res.length > 0;
}

export async function activationStats(userId: number): Promise<{ tracked: number; active: number }> {
  const [tracked] = await db
    .select({ c: sql<number>`count(*)` })
    .from(chunks)
    .where(eq(chunks.userId, userId));
  const [active] = await db
    .select({ c: sql<number>`count(*)` })
    .from(chunks)
    .where(and(eq(chunks.userId, userId), isNotNull(chunks.activatedAt)));
  return { tracked: tracked?.c ?? 0, active: active?.c ?? 0 };
}
