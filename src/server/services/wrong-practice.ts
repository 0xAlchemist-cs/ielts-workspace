/* ── V15.1 Wrong→Practice — turns one Error-Bank row into a two-stage
 *    retrieval session. Zero new engines: generation reuses the drills
 *    prompt (V13 gateway), grading/scheduling reuse submitRetentionReview
 *    (SM-2 + 7-state ladder + forgetting detection + retention takeover).
 *    This service only adds provenance (wrong_practice_log) and session
 *    guards; the original error row is NEVER modified. */

import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { errors as errorsT, retrievalItems, wrongPracticeLog, wrongPracticeSessions } from "@/db/schema";
import { getProvider } from "@/lib/ai";
import { mockDrills } from "@/lib/ai/mock-drills";
import type { DrillSet } from "@/lib/types";
import { ensureRetrievalItem } from "./retrieval";
import { submitRetentionReview } from "./retention";

export interface WrongPracticeStart {
  ok: true;
  sessionId: string;
  errorId: number;
  /** the mistake being practised (wrong form is the subject — fine to show) */
  wrongForm: string;
  category: string;
  why: { en: string; zh: string };
  recall: { context: string; scene: string };
  transfer: { context: string; scene: string };
  isMock: boolean;
}

export type WrongPracticeSubmitResult =
  | {
      ok: true;
      stage: "retrieval" | "transfer";
      result: "correct" | "partial" | "incorrect";
      quality: 0 | 3 | 5;
      verdict: string;
      /** revealed only after grading */
      targetAnswer: string;
      next: "transfer" | "done" | "review-queue";
    }
  | { ok: false; code: "NOT_FOUND" | "SESSION_NOT_ISSUED" | "SESSION_MISMATCH" | "DUPLICATE_STAGE" | "STAGE_ORDER" | "GRADING_FAILED"; message: string };

function describeSource(err: typeof errorsT.$inferSelect): { source: string; sourceQuestion: string | null; why: { en: string; zh: string } } {
  const qMatch = (err.explanation ?? "").match(/\bQ(\d{1,2})\b/);
  const sourceQuestion = qMatch ? `Q${qMatch[1]}` : null;
  if ((err.sourceModule ?? "").startsWith("ieltscb")) {
    return {
      source: "IELTSCB report",
      sourceQuestion,
      why: {
        en: `You missed this in your recent IELTS reading practice${sourceQuestion ? ` (${sourceQuestion})` : ""} — now check whether you can produce the correct form from memory, then use it in a new context.`,
        zh: `你在最近的雅思阅读练习里错过了它${sourceQuestion ? `（${sourceQuestion}）` : ""}——现在检验你能否凭记忆产出正确形式，再换一个语境用一次。`,
      },
    };
  }
  const n = err.occurrenceCount;
  return {
    source: "Error Bank",
    sourceQuestion,
    why: {
      en: `This mistake has come back ${n > 1 ? `${n} times` : "before"} — check whether you can produce the correct form from memory, then use it in a new context.`,
      zh: `这个错误已出现${n > 1 ? ` ${n} 次` : "过"}——检验你能否凭记忆产出正确形式，再换一个语境用一次。`,
    },
  };
}

/** Start a practice session: loads the error (user-scoped → exam isolation is
 *  automatic: a CET user can never address an IELTS user's error), generates
 *  two fresh contexts via the drills prompt, issues a session id. */
export async function startWrongPractice(userId: number, errorId: number): Promise<WrongPracticeStart | { ok: false; code: "NOT_FOUND"; message: string }> {
  const [err] = await db
    .select()
    .from(errorsT)
    .where(and(eq(errorsT.id, errorId), eq(errorsT.userId, userId)))
    .limit(1);
  if (!err) return { ok: false, code: "NOT_FOUND", message: "Error not found for this learner." };

  await ensureRetrievalItem(userId, "error", err.id);

  const input = {
    wrongForm: err.wrongForm,
    correctForm: err.correctForm,
    category: err.category,
    explanation: err.explanation ?? undefined,
  };
  const provider = await getProvider();
  const set: DrillSet = provider.drills ? await provider.drills(input) : mockDrills(input);
  const items = set.items.filter((d) => d.context && d.answer);
  if (items.length < 2) {
    const fallback = mockDrills(input);
    items.push(...fallback.items.slice(0, 2 - items.length));
  }

  const { why } = describeSource(err);
  // issue-then-use: persist the session so a later submission can prove the
  // id was really issued (to THIS learner, for THIS error); sweep this
  // learner's stale sessions (>24h) while we're here
  const sessionId = randomUUID();
  await db
    .delete(wrongPracticeSessions)
    .where(and(
      eq(wrongPracticeSessions.userId, userId),
      lt(wrongPracticeSessions.createdAt, Date.now() - 24 * 3_600_000),
    ));
  await db.insert(wrongPracticeSessions).values({ sessionId, userId, errorId: err.id });
  return {
    ok: true,
    sessionId,
    errorId: err.id,
    wrongForm: err.wrongForm,
    category: err.category,
    why,
    recall: { context: items[0].context, scene: items[0].scene },
    transfer: { context: items[1].context, scene: items[1].scene },
    isMock: set.isMock === true,
  };
}

