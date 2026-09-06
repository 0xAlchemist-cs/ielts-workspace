import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dailyMissions,
  errors,
  reviewHistory,
  retrievalItems,
  speakingAttempts,
  userProgress,
  vocabularies,
  writingAttempts,
  chunks as chunksT,
} from "@/db/schema";
import { todayKey } from "@/lib/text";
import type { MissionCounters } from "@/lib/types";

export type FunnelEvent = keyof MissionCounters;

const ZERO: MissionCounters = { exposure: 0, understood: 0, retrieved: 0, used: 0, retained: 0 };

/** Record real learning events into today's mission counters + progress row. */
export async function recordEvent(
  userId: number,
  event: FunnelEvent,
  n = 1,
): Promise<void> {
  const date = todayKey();

  // progress row — read-modify-write (single user, no concurrency to worry about)
  const [existing] = await db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.date, date)))
    .limit(1);
  if (existing) {
    const metrics = { ...(existing.metrics as Record<string, number>) };
    metrics[event] = (metrics[event] ?? 0) + n;
    await db.update(userProgress).set({ metrics }).where(eq(userProgress.id, existing.id));
  } else {
    await db
      .insert(userProgress)
      .values({ userId, date, metrics: { [event]: n } })
      .onConflictDoNothing();
  }

  // today's mission counters
  const [mission] = await db
    .select()
    .from(dailyMissions)
    .where(and(eq(dailyMissions.userId, userId), eq(dailyMissions.date, date)))
    .limit(1);
  if (mission) {
    const counters = { ...ZERO, ...mission.counters };
    counters[event] += n;
    await db.update(dailyMissions).set({ counters }).where(eq(dailyMissions.id, mission.id));
  }
}

export async function getTodayFunnel(userId: number): Promise<MissionCounters> {
  const date = todayKey();
  const [row] = await db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.date, date)))
    .limit(1);
  return { ...ZERO, ...(row?.metrics as Partial<MissionCounters>) };
}

export interface DashboardStats {
  activeVocabulary: number;
  passiveVocabulary: number;
  activeChunks: number;
  retrievalAccuracy: number; // % over last 30 days
  averageStrength: number; // avg chunk retrieval strength
  speakingBands: number[]; // recent overall estimates
  ieltsEstimated: number | null;
  weakestLink: { area: string; detail: string; count: number };
  daysStudied: number;
  dueNow: number;
}

export async function getDashboardStats(
  userId: number,
  profileIelts: number | null,
): Promise<DashboardStats> {
  const month = Date.now() - 30 * 86_400_000;

  const [activeV] = await db
    .select({ c: sql<number>`count(*)` })
    .from(vocabularies)
    .where(and(eq(vocabularies.userId, userId), eq(vocabularies.status, "active")));
  const [passiveV] = await db
    .select({ c: sql<number>`count(*)` })
    .from(vocabularies)
    .where(and(eq(vocabularies.userId, userId), eq(vocabularies.status, "passive")));
  const [chunkCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(chunksT)
    .where(and(eq(chunksT.userId, userId), isNotNull(chunksT.activatedAt)));

  const [hist] = await db
    .select({
      total: sql<number>`count(*)`,
      correct: sql<number>`sum(case when ${reviewHistory.correct} = 1 then 1 else 0 end)`,
    })
    .from(reviewHistory)
    .where(and(eq(reviewHistory.userId, userId), gte(reviewHistory.createdAt, month)));

  const speaking = await db
    .select({ ieltsScores: speakingAttempts.ieltsScores })
    .from(speakingAttempts)
    .where(eq(speakingAttempts.userId, userId))
    .orderBy(desc(speakingAttempts.createdAt))
    .limit(5);

  const errRows = await db
    .select({ category: errors.category, c: sql<number>`count(*)` })
    .from(errors)
    .where(and(eq(errors.userId, userId), eq(errors.status, "active")))
    .groupBy(errors.category)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  // ── Weakest Link: multi-level drill-down from the full learning profile ──
  let weakest: DashboardStats["weakestLink"];
  try {
    const { computeFullProfile } = await import("@/server/services/learning-profile");
    const fullProfile = await computeFullProfile(userId);
    weakest = {
      area: `${fullProfile.weakestLink.skill} · ${fullProfile.weakestLink.subSkill}`,
      detail: fullProfile.weakestLink.evidence,
      count: fullProfile.errorPatterns.filter((p) => p.severity === "high").length,
    };
  } catch {
    // Fallback to simple error-based detection if profile computation fails
    const topErr = errRows[0];
    const listeningRows = await db
      .select({ category: sql<string>`category`, c: sql<number>`count(*)` })
      .from(sql`listening_misses`)
      .where(sql`user_id = ${userId}`)
      .groupBy(sql`category`)
      .orderBy(desc(sql`count(*)`))
      .limit(1);
    const lisTop = listeningRows[0] as { category: string; c: number } | undefined;
    if (lisTop && lisTop.c > 0) {
      weakest = { area: `listening · ${lisTop.category}`, detail: `diagnosed ${lisTop.c} times`, count: lisTop.c };
    } else if (topErr) {
      weakest = { area: topErr.category, detail: "Your most frequent active error category", count: topErr.c };
    } else {
      weakest = { area: "listening", detail: "Connected speech — words you know but can't hear", count: 0 };
    }
  }

  const [daysRow] = await db
    .select({ c: sql<number>`count(distinct ${userProgress.date})` })
    .from(userProgress)
    .where(eq(userProgress.userId, userId));

  const [dueRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), sql`${retrievalItems.dueAt} <= ${Date.now()}`));

  const [avgStrengthRow] = await db
    .select({ avg: sql<number>`coalesce(avg(${chunksT.retrievalStrength}), 0)` })
    .from(chunksT)
    .where(eq(chunksT.userId, userId));

  const speakingBands = speaking
    .map((s) => s.ieltsScores as { overall?: number } | null)
    .map((s) => s?.overall ?? null)
    .filter((n): n is number => n != null);

  return {
    activeVocabulary: activeV?.c ?? 0,
    passiveVocabulary: passiveV?.c ?? 0,
    activeChunks: chunkCount?.c ?? 0,
    retrievalAccuracy: hist?.total ? Math.round(((hist.correct ?? 0) / hist.total) * 100) : 0,
    averageStrength: Math.round(avgStrengthRow?.avg ?? 0),
    speakingBands,
    ieltsEstimated: profileIelts,
    weakestLink: weakest,
    daysStudied: daysRow?.c ?? 0,
    dueNow: dueRow?.c ?? 0,
  };
}

