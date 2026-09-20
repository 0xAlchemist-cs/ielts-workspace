import { and, desc, eq, lte, sql, gte } from "drizzle-orm";
import { db } from "@/db";
import { retrievalItems, reviewHistory, chunks, errors, vocabularies, wrongPracticeLog } from "@/db/schema";
import { holisticStrength } from "@/lib/retrieval-engine";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { recordEvent } from "@/server/services/progress";
import { plural } from "@/lib/plural";
import { logChunkEvent, markChunkActivated } from "@/server/services/events";
import { gradeRetrieval } from "@/lib/grading";
import type { GradeTarget } from "@/lib/grading";
import type { ReviewMode, ModuleContext, ItemLearningState } from "@/lib/types";
import { advanceState, decideFormat } from "@/lib/retrieval-engine";
import { addError } from "@/server/services/bank";
import type { ErrorCategory } from "@/lib/types";

const DAY = 86_400_000;

/* ── Review & Retention Engine ─────────────────────────────────────────────
 * The long-term memory layer. Computes retention independently from strength,
 * schedules retention checks at increasing intervals, detects forgetting,
 * and generates the daily review queue with anti-pattern-matching. */

/** ── Retention Score computation ──────────────────────────────────────────
 * Retention ≠ Strength. Strength = current ability; Retention = how well
 * the item survives time without practice. */
export function computeRetention(input: {
  lastSuccessAt: number | null;
  totalAttempts: number;
  totalSuccesses: number;
  crossContextSuccess: number;
  delayedRecallSuccess: number;
  forgettingDetected: boolean;
}): number {
  const { lastSuccessAt, totalAttempts, totalSuccesses, crossContextSuccess, delayedRecallSuccess, forgettingDetected } = input;

  if (totalAttempts === 0) return 0;

  // 1. Historical success rate (0-40 pts)
  const successRate = totalSuccesses / totalAttempts;
  const histScore = successRate * 40;

  // 2. Time decay since last success (0-25 pts, decays over 30 days)
  let timeScore = 0;
  if (lastSuccessAt) {
    const daysSince = (Date.now() - lastSuccessAt) / DAY;
    timeScore = Math.max(0, 25 - (daysSince / 30) * 25);
  }

  // 3. Cross-context success (0-20 pts, 5 per cross-module retrieval)
  const contextScore = Math.min(20, crossContextSuccess * 5);

  // 4. Delayed recall (0-15 pts, 5 per ≥7-day gap success)
  const delayedScore = Math.min(15, delayedRecallSuccess * 5);

  let score = Math.round(histScore + timeScore + contextScore + delayedScore);

  // 5. Forgetting penalty
  if (forgettingDetected) score = Math.round(score * 0.5);

  return Math.max(0, Math.min(100, score));
}

/** ── Retention check scheduling ───────────────────────────────────────────
 * Items at retention state get checked at 7 → 30 → 90 day intervals. */
export function nextRetentionCheckDue(item: {
  learningState: ItemLearningState | null;
  lastRetentionCheckAt: number | null;
  retentionCheckInterval: number;
}): number | null {
  if (!item.learningState?.state || item.learningState.state !== "retention") return null;
  if (!item.lastRetentionCheckAt) return Date.now(); // never checked → due now
  return item.lastRetentionCheckAt + item.retentionCheckInterval * DAY;
}

/** Determine retention check interval escalation: 7 → 30 → 90. */
export function nextCheckInterval(current: number): number {
  if (current < 10) return 30;
  if (current < 35) return 90;
  return 90; // cap at 90
}

/** ── Forgetting detection ─────────────────────────────────────────────────
 * Was previously successful, hasn't been used recently, now failed. */
export function detectForgetting(item: {
  successCount: number;
  failCount: number;
  lastQuality: number | null;
  learningState: ItemLearningState | null;
}): boolean {
  if (item.successCount < 2) return false; // not enough history
  if (item.lastQuality === 0) {
    const ls = item.learningState;
    if (!ls) return true;
    // If the item was at retrieval/usage/transfer/retention and now fails → forgetting
    return ["retrieval", "usage", "transfer", "retention"].includes(ls.state);
  }
  return false;
}

