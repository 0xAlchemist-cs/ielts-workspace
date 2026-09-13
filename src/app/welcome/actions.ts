"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { retrievalItems } from "@/db/schema";
import { getUserIdOrNull } from "@/server/current-user";
import { saveCorpusChunk } from "@/server/services/bank";

/* Notice-step write: clone the corpus chunk into the learner's own bank and
 * surface the retrieval item the Retrieve step will answer. Reuses the exact
 * production path (dedup + retrieval item + understood event). */
export async function saveWelcomeChunk(
  corpusChunkId: number,
): Promise<{ chunkId: number; retrievalItemId: number } | null> {
  const userId = await getUserIdOrNull();
  if (!userId || !Number.isInteger(corpusChunkId) || corpusChunkId <= 0) return null;
  const saved = await saveCorpusChunk(userId, corpusChunkId);
  if (!saved) return null;
  const [ri] = await db
    .select({ id: retrievalItems.id })
    .from(retrievalItems)
    .where(
      and(
        eq(retrievalItems.userId, userId),
        eq(retrievalItems.itemType, "chunk"),
        eq(retrievalItems.itemId, saved.id),
      ),
    )
    .limit(1);
  if (!ri) return null;
  return { chunkId: saved.id, retrievalItemId: ri.id };
}
