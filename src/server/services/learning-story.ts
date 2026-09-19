/* ── V15.3 Learning Story — read-only presentation aggregation for /progress.
 *    NO new engine, score, trend or queue: every field is a real event or a
 *    fact derived by existing services (learning-memory, retention, bank).
 *    The page answers: what happened lately, what is strengthening, what
 *    keeps going wrong, what happens next. */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  chunkEvents, chunks as chunksT, contentHistory, errors as errorsT,
  ieltsAttempts, ieltsTasks, reviewHistory, retrievalItems, wrongPracticeLog,
} from "@/db/schema";
import { buildLearningMemory, type Insight, type StrengthenedItem } from "./learning-memory";
import { generateReviewQueue, getReviewBalance } from "./retention";

export interface StoryEvent {
  at: number;
  /** human line: what happened */
  en: string;
  zh: string;
  module: "reading" | "listening" | "review" | "practice" | "writing" | "exam";
  /** rough item label when one exists ("farming → agriculture") */
  item?: string;
}

export interface StoryProblem {
  errorId: number;
  wrongForm: string;
  correctForm: string;
  explanation: string | null;
  occurrenceCount: number;
  lastSeenAt: number | null;
  /** last targeted practice result, if any (wrong→practice log) */
  lastPractice: { result: string; at: number } | null;
  /** the item's retrieval id when it sits in the canonical queue */
  queued: boolean;
}

export interface StoryNext {
  count: number;
  estMinutes: number;
  overdueCount: number;
  atRiskCount: number;
  composition: Record<string, number>;
}

export interface LearningStory {
  recent: StoryEvent[];
  strengthening: { facts: StrengthenedItem[]; improvements: Insight[] };
  problems: StoryProblem[];
  next: StoryNext;
}

const DAY = 86_400_000;