/** ── Review Queue generation with priority scoring ─────────────────────── */
export interface ReviewQueueEntry {
  retrievalItemId: number;
  itemType: string;
  mode: ReviewMode;
  prompt: string;
  expected: string;
  display: { title: string; meaningEn?: string };
  options?: string[];
  clozePrompt?: string;
  clozeAudio?: string;
  teach?: { pattern?: string; meaningZh?: string; examples?: string[]; explanation?: string };
  /** V15.1: for error items — the underlying errors.id (deep link to /practice) */
  sourceId?: number;
  /** priority metadata */
  priority: number; // 0-100, higher = more urgent
  category: "overdue" | "weak_retrieval" | "recurring_error" | "retention_check" | "new_item" | "at_risk";
  reasonDetail: string;
  /** V15.2: every signal that made this item review-worthy — ONE item, MANY
   *  reasons; the primary category above stays for display compatibility. */
  reasons: string[];
}

interface PriorityInput {
  overdueDays: number;
  failRate: number;
  retentionScore: number;
  importance: number; // IELTS relevance 1-5
  crossModule: boolean;
  forgettingDetected: boolean;
}

export function computeReviewPriority(input: PriorityInput): number {
  let score = 0;

  // Overdue urgency (0-35)
  score += Math.min(35, input.overdueDays * 7);

  // Failure risk (0-25)
  score += Math.min(25, input.failRate * 50);

  // Low retention = high risk (0-20, inverse)
  score += Math.max(0, 20 - (input.retentionScore / 100) * 20);

  // IELTS importance (0-10)
  score += input.importance * 2;

  // Cross-module items are more valuable to review (0-5)
  if (input.crossModule) score += 5;

  // Forgetting detected → urgent (0-5)
  if (input.forgettingDetected) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** ── Anti-Pattern Matching: rotate formats for repeated items ───────────── */
const FORMAT_ROTATION: Record<string, ReviewMode[]> = {
  chunk: ["production", "cloze", "context_transfer", "audio_retrieval", "production", "cloze"],
  vocab: ["recognition", "cued_recall", "production", "cued_recall", "production"],
  grammar: ["cued_recall", "production", "cloze", "production"],
  sentence_pattern: ["cued_recall", "production", "cloze", "context_transfer"],
  spoken_pattern: ["cued_recall", "production", "audio_retrieval", "context_transfer"],
  error: ["production", "production", "cloze"], // errors always need production
};

export function antiPatternMode(itemType: string, attemptCount: number, baseMode: ReviewMode): ReviewMode {
  const rotation = FORMAT_ROTATION[itemType] ?? FORMAT_ROTATION.chunk;
  const mode = rotation[attemptCount % rotation.length];
  // For retention state, allow the full rotation
  return mode ?? baseMode;
}

/** ── Generate the full review queue ─────────────────────────────────────── */
export async function generateReviewQueue(
  userId: number,
  limit: number,
  filter?: "all" | "errors" | "retention",
): Promise<ReviewQueueEntry[]> {
  const now = Date.now();

  // Fetch all items
  const items = await db.select().from(retrievalItems).where(eq(retrievalItems.userId, userId));

  // V15.2: wrong→practice failures in the last 3 days tag their error items
  // with a wrong_practice reason — a SOURCE, never a second queue (SM-2 already
  // rescheduled the item itself on failure)
  const recentWrongPractice = new Set(
    (await db
      .select({ errorId: wrongPracticeLog.errorId })
      .from(wrongPracticeLog)
      .where(and(
        eq(wrongPracticeLog.userId, userId),
        eq(wrongPracticeLog.result, "incorrect"),
        gte(wrongPracticeLog.createdAt, now - 3 * DAY),
      )))
      .map((r) => r.errorId),
  );

  // Categorize each item
  const entries: { item: typeof items[0]; priority: number; category: ReviewQueueEntry["category"]; reasonDetail: string; mode: ReviewMode; reasons: string[] }[] = [];

  for (const item of items) {
    const ls = item.learningState;
    const retentionDue = nextRetentionCheckDue(item);
    const isOverdue = item.dueAt <= now;
    const overdueDays = isOverdue ? Math.floor((now - item.dueAt) / DAY) : 0;
    const totalAttempts = item.successCount + item.failCount;
    const failRate = totalAttempts ? item.failCount / totalAttempts : 0;
    const forgetting = detectForgetting(item);

    // Skip items not yet due (with 1-day grace for "almost due")
    const isAlmostDue = item.dueAt <= now + DAY;
    if (!isOverdue && !isAlmostDue && !retentionDue && filter !== "all") continue;
    if (!isOverdue && !isAlmostDue && !retentionDue && item.successCount + item.failCount > 0) continue;

    // Category
    let category: ReviewQueueEntry["category"] = "new_item";
    let reasonDetail = "";

    if (filter === "retention" && !retentionDue) continue;
    if (filter === "errors" && item.itemType !== "error") continue;

    // V15.2: collect EVERY signal — one item, many reasons. The first match
    // below stays the primary category for display compatibility.
    const reasons: string[] = [];
    if (isOverdue && overdueDays >= 1) reasons.push("overdue");
    if (isAlmostDue && !isOverdue) reasons.push("almost_due");
    if (failRate > 0.4 && totalAttempts >= 3) reasons.push("weak_retrieval");
    if (item.itemType === "error" && item.failCount >= 1) reasons.push("recurring_error");
    if (forgetting) reasons.push("forgettingDetected");
    if (retentionDue) reasons.push("retention_check");
    if (item.itemType === "error" && recentWrongPractice.has(item.itemId)) reasons.push("wrong_practice");

    if (retentionDue) {
      category = "retention_check";
      reasonDetail = `Retention check due (${item.retentionCheckInterval}-day interval). Last checked: ${item.lastRetentionCheckAt ? new Date(item.lastRetentionCheckAt).toLocaleDateString() : "never"}.`;
    } else if (forgetting) {
      category = "at_risk";
      reasonDetail = "Forgetting detected: previously successful, now failing.";
    } else if (item.itemType === "error" && item.failCount >= 1) {
      category = "recurring_error";
      reasonDetail = `Error with ${plural(item.failCount, "retrieval failure")}`;
    } else if (isOverdue && overdueDays >= 1) {
      category = "overdue";
      reasonDetail = `${overdueDays} day${overdueDays > 1 ? "s" : ""} overdue for spaced review.`;
    } else if (failRate > 0.4 && totalAttempts >= 3) {
      category = "weak_retrieval";
      reasonDetail = `High failure rate (${Math.round(failRate * 100)}%) across ${plural(totalAttempts, "attempt")}.`;
    } else if (isAlmostDue) {
      category = "overdue";
      reasonDetail = "Due within 24 hours.";
    }

    // Compute priority
    const crossModule = (ls?.contexts?.length ?? 0) >= 2;
    const priority = computeReviewPriority({
      overdueDays,
      failRate,
      retentionScore: item.retentionScore,
      importance: 3, // default; could be per-item IELTS relevance
      crossModule,
      forgettingDetected: forgetting,
    });

    // Determine mode via anti-pattern matching
    const format = decideFormat(item.itemType as "chunk", ls ?? {
      state: "exposure", achievedAt: {}, contexts: [],
      productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
    });
    const mode = category === "retention_check"
      ? "retention_check"
      : antiPatternMode(item.itemType, totalAttempts, format.mode);

    entries.push({ item, priority, category, reasonDetail, mode, reasons });
  }

  // Sort by priority (descending)
  entries.sort((a, b) => b.priority - a.priority);
  // buildEntry drops items whose source row was deleted (historical orphans
  // can dominate the top of the priority order) — over-fetch and fill so the
  // learner always gets their real quota of reviews (V10 P25)
  const top = entries.slice(0, limit * 3);

  // Build queue entries with prompts
  const queue: ReviewQueueEntry[] = [];
  for (const e of top) {
    if (queue.length >= limit) break;
    const qi = await buildEntry(e.item, e.mode, e.category, e.priority, e.reasonDetail, e.reasons);
    if (qi) queue.push(qi);
  }
  return queue;
}

async function buildEntry(
  item: typeof retrievalItems.$inferSelect,
  mode: ReviewMode,
  category: ReviewQueueEntry["category"],
  priority: number,
  reasonDetail: string,
  reasons: string[],
): Promise<ReviewQueueEntry | null> {
  if (item.itemType === "chunk") {
    const rows = await db.select().from(chunks).where(eq(chunks.id, item.itemId)).limit(1);
    if (!rows.length) return null;
    const c = rows[0];
    const model = c.examples[0];
    let clozePrompt: string | undefined;
    if (model && CHUNK_DETECT[c.text]?.test(model)) {
      clozePrompt = model.replace(CHUNK_DETECT[c.text], "＿＿＿");
    }
    return {
      retrievalItemId: item.id, itemType: "chunk", mode,
      prompt: mode === "cloze" ? (clozePrompt ?? (c.meaningZh || c.meaningEn)) : (c.meaningZh || c.meaningEn),
      expected: c.text,
      display: { title: c.text, meaningEn: c.meaningEn },
      teach: { pattern: c.pattern, meaningZh: c.meaningZh, examples: c.examples },
      priority, category, reasonDetail, reasons,
      ...(clozePrompt && (mode === "cloze" || mode === "context_transfer") ? { clozePrompt, clozeAudio: model } : {}),
    };
  }
  if (item.itemType === "vocab") {
    const rows = await db.select().from(vocabularies).where(eq(vocabularies.id, item.itemId)).limit(1);
    if (!rows.length) return null;
    const v = rows[0];
    const reviews = item.successCount + item.failCount;
    if (reviews < 2 && mode === "recognition") {
      let distractors = await db
        .select({ h: vocabularies.headword }).from(vocabularies)
        .where(and(eq(vocabularies.userId, item.userId), sql`${vocabularies.headword} != ${v.headword}`))
        .orderBy(sql`random()`).limit(3);
      if (distractors.length < 3) {
        const corpus = await db
          .select({ h: vocabularies.headword }).from(vocabularies)
          .where(sql`${vocabularies.userId} IS NULL AND ${vocabularies.headword} != ${v.headword}`)
          .orderBy(sql`random()`).limit(3 - distractors.length);
        distractors = [...distractors, ...corpus];
      }
      if (distractors.length >= 2) {
        const options = [v.headword, ...distractors.map((d) => d.h)];
        for (let i = options.length - 1; i > 0; i--) {
          const j = (item.id * 7 + i * 13) % (i + 1);
          [options[i], options[j]] = [options[j], options[i]];
        }
        return {
          retrievalItemId: item.id, itemType: "vocab", mode: "recognition",
          prompt: `${v.meaningEn || ""}${v.meaningZh ? ` · ${v.meaningZh}` : ""}`,
          expected: v.headword,
          display: { title: v.headword, meaningEn: v.meaningEn },
          options, priority, category, reasonDetail, reasons,
        };
      }
    }
    return {
      retrievalItemId: item.id, itemType: "vocab", mode: "cued_recall",
      prompt: `${v.meaningEn || ""}${v.meaningZh ? ` · ${v.meaningZh}` : ""} — starts with "${v.headword[0]}_"`,
      expected: v.headword,
      display: { title: v.headword, meaningEn: v.meaningEn },
      teach: { meaningZh: v.meaningZh, examples: v.exampleEn ? [v.exampleEn] : [] },
      priority, category, reasonDetail, reasons,
    };
  }
  if (item.itemType === "error") {
    const rows = await db.select().from(errors).where(eq(errors.id, item.itemId)).limit(1);
    if (!rows.length) return null;
    const e = rows[0];
    // V16 hardening (beta pilot P1/P2): a stored wrong→correct pair with NO
    // shared anchor word is a legacy corrupt row — serving it asks the learner
    // to "fix decoration into essential infrastructure". Skip such items
    // instead of quizzing nonsense; the row itself is left untouched.
    if (!errorPairCoherent(e.wrongForm, e.correctForm)) return null;
    return {
      retrievalItemId: item.id, itemType: "error", mode: "production",
      prompt: `Fix it — write a sentence using the CORRECT form of: ${e.wrongForm}`,
      expected: e.correctForm,
      display: { title: `${e.wrongForm} ✗ → ?`, meaningEn: e.explanation },
      teach: { explanation: e.explanation },
      /** V15.1: the underlying error id — powers the [重新练习] deep link */
      sourceId: item.itemId,
      priority, category, reasonDetail, reasons,
    };
  }
  return null;
}

/** A wrong→correct pair is coherent when it looks like a language correction:
 *  - rejected outright: exam answer-key leakage (wrongForm "Q3: E …") and
 *    list-dump correctForms (comma-separated 3+ items) — the corrupt legacy
 *    shapes found in the DB sweep;
 *  - single-word → single-word is always plausible (synonym swaps like
 *    "farming" → "agriculture" share no anchor word yet are real corrections);
 *  - otherwise the pair must share a word ≥3 chars (real corrections keep
 *    the anchor: "interested on" → "interested in"). */
function errorPairCoherent(wrongForm: string | null, correctForm: string | null): boolean {
  if (!wrongForm || !correctForm) return false;
  if (/^Q\s*\d+\s*[:.]/i.test(wrongForm)) return false;
  if (correctForm.split(",").length >= 3) return false;
  const words = (s: string) => (s.toLowerCase().match(/[a-z']{3,}/g) ?? []);
  const w = words(wrongForm);
  const c = words(correctForm);
  if (w.length === 0 || c.length === 0) return false;
  if (w.length === 1 && c.length === 1) return true; // synonym swap
  const cs = new Set(c);
  return w.some((t) => cs.has(t));
}

/** ── Submit a review with retention-aware processing ────────────────────── */
export async function submitRetentionReview(
  userId: number,
  retrievalItemId: number,
  mode: ReviewMode,
  response: string,
  context: ModuleContext = "review",
): Promise<{
  quality: 0 | 3 | 5;
  correct: boolean;
  verdict: string;
  targetAnswer: string;
  retentionScore: number;
  strength: number;
  category: string;
  isRetentionCheck: boolean;
  forgettingDetected: boolean;
} | null> {
  const rows = await db.select().from(retrievalItems)
    .where(and(eq(retrievalItems.id, retrievalItemId), eq(retrievalItems.userId, userId)))
    .limit(1);
  if (!rows.length) return null;
  const item = rows[0];

  // Build grading target
  let target: GradeTarget = { itemType: item.itemType as GradeTarget["itemType"] };
  if (item.itemType === "chunk") {
    const c = (await db.select().from(chunks).where(eq(chunks.id, item.itemId)).limit(1))[0];
    if (c) target = { itemType: "chunk", chunkText: c.text, pattern: c.pattern, examples: c.examples };
  } else if (item.itemType === "vocab") {
    const v = (await db.select().from(vocabularies).where(eq(vocabularies.id, item.itemId)).limit(1))[0];
    if (v) target = { itemType: "vocab", headword: v.headword, exactMatch: mode === "recognition" };
  } else if (item.itemType === "error") {
    const e = (await db.select().from(errors).where(eq(errors.id, item.itemId)).limit(1))[0];
    if (e) target = { itemType: "error", wrongForm: e.wrongForm, correctForm: e.correctForm };
  }

  const grade = gradeRetrieval(target, response);
  const now = Date.now();

  // SM-2 update
  let { easeFactor, intervalDays } = item;
  let successCount = item.successCount;
  let failCount = item.failCount;
  if (grade.quality >= 3) {
    const factor = mode === "production" || mode === "context_transfer" || mode === "retention_check" ? 1.2 : mode === "cued_recall" || mode === "cloze" ? 1.0 : 0.8;
    intervalDays = intervalDays === 0 ? 1 : Math.round(intervalDays * easeFactor * factor);
    easeFactor = Math.min(2.8, easeFactor + 0.1);
    successCount++;
  } else {
    intervalDays = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    failCount++;
  }

  // Learning state advancement
  const ls = item.learningState ?? {
    state: "exposure" as const, achievedAt: {}, contexts: [],
    productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
  };
  const format = decideFormat(item.itemType as "chunk", ls, context);
  const newLs = advanceState(ls, format, grade.quality, context);

  // ── Retention processing ────────────────────────────────────────────────
  const isRetentionCheck = mode === "retention_check";
  const wasSuccessfulBefore = item.successCount >= 1;
  const forgettingDetected = grade.quality === 0 && wasSuccessfulBefore &&
    ["retrieval", "usage", "transfer", "retention"].includes(ls.state);

  // Compute retention score
  const lastSuccessAt = grade.quality >= 3 ? now : ls.lastProductionAt ?? ls.lastContextualAt ?? null;
  const crossCtx = ls.contexts.length >= 2 ? (item.retentionScore >= 50 ? 1 : 0) + (ls.contexts.length - 1) : 0;
  const delayed = grade.quality >= 3 && isRetentionCheck ? 1 : 0;
  const retentionScore = computeRetention({
    lastSuccessAt,
    totalAttempts: successCount + failCount,
    totalSuccesses: successCount,
    crossContextSuccess: crossCtx,
    delayedRecallSuccess: delayed,
    forgettingDetected,
  });

  // Retention check interval escalation
  let checkInterval = item.retentionCheckInterval;
  let lastCheckAt = item.lastRetentionCheckAt;
  if (isRetentionCheck) {
    lastCheckAt = now;
    checkInterval = grade.quality >= 3 ? nextCheckInterval(checkInterval) : 7; // reset to 7 on failure
  }

  const strength = holisticStrength(newLs);

  // Persist
  await db.update(retrievalItems).set({
    easeFactor, intervalDays, dueAt: now + intervalDays * DAY,
    successCount, failCount, lastQuality: grade.quality,
    learningState: newLs,
    retentionScore,
    lastRetentionCheckAt: lastCheckAt,
    retentionCheckInterval: checkInterval,
    forgettingDetected: forgettingDetected ? 1 : 0,
  }).where(eq(retrievalItems.id, item.id));

  // Denormalize to entity
  if (item.itemType === "chunk") {
    await db.update(chunks).set({ retrievalStrength: strength, lastReviewAt: now }).where(eq(chunks.id, item.itemId));
    if (forgettingDetected) {
      await logChunkEvent(userId, item.itemId, "retrieval_attempt", "FORGETTING_DETECTED");
    }
    if (grade.quality === 5 && (mode === "production" || mode === "retention_check")) {
      await markChunkActivated(userId, item.itemId);
    }
  } else if (item.itemType === "vocab") {
    await db.update(vocabularies).set({ retrievalStrength: strength, lastReviewAt: now }).where(eq(vocabularies.id, item.itemId));
  }

  // Record history
  await db.insert(reviewHistory).values({
    retrievalItemId: item.id, userId, mode,
    prompt: item.itemType, expected: grade.targetAnswer,
    userResponse: response, correct: grade.correct ? 1 : 0, quality: grade.quality,
  });

  if (grade.quality >= 3) await recordEvent(userId, "retrieved");

  return {
    ...grade,
    retentionScore,
    strength,
    category: isRetentionCheck ? "retention_check" : "standard",
    isRetentionCheck,
    forgettingDetected,
  };
}

/** ── Review Balance: new learning vs review ratio ───────────────────────── */
export async function getReviewBalance(userId: number): Promise<{
  reviewRatio: number; // 0-1, how much of today's mission should be review
  overdueCount: number;
  atRiskCount: number;
  retentionDueCount: number;
  recommendation: string;
}> {
  const items = await db.select().from(retrievalItems).where(eq(retrievalItems.userId, userId));
  const now = Date.now();

  let overdue = 0;
  let atRisk = 0;
  let retentionDue = 0;
  let totalTracked = 0;

  for (const item of items) {
    totalTracked++;
    const isOverdue = item.dueAt <= now;
    const forgetting = item.forgettingDetected === 1;
    const retDue = nextRetentionCheckDue(item) !== null && nextRetentionCheckDue(item)! <= now;

    if (isOverdue) overdue++;
    if (forgetting) atRisk++;
    if (retDue) retentionDue++;
  }

  const totalUrgent = overdue + atRisk + retentionDue;

  // Dynamic balance: default 60/40 review/new
  // If few urgent items → shift toward new learning (40/60)
  // If many urgent items → shift toward review (80/20)
  let reviewRatio = 0.6;
  if (totalUrgent === 0) reviewRatio = 0.3;
  else if (totalUrgent <= 3) reviewRatio = 0.45;
  else if (totalUrgent <= 8) reviewRatio = 0.6;
  else if (totalUrgent <= 15) reviewRatio = 0.75;
  else reviewRatio = 0.85;

  const recommendation =
    totalUrgent === 0
      ? "No urgent reviews — prioritize new learning today."
      : totalUrgent <= 3
        ? "Light review load — balance with new content."
        : totalUrgent <= 8
          ? "Standard review load — maintain 60/40 balance."
          : totalUrgent <= 15
            ? "Heavy review backlog — increase review time today."
            : "Critical backlog — focus almost entirely on review today.";

  return { reviewRatio, overdueCount: overdue, atRiskCount: atRisk, retentionDueCount: retentionDue, recommendation };
}