/** Submit one stage. Guards: no duplicate stage per session; transfer only
 *  after a successful recall. Grading and every state transition live in the
 *  existing retention engine — seeing the answer is never a success. */
export async function submitWrongPractice(
  userId: number,
  sessionId: string,
  errorId: number,
  stage: "retrieval" | "transfer",
  response: string,
): Promise<WrongPracticeSubmitResult> {
  const [err] = await db
    .select()
    .from(errorsT)
    .where(and(eq(errorsT.id, errorId), eq(errorsT.userId, userId)))
    .limit(1);
  if (!err) return { ok: false, code: "NOT_FOUND", message: "Error not found for this learner." };

  // issuance proof (hardening): the session id must be one the server issued
  // to THIS learner for THIS error — a fabricated id (or one borrowed from a
  // different mistake's session) can no longer fabricate practice evidence
  const [issued] = await db
    .select()
    .from(wrongPracticeSessions)
    .where(and(eq(wrongPracticeSessions.sessionId, sessionId), eq(wrongPracticeSessions.userId, userId)))
    .limit(1);
  if (!issued) return { ok: false, code: "SESSION_NOT_ISSUED", message: "Unknown practice session — start a new one." };
  if (issued.errorId !== errorId) return { ok: false, code: "SESSION_MISMATCH", message: "This session belongs to a different mistake." };

  // duplicate-stage guard — one attempt per stage per session
  const [dupe] = await db
    .select({ id: wrongPracticeLog.id })
    .from(wrongPracticeLog)
    .where(and(eq(wrongPracticeLog.sessionId, sessionId), eq(wrongPracticeLog.practiceType, stage)))
    .limit(1);
  if (dupe) return { ok: false, code: "DUPLICATE_STAGE", message: "This stage was already submitted in this session." };

  // stage order: transfer requires a prior successful recall in this session
  if (stage === "transfer") {
    const [recall] = await db
      .select({ result: wrongPracticeLog.result })
      .from(wrongPracticeLog)
      .where(and(eq(wrongPracticeLog.sessionId, sessionId), eq(wrongPracticeLog.practiceType, "retrieval")))
      .limit(1);
    if (!recall || recall.result === "incorrect") {
      return { ok: false, code: "STAGE_ORDER", message: "Recall must succeed in this session before transfer." };
    }
  }

  const [item] = await db
    .select()
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, errorId)))
    .limit(1);
  if (!item) return { ok: false, code: "NOT_FOUND", message: "No retrieval item for this error." };

  const mode = stage === "retrieval" ? "production" : "context_transfer";
  const graded = await submitRetentionReview(userId, item.id, mode, response, "review");
  if (!graded) return { ok: false, code: "GRADING_FAILED", message: "Grading failed." };

  const result = graded.quality === 5 ? "correct" : graded.quality >= 3 ? "partial" : "incorrect";
  const { source, sourceQuestion } = describeSource(err);
  await db.insert(wrongPracticeLog).values({
    userId,
    sessionId,
    errorId,
    source,
    sourceQuestion,
    practiceType: stage,
    result,
    quality: graded.quality,
  });

  return {
    ok: true,
    stage,
    result,
    quality: graded.quality,
    verdict: graded.verdict,
    targetAnswer: graded.targetAnswer,
    next: stage === "retrieval" ? (graded.quality >= 3 ? "transfer" : "review-queue") : "done",
  };
}
