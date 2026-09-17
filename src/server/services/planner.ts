import { and, eq, lte, sql, gte } from "drizzle-orm";
import { db } from "@/db";
import { learningProfiles, retrievalItems, reviewHistory } from "@/db/schema";

/* ── V10 Adaptive Planner — one quiet layer above the existing engines ──────
 * It does NOT schedule anything itself: intervals stay in the SM-2/retention
 * engines, priorities in the priority engine, content choice in rotation.
 * The planner reads memory pressure + the time budget and decides HOW MUCH of
 * each the learner should do today, and what tomorrow looks like in two
 * deterministic scenarios. Pure functions first — everything testable without
 * a clock or a database. */

const DAY = 86_400_000;

export interface MemoryPressure {
  dueCount: number; // items due (incl. almost-due)
  atRiskCount: number; // forgetting detected / high fail rate
  recentFailures: number; // failed retrievals in the last 7 days
  daysSinceLastStudy: number | null;
}

export type BalanceMode = "new-heavy" | "balanced" | "review-heavy" | "rescue";

export interface TimeBudget {
  mode: BalanceMode;
  reviewMin: number;
  newMin: number;
  transferMin: number;
  /** how many review items today's plan should surface (the queue keeps the rest) */
  reviewCount: number;
  /** a one-line human reason — data-backed, never a formula */
  whyEn: string;
  whyZh: string;
}

/** Review-first hierarchy (spec P3/P7): memory at risk crowds out new input,
 * but new learning never drops to zero unless memory is collapsing. Pure. */
export function allocateBudget(dailyMinutes: number, p: MemoryPressure): TimeBudget {
  const minutes = Math.min(240, Math.max(10, Math.round(dailyMinutes)));

  // missed days → rescue: small, highest-value subset, welcoming tone
  if (p.daysSinceLastStudy != null && p.daysSinceLastStudy >= 3) {
    const reviewCount = Math.max(4, Math.min(8, Math.floor(minutes / 6)));
    return {
      mode: "rescue",
      reviewMin: Math.round(minutes * 0.7),
      newMin: Math.round(minutes * 0.3),
      transferMin: 0,
      reviewCount,
      whyEn: `Welcome back — a small set to rebuild the habit: the ${reviewCount} most valuable reviews first, one short read.`,
      whyZh: `欢迎回来——先用小任务找回节奏：最重要的 ${reviewCount} 项复习，加一小段阅读。`,
    };
  }

  // pressure index 0..~1: overdue weight + at-risk weight + recent failures
  const pressure = Math.min(
    1,
    p.dueCount / 25 + p.atRiskCount / 8 + p.recentFailures / 10,
  );

  let mode: BalanceMode;
  let reviewShare: number;
  if (pressure < 0.25) {
    mode = "new-heavy";
    reviewShare = 0.35;
  } else if (pressure < 0.55) {
    mode = "balanced";
    reviewShare = 0.55;
  } else if (pressure < 0.85) {
    mode = "review-heavy";
    reviewShare = 0.75;
  } else {
    mode = "rescue";
    reviewShare = 0.9;
  }

  const reviewMin = Math.round(minutes * reviewShare);
  const transferMin = mode === "rescue" ? 0 : Math.max(5, Math.round(minutes * 0.12));
  const newMin = Math.max(5, minutes - reviewMin - transferMin);
  // ~40s per review item, bounded so a huge backlog never floods the day
  const reviewCount = Math.max(3, Math.min(Math.floor(reviewMin / 0.7), 24));

  const whyEn =
    mode === "new-heavy"
      ? `Memory is in good shape — room for new material today, with ${p.dueCount || "no"} item${p.dueCount === 1 ? "" : "s"} to keep warm.`
      : mode === "balanced"
        ? `A balanced day: ${p.dueCount} item${p.dueCount === 1 ? "" : "s"} due plus fresh input.`
        : mode === "review-heavy"
          ? `Review takes priority today — ${p.dueCount} items due${p.atRiskCount ? `, ${p.atRiskCount} becoming harder to recall` : ""}.`
          : `Memory needs attention first: ${p.atRiskCount || p.dueCount} items at risk — new learning pauses until these are back.`;
  const whyZh =
    mode === "new-heavy"
      ? `记忆状态良好——今天有余力学新东西，同时保温 ${p.dueCount} 项。`
      : mode === "balanced"
        ? `均衡的一天：${p.dueCount} 项到期，加上新输入。`
        : mode === "review-heavy"
          ? `今天复习优先——${p.dueCount} 项到期${p.atRiskCount ? `，${p.atRiskCount} 项开始变得难回忆` : ""}。`
          : `记忆需要先照顾：${p.atRiskCount || p.dueCount} 项有风险——先稳住它们，新学习暂缓。`;

  return { mode, reviewMin, newMin, transferMin, reviewCount, whyEn, whyZh };
}

