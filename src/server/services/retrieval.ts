import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chunks,
  errors,
  grammarPatterns,
  reviewHistory,
  retrievalItems,
  vocabularies,
  type Chunk,
  type RetrievalItem,
} from "@/db/schema";
import { gradeRetrieval } from "@/lib/grading";
import type { GradeTarget } from "@/lib/grading";
import type { ItemLearningState, ModuleContext, ReviewMode } from "@/lib/types";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { advanceState, decideFormat, holisticStrength } from "@/lib/retrieval-engine";
import { recordEvent } from "@/server/services/progress";
import { logChunkEvent, markChunkActivated } from "@/server/services/events";

const DAY = 86_400_000;

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Queue building ──────────────────────────────────────────────────────────

/* V15.2: the duplicate daily-queue implementation (ReviewQueueItem /
 * buildQueueItem / loadTargets / getReviewQueue) was REMOVED — every
 * consumer (mission batch, /review page, labs, suites) now reads the ONE
 * canonical queue: generateReviewQueue in retention.ts. */

// ── SM-2 variant with production weighting ──────────────────────────────────

export function computeStrength(item: RetrievalItem): number {
  const total = item.successCount + item.failCount;
  const successRate = total ? item.successCount / total : 0;
  const s =
    0.5 * successRate +
    0.25 * Math.min(1, item.successCount / 5) +
    0.25 * Math.min(1, item.intervalDays / 21);
  return Math.round(Math.min(100, Math.max(0, s * 100)));
}

export interface ReviewResult {
  quality: 0 | 3 | 5;
  correct: boolean;
  verdict: string;
  targetAnswer: string;
  missingPieces: string[];
  strength: number;
  intervalDays: number;
  nextDueAt: number;
}

export async function submitReview(
  userId: number,
  retrievalItemId: number,
  mode: ReviewMode,
  response: string,
  context: ModuleContext = "review",
): Promise<ReviewResult | null> {
  const rows = await db
    .select()
    .from(retrievalItems)
    .where(and(eq(retrievalItems.id, retrievalItemId), eq(retrievalItems.userId, userId)))
    .limit(1);
  if (!rows.length) return null;
  const item = rows[0];

  // Build grading target from the underlying entity
  let target: GradeTarget = { itemType: item.itemType };
  if (item.itemType === "chunk") {
    const c = (await db.select().from(chunks).where(eq(chunks.id, item.itemId)).limit(1))[0] as Chunk | undefined;
    if (c) target = { itemType: "chunk", chunkText: c.text, pattern: c.pattern, examples: c.examples };
  } else if (item.itemType === "vocab") {
    const v = (await db.select().from(vocabularies).where(eq(vocabularies.id, item.itemId)).limit(1))[0];
    if (v) target = { itemType: "vocab", headword: v.headword, exactMatch: mode === "recognition" };
  } else if (item.itemType === "error") {
    const e = (await db.select().from(errors).where(eq(errors.id, item.itemId)).limit(1))[0];
    if (e) target = { itemType: "error", wrongForm: e.wrongForm, correctForm: e.correctForm };
  } else if (item.itemType === "grammar" || item.itemType === "sentence_pattern" || item.itemType === "spoken_pattern") {
    const g = (await db.select().from(grammarPatterns).where(eq(grammarPatterns.id, item.itemId)).limit(1))[0];
    if (g) target = { itemType: item.itemType, chunkText: g.pattern, pattern: g.pattern, examples: g.examples };
  }

  const grade = gradeRetrieval(target, response);
  const now = Date.now();

  // SM-2 update — production-mode success is the strongest evidence of learning
  let { easeFactor, intervalDays } = item;
  let successCount = item.successCount;
  let failCount = item.failCount;
  if (grade.quality >= 3) {
    const factor = mode === "production" || mode === "context_transfer" ? 1.2 : mode === "cued_recall" || mode === "cloze" ? 1.0 : 0.8;
    intervalDays = intervalDays === 0 ? 1 : Math.round(intervalDays * easeFactor * factor);
    easeFactor = Math.min(2.8, easeFactor + 0.1);
    successCount++;
  } else {
    intervalDays = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    failCount++;
  }
  const dueAt = now + intervalDays * DAY;

  // ── Retrieval Engine: advance the 7-state learning ladder ────────────────
  const currentLearningState: ItemLearningState = item.learningState ?? {
    state: "exposure",
    achievedAt: {},
    contexts: [],
    productionHits: 0,
    productionMisses: 0,
    contextualHits: 0,
    contextualMisses: 0,
  };
  const format = decideFormat(item.itemType, currentLearningState, context);
  const newLearningState = advanceState(currentLearningState, format, grade.quality, context);
  const newStrength = holisticStrength(newLearningState);

  const updated = {
    easeFactor,
    intervalDays,
    dueAt,
    successCount,
    failCount,
    lastQuality: grade.quality,
    learningState: newLearningState,
  };
  await db.update(retrievalItems).set(updated).where(eq(retrievalItems.id, item.id));

  const strength = newStrength;
  const reviewedAt = now;

  // denormalised strength + activation on the entity rows
  if (item.itemType === "chunk") {
    await db
      .update(chunks)
      .set({ retrievalStrength: strength, lastReviewAt: reviewedAt })
      .where(eq(chunks.id, item.itemId));
  } else if (item.itemType === "vocab") {
    const becomesActive = (mode === "production" || mode === "context_transfer") && grade.quality === 5;
    await db
      .update(vocabularies)
      .set({
        retrievalStrength: strength,
        lastReviewAt: reviewedAt,
        ...(becomesActive ? { status: "active" as const } : {}),
      })
      .where(eq(vocabularies.id, item.itemId));
  }

  await db.insert(reviewHistory).values({
    retrievalItemId: item.id,
    userId,
    mode,
    prompt: item.itemType,
    expected: grade.targetAnswer,
    userResponse: response,
    correct: grade.correct ? 1 : 0,
    quality: grade.quality,
  });

  // Successful retrieval is a real learning event — count it wherever it happens.
  if (grade.quality >= 3) await recordEvent(userId, "retrieved");

  // ── Error lifecycle: advance/demote the underlying error on retrieval ───
  if (item.itemType === "error") {
    const { advanceErrorStatus } = await import("@/server/services/learning-profile");
    await advanceErrorStatus(userId, item.itemId, grade.quality);
  }

  // Passive → Active: producing a chunk from memory is the promotion gate.
  if (item.itemType === "chunk" && mode === "production") {
    await logChunkEvent(userId, item.itemId, grade.quality >= 3 ? "retrieval_success" : "retrieval_attempt", response);
    if (grade.quality === 5) {
      const [c] = await db.select({ activatedAt: chunks.activatedAt }).from(chunks).where(eq(chunks.id, item.itemId)).limit(1);
      await markChunkActivated(userId, item.itemId);
      if (!c?.activatedAt) await logChunkEvent(userId, item.itemId, "retrieval_success", "ACTIVATED");
    }
  }

  return {
    ...grade,
    strength,
    intervalDays,
    nextDueAt: dueAt,
  };
}

