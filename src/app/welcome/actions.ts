"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { retrievalItems, users, learningProfiles } from "@/db/schema";
import { getActiveExam, getCurrentUser, getUserIdOrNull } from "@/server/current-user";
import { saveCorpusChunk } from "@/server/services/bank";
import { generateTodayMission } from "@/server/services/mission";

/* Idempotent bootstrap of the ACTIVE exam's user with quick-start defaults —
 * safe from page rendering (GET). Cookie writes are NOT allowed there, so the
 * tour-done marker lives in completeTourAction only. */
export async function ensureWelcomeUser(): Promise<void> {
  const existing = await getCurrentUser();
  if (existing) return;
  const exam = await getActiveExam();
  const rows = await db.select().from(users).where(eq(users.examProfile, exam)).limit(1);
  let u = rows[0];
  if (!u) [u] = await db.insert(users).values({ name: "Learner", examProfile: exam }).returning();
  const profile = await db
    .select({ userId: learningProfiles.userId })
    .from(learningProfiles)
    .where(eq(learningProfiles.userId, u.id))
    .limit(1);
  if (!profile.length) {
    await db.insert(learningProfiles).values({
      userId: u.id,
      cefr: "B1",
      immersionLevel: 1,
      dailyMinutes: 45,
    });
    await generateTodayMission(u.id);
  }
}

/* Tour completion: create the user with quick-start defaults if this is a
 * truly fresh start, and mark the tour done in a long-lived cookie so the
 * homepage beginner branch retires itself. Server Action only (sets cookie). */
export async function completeTourAction(): Promise<void> {
  await ensureWelcomeUser();
  const jar = await cookies();
  jar.set("tour_done", "1", { maxAge: 60 * 60 * 24 * 365, path: "/" });
}

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