export async function buildLearningStory(userId: number): Promise<LearningStory> {
  const since = Date.now() - 14 * DAY;

  /* ── 1 · recent — real events only, one human line each ─────────────── */
  const [hist, evts, practices, attempts, reads] = await Promise.all([
    db.select().from(reviewHistory).where(and(eq(reviewHistory.userId, userId), gte(reviewHistory.createdAt, since))).orderBy(desc(reviewHistory.createdAt)).limit(30),
    db.select().from(chunkEvents).where(and(eq(chunkEvents.userId, userId), gte(chunkEvents.createdAt, since))).orderBy(desc(chunkEvents.createdAt)).limit(30),
    db.select().from(wrongPracticeLog).where(eq(wrongPracticeLog.userId, userId)).orderBy(desc(wrongPracticeLog.createdAt)).limit(10),
    db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, userId)).orderBy(desc(ieltsAttempts.createdAt)).limit(5),
    db.select().from(contentHistory).where(and(eq(contentHistory.userId, userId), gte(contentHistory.lastUsedAt, since))).orderBy(desc(contentHistory.lastUsedAt)).limit(8),
  ]);

  // chunk labels for the event lines
  const chunkIds = [...new Set(evts.map((e) => e.chunkId))];
  const chunkLabels = new Map(
    chunkIds.length
      ? (await db.select({ id: chunksT.id, text: chunksT.text }).from(chunksT).where(gte(chunksT.id, Math.min(...chunkIds)))).map((c) => [c.id, c.text])
      : [],
  );

  const events: StoryEvent[] = [];

  for (const h of hist.slice(0, 6)) {
    events.push({
      at: h.createdAt,
      en: h.quality >= 3 ? "Retrieval practice — recalled from memory" : "Retrieval practice — missed this time",
      zh: h.quality >= 3 ? "提取练习——凭记忆答对" : "提取练习——这次没答对",
      module: "review",
      item: h.expected || undefined,
    });
  }
  for (const e of evts) {
    if (!["ielts_use", "context_transfer", "generation"].includes(e.type)) continue;
    const label = chunkLabels.get(e.chunkId);
    events.push({
      at: e.createdAt,
      en: e.type === "ielts_use" ? "Used an expression in exam practice" : e.type === "context_transfer" ? "Used an expression in a new context" : "Wrote your own sentence with an expression",
      zh: e.type === "ielts_use" ? "在考试练习中用了一个表达" : e.type === "context_transfer" ? "在新语境中用了一个表达" : "用表达造了自己的句子",
      module: e.type === "ielts_use" ? "exam" : "practice",
      item: label,
    });
  }
  for (const p of practices) {
    events.push({
      at: p.createdAt,
      en: p.practiceType === "retrieval" ? "Mistake practice — recall" : "Mistake practice — new context",
      zh: p.practiceType === "retrieval" ? "错题练习——回忆" : "错题练习——新语境",
      module: "practice",
      item: p.sourceQuestion ? `${p.sourceQuestion} · targeted practice` : undefined,
    });
  }
  for (const a of attempts) {
    const [t] = await db.select({ prompt: ieltsTasks.prompt }).from(ieltsTasks).where(eq(ieltsTasks.id, a.taskId)).limit(1);
    const title = t?.prompt?.match(/"([^"]+)"/)?.[1];
    events.push({
      at: a.createdAt,
      en: title ? `Reading practice — ${title}` : "Reading practice",
      zh: title ? `阅读练习——${title}` : "阅读练习",
      module: "exam",
    });
  }
  for (const r of reads) {
    events.push({
      at: r.lastUsedAt,
      en: r.skill === "listening" ? "Listened to a material" : "Read a material",
      zh: r.skill === "listening" ? "听了一段材料" : "读了一篇材料",
      module: r.skill === "listening" ? "listening" : "reading",
    });
  }

  events.sort((a, b) => b.at - a.at);
  const recent = events.slice(0, 9);

  /* ── 2 · strengthening — facts from learning memory (threshold-enforced,
   *      never invented) ───────────────────────────────────────────────── */
  const memory = await buildLearningMemory(userId);
  const strengthening = { facts: memory.recentlyStrengthened, improvements: memory.improvements };

  /* ── 3 · problems — the real Error Bank + queue membership ──────────── */
  const errorRows = await db.select().from(errorsT)
    .where(and(eq(errorsT.userId, userId), gte(errorsT.lastSeenAt, Date.now() - 30 * DAY)))
    .orderBy(desc(errorsT.lastSeenAt)).limit(8);
  // newest practice per error wins (list is desc — first occurrence per key)
  const practiceByError = new Map<number, (typeof practices)[number]>();
  for (const p of practices) if (!practiceByError.has(p.errorId)) practiceByError.set(p.errorId, p);
  const queue = await generateReviewQueue(userId, 10);
  const queuedErrorIds = new Set(
    queue.filter((q) => q.itemType === "error" && q.sourceId != null).map((q) => q.sourceId as number),
  );
  const problems: StoryProblem[] = errorRows.map((e) => ({
    errorId: e.id,
    wrongForm: e.wrongForm,
    correctForm: e.correctForm,
    explanation: e.explanation ?? null,
    occurrenceCount: e.occurrenceCount,
    lastSeenAt: e.lastSeenAt ?? null,
    lastPractice: practiceByError.has(e.id)
      ? { result: practiceByError.get(e.id)!.result, at: practiceByError.get(e.id)!.createdAt }
      : null,
    queued: queuedErrorIds.has(e.id),
  }));

  /* ── 4 · next — the canonical queue, nothing else decides. Same slice as
   *    the /review page's first session (standard, 10) so Today/Review/
   *    Progress quote IDENTICAL numbers — never a second recommendation. */
  const balance = await getReviewBalance(userId);
  const composition: Record<string, number> = {};
  for (const q of queue) composition[q.category] = (composition[q.category] ?? 0) + 1;
  const next: StoryNext = {
    count: queue.length,
    estMinutes: Math.round(queue.length * 1.2),
    overdueCount: balance.overdueCount,
    atRiskCount: balance.atRiskCount,
    composition,
  };

  return { recent, strengthening, problems, next };
}