export interface TomorrowProjection {
  successCount: number; // due tomorrow if today completes cleanly
  struggleCount: number; // due tomorrow if today's at-risk items fail
  successLine: { en: string; zh: string };
  struggleLine: { en: string; zh: string };
}

/** Deterministic two-scenario projection (spec P14): a failure schedules the
 * item for tomorrow (engine interval=1), a success pushes it out ≥1 day. Pure
 * given the counts — no score prediction, only scheduling behaviour. */
export function projectTomorrow(input: {
  dueTomorrowCount: number; // items already scheduled inside tomorrow's window
  todayRiskCount: number; // today's items that would reset to 1-day if failed
}): TomorrowProjection {
  const successCount = input.dueTomorrowCount;
  const struggleCount = input.dueTomorrowCount + input.todayRiskCount;
  return {
    successCount,
    struggleCount,
    successLine: {
      en: `If today goes well: ${successCount} item${successCount === 1 ? "" : "s"} coming up tomorrow.`,
      zh: `如果今天顺利：明天约有 ${successCount} 项。`,
    },
    struggleLine: {
      en: struggleCount > successCount
        ? `If some slip: ${struggleCount} tomorrow — the slipped ones come straight back.`
        : `Either way, about ${struggleCount} tomorrow.`,
      zh: struggleCount > successCount
        ? `如果有遗忘：明天约 ${struggleCount} 项——没记住的会立刻回来。`
        : `无论顺利与否，明天约 ${struggleCount} 项。`,
    },
  };
}

/** Read memory pressure from real evidence (no inputs from the UI). */
export async function readMemoryPressure(userId: number): Promise<{ pressure: MemoryPressure; dailyMinutes: number }> {
  const now = Date.now();
  const [[dueRow], [riskRow], [failRow], [profile], lastStudy] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(retrievalItems)
      .where(and(eq(retrievalItems.userId, userId), lte(retrievalItems.dueAt, now + DAY))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(retrievalItems)
      .where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.forgettingDetected, 1))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(reviewHistory)
      .where(
        and(
          eq(reviewHistory.userId, userId),
          eq(reviewHistory.correct, 0),
          gte(reviewHistory.createdAt, now - 7 * DAY),
        ),
      ),
    db
      .select({ dailyMinutes: learningProfiles.dailyMinutes })
      .from(learningProfiles)
      .where(eq(learningProfiles.userId, userId))
      .limit(1),
    db
      .select({ t: sql<number>`max(${reviewHistory.createdAt})` })
      .from(reviewHistory)
      .where(eq(reviewHistory.userId, userId)),
  ]);

  const lastStudyAt = lastStudy[0]?.t ?? null;
  const daysSinceLastStudy = lastStudyAt
    ? Math.floor((now - lastStudyAt) / DAY)
    : null;

  return {
    pressure: {
      dueCount: dueRow?.n ?? 0,
      atRiskCount: riskRow?.n ?? 0,
      recentFailures: failRow?.n ?? 0,
      daysSinceLastStudy: daysSinceLastStudy === null ? null : daysSinceLastStudy,
    },
    dailyMinutes: profile?.dailyMinutes ?? 45,
  };
}

/** Full plan assembly — one call for the mission generator and the UI. */
export async function buildDailyPlan(userId: number): Promise<{ budget: TimeBudget; tomorrow: TomorrowProjection }> {
  const { pressure, dailyMinutes } = await readMemoryPressure(userId);
  const budget = allocateBudget(dailyMinutes, pressure);

  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const from = t0.getTime() + 2 * DAY; // the day after tomorrow's window is
  const to = from + DAY; // what "clean completion" leaves behind…

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(retrievalItems)
    .where(
      and(
        eq(retrievalItems.userId, userId),
        gte(retrievalItems.dueAt, from),
        lte(retrievalItems.dueAt, to),
      ),
    );

  const tomorrow = projectTomorrow({
    dueTomorrowCount: row?.n ?? 0,
    // at-risk + recently-failed items practiced today would reset to 1-day
    todayRiskCount: Math.min(pressure.atRiskCount + pressure.recentFailures, budget.reviewCount),
  });
  return { budget, tomorrow };
}