/** Idempotently register an entity for retrieval scheduling. */
export async function ensureRetrievalItem(
  userId: number,
  itemType: "chunk" | "vocab" | "grammar" | "error" | "sentence_pattern" | "spoken_pattern",
  itemId: number,
): Promise<void> {
  await db
    .insert(retrievalItems)
    .values({ userId, itemType, itemId })
    .onConflictDoNothing();
}

export async function retrievalStats(userId: number): Promise<{
  totalItems: number;
  accuracy30d: number;
  averageStrength: number;
  dueNow: number;
}> {
  const [totalRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(retrievalItems)
    .where(eq(retrievalItems.userId, userId));
  const [histRow] = await db
    .select({
      total: sql<number>`count(*)`,
      correct: sql<number>`sum(case when ${reviewHistory.correct} = 1 then 1 else 0 end)`,
    })
    .from(reviewHistory)
    .where(
      and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${Date.now() - 30 * DAY}`),
    );
  const [strengthRow] = await db
    .select({
      avg: sql<number>`avg(case when ${retrievalItems.itemType} = 'chunk' then ${chunks.retrievalStrength} else null end)`,
    })
    .from(retrievalItems)
    .leftJoin(chunks, and(eq(retrievalItems.itemType, "chunk"), eq(retrievalItems.itemId, chunks.id)))
    .where(eq(retrievalItems.userId, userId));
  const [dueRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), lte(retrievalItems.dueAt, Date.now())));

  const histTotal = histRow?.total ?? 0;
  const histCorrect = histRow?.correct ?? 0;
  return {
    totalItems: totalRow?.c ?? 0,
    accuracy30d: histTotal ? Math.round((histCorrect / histTotal) * 100) : 0,
    averageStrength: strengthRow?.avg ? Math.round(strengthRow.avg) : 0,
    dueNow: dueRow?.c ?? 0,
  };
}

/** Items whose chunk ids are in the given list (for mission retrieval step). */
export async function retrievalIdsForChunks(
  userId: number,
  chunkIds: number[],
): Promise<number[]> {
  if (!chunkIds.length) return [];
  const rows = await db
    .select({ id: retrievalItems.id })
    .from(retrievalItems)
    .where(
      and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemType, "chunk"), inArray(retrievalItems.itemId, chunkIds)),
    );
  return rows.map((r) => r.id);
}