export interface NorthStar {
  produced: number; // chunks successfully produced from memory this week
  reused: number; // chunks used in speaking/writing this week
  both: number; // produced AND reused — the North Star
}

/** North Star: expressions produced from memory AND reused in output, per rolling week. */
export async function getWeeklyNorthStar(userId: number): Promise<NorthStar> {
  const week = Date.now() - 7 * 86_400_000;

  const producedRows = await db
    .select({ itemId: retrievalItems.itemId })
    .from(reviewHistory)
    .innerJoin(retrievalItems, eq(retrievalItems.id, reviewHistory.retrievalItemId))
    .where(
      and(
        eq(reviewHistory.userId, userId),
        gte(reviewHistory.createdAt, week),
        gte(reviewHistory.quality, 3),
        eq(retrievalItems.itemType, "chunk"),
      ),
    );
  const produced = new Set(producedRows.map((r) => r.itemId));

  const attempts = await db
    .select({ used: speakingAttempts.usedChunkIds })
    .from(speakingAttempts)
    .where(and(eq(speakingAttempts.userId, userId), gte(speakingAttempts.createdAt, week)));
  const essays = await db
    .select({ used: writingAttempts.usedChunkIds })
    .from(writingAttempts)
    .where(and(eq(writingAttempts.userId, userId), gte(writingAttempts.createdAt, week)));
  const reused = new Set<number>();
  for (const a of [...attempts, ...essays]) for (const id of a.used ?? []) reused.add(id);

  let both = 0;
  for (const id of produced) if (reused.has(id)) both++;
  return { produced: produced.size, reused: reused.size, both };
}

/** Tomorrow's scheduled returns — the anticipation beat. */
export async function getTomorrowPreview(userId: number): Promise<{ count: number; texts: string[] }> {
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const from = t0.getTime() + 86_400_000;
  const to = from + 86_400_000;

  const [countRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), gte(retrievalItems.dueAt, from), lte(retrievalItems.dueAt, to)));

  const rows = await db
    .select({ text: chunksT.text })
    .from(retrievalItems)
    .innerJoin(chunksT, and(eq(retrievalItems.itemType, "chunk"), eq(chunksT.id, retrievalItems.itemId)))
    .where(and(eq(retrievalItems.userId, userId), gte(retrievalItems.dueAt, from), lte(retrievalItems.dueAt, to)))
    .limit(4);

  return { count: countRow?.c ?? 0, texts: rows.map((r) => r.text) };
}

/** Last 14 days: daily produced count (quality ≥ 3) and accuracy. */
export async function getTrend14(userId: number): Promise<{ days: string[]; produced: number[]; accuracy: number[] }> {
  const from = Date.now() - 13 * 86_400_000;
  const rows = await db
    .select({
      createdAt: reviewHistory.createdAt,
      correct: reviewHistory.correct,
    })
    .from(reviewHistory)
    .where(and(eq(reviewHistory.userId, userId), gte(reviewHistory.createdAt, from)));

  const produced = Array.from({ length: 14 }, () => 0);
  const hits = Array.from({ length: 14 }, () => 0);
  const totals = Array.from({ length: 14 }, () => 0);
  const days: string[] = [];
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(t0.getTime() - i * 86_400_000);
    days.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  for (const r of rows) {
    const idx = 13 - Math.floor((Date.now() - r.createdAt) / 86_400_000);
    if (idx < 0 || idx > 13) continue;
    totals[idx]++;
    if (r.correct) {
      hits[idx]++;
      produced[idx]++;
    }
  }
  const accuracy = totals.map((t, i) => (t ? Math.round((hits[i] / t) * 100) : 0));
  return { days, produced, accuracy };
}
export async function getReturningToday(userId: number): Promise<string[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const endOfToday = todayStart.getTime() + 86_400_000;

  const rows = await db
    .select({ text: chunksT.text, created: chunksT.createdAt })
    .from(retrievalItems)
    .innerJoin(chunksT, and(eq(retrievalItems.itemType, "chunk"), eq(chunksT.id, retrievalItems.itemId)))
    .where(and(eq(retrievalItems.userId, userId), lte(retrievalItems.dueAt, endOfToday)));

  return rows
    .filter((r) => r.created !== null && r.created < todayStart.getTime())
    .map((r) => r.text)
    .slice(0, 4);
}
