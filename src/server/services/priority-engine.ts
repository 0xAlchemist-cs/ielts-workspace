import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { chunks, errors, retrievalItems, reviewHistory, contents, dailyMissions, learningProfiles } from "@/db/schema";
import { computeFullProfile } from "@/server/services/learning-profile";
import { detectErrorPatterns } from "@/server/services/learning-profile";
import { plural } from "@/lib/plural";
import type { MissionRationale, MissionOutcome } from "@/lib/types";
import type { DailyMission } from "@/db/schema";

/* ── Adaptive Priority Engine ───────────────────────────────────────────────
 * Every mission decision is explainable. The engine computes 6 weighted
 * factors and outputs a rationale the user can read and audit. */

export interface PriorityFactor {
  name: string;
  weight: number; // 0-1, how much this factor contributes
  rawScore: number; // 0-100
  weightedScore: number;
  detail: string;
}

export interface MissionDecision {
  primarySkill: "listening" | "reading" | "speaking" | "writing" | "retrieval";
  primarySubSkill: string;
  factors: PriorityFactor[];
  rationale: MissionRationale;
  retrievalItemIds: number[];
  targetChunkIds: number[];
  targetErrorIds: number[];
  recommendedLength: "quick" | "standard" | "deep";
}

const SKILL_ROTATION = ["reading", "listening", "speaking", "writing", "retrieval"] as const;

/** Daily length: the time budget first, then the engine's overall urgency —
 * a screaming day (totalWeighted ≥ 70) earns one more level of practice; a
 * 15-minute day never exceeds quick however urgent. Pure — unit-tested. */
export function recommendLength(dailyMinutes: number, totalWeighted: number): "quick" | "standard" | "deep" {
  const levels = ["quick", "standard", "deep"] as const;
  let idx = dailyMinutes <= 15 ? 0 : dailyMinutes <= 40 ? 1 : 2;
  if (totalWeighted >= 70 && dailyMinutes > 15) idx = Math.min(2, idx + 1);
  return levels[idx];
}

export async function computeMissionDecision(userId: number): Promise<MissionDecision> {
  // ── Fetch all decision inputs ────────────────────────────────────────────
  const [fullProfile, errorPatterns, dueItems, activeErrors, recentReviews, pastMissions, [profile]] =
    await Promise.all([
      computeFullProfile(userId),
      detectErrorPatterns(userId),
      db.select().from(retrievalItems)
        .where(and(eq(retrievalItems.userId, userId), lte(retrievalItems.dueAt, Date.now() + 86_400_000)))
        .limit(20),
      db.select().from(errors)
        .where(and(eq(errors.userId, userId), eq(errors.status, "active")))
        .orderBy(desc(errors.occurrenceCount))
        .limit(5),
      db.select().from(reviewHistory)
        .where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${Date.now() - 7 * 86_400_000}`))
        .orderBy(desc(reviewHistory.createdAt))
        .limit(20),
      db.select().from(dailyMissions)
        .where(eq(dailyMissions.userId, userId))
        .orderBy(desc(dailyMissions.createdAt))
        .limit(3),
      db.select({ dailyMinutes: learningProfiles.dailyMinutes }).from(learningProfiles)
        .where(eq(learningProfiles.userId, userId)).limit(1),
    ]);

  const dailyMinutes = profile?.dailyMinutes ?? 45;

  // ── Factor 1: Weakness (from learning profile) — weight 0.30 ────────────
  // weakest.score === null means "no VERIFIED evidence yet": the weakness
  // factor goes neutral (50) instead of pretending 100 − 0 = max weakness.
  const weakest = fullProfile.weakestLink;
  const weakestScore = typeof weakest.score === "number" ? weakest.score : 50;
  const weaknessScore = 100 - weakestScore;
  const weaknessFactor: PriorityFactor = {
    name: "Weakness",
    weight: 0.30,
    rawScore: weaknessScore,
    weightedScore: weaknessScore * 0.30,
    detail: typeof weakest.score === "number"
      ? `${weakest.skill} → ${weakest.subSkill} scored ${weakest.score}/100. ${weakest.evidence}`
      : `${weakest.skill} → ${weakest.subSkill}: ${weakest.evidence}`,
  };

  // ── Factor 2: Error Risk (from error patterns) — weight 0.25 ───────────
  const highSeverityCount = errorPatterns.filter((p) => p.severity === "high").length;
  const totalErrorOccurrences = errorPatterns.reduce((a, p) => a + p.occurrences, 0);
  const errorRiskScore = Math.min(100, totalErrorOccurrences * 8 + highSeverityCount * 20);
  const errorRiskFactor: PriorityFactor = {
    name: "Error Risk",
    weight: 0.25,
    rawScore: errorRiskScore,
    weightedScore: errorRiskScore * 0.25,
    detail: totalErrorOccurrences > 0
      ? `${errorPatterns.length} recurring patterns (${totalErrorOccurrences} total occurrences, ${highSeverityCount} high-severity). Top: "${errorPatterns[0]?.label ?? "none"}"`
      : "No recurring error patterns — clean slate.",
  };

  // ── Factor 3: Retrieval Urgency (from SM-2 due dates) — weight 0.20 ────
  const overdueCount = dueItems.filter((i) => i.dueAt <= Date.now()).length;
  const dueSoonCount = dueItems.length - overdueCount;
  const urgencyScore = Math.min(100, overdueCount * 15 + dueSoonCount * 5);
  const urgencyFactor: PriorityFactor = {
    name: "Retrieval Urgency",
    weight: 0.20,
    rawScore: urgencyScore,
    weightedScore: urgencyScore * 0.20,
    detail: `${plural(overdueCount, "item")} overdue, ${dueSoonCount} due within 24h. Forgetting curve decay active.`,
  };

  // ── Factor 4: IELTS Relevance — weight 0.15 ─────────────────────────────
  const weekFailures = recentReviews.filter((r) => r.correct === 0).length;
  const recentAccuracy = recentReviews.length
    ? Math.round((recentReviews.filter((r) => r.correct === 1).length / recentReviews.length) * 100)
    : 0;
  const ieltsScore = Math.max(0, 100 - recentAccuracy); // lower accuracy = higher IELTS training need
  const ieltsFactor: PriorityFactor = {
    name: "IELTS Relevance",
    weight: 0.15,
    rawScore: ieltsScore,
    weightedScore: ieltsScore * 0.15,
    detail: `Recent accuracy: ${recentAccuracy}% (${plural(recentReviews.length, "attempt")}, ${plural(weekFailures, "failure")} this week).`,
  };

  // ── Factor 5: Transfer Value (cross-module items) — weight 0.10 ─────────
  const lowTransferChunks = dueItems.filter((i) => {
    const ls = i.learningState;
    return ls && ls.state === "retrieval" || ls?.state === "usage";
  });
  const transferScore = Math.min(100, lowTransferChunks.length * 20);
  const transferFactor: PriorityFactor = {
    name: "Transfer Value",
    weight: 0.10,
    rawScore: transferScore,
    weightedScore: transferScore * 0.10,
    detail: `${plural(lowTransferChunks.length, "item")} ready for transfer (at retrieval/usage state but not yet transferred).`,
  };

  // ── Factor 6: Time Decay (items not seen recently) — weight 0.10 ────────
  const staleItems = dueItems.filter((i) => {
    if (!i.learningState?.lastProductionAt && !i.learningState?.lastContextualAt) return false;
    const lastSeen = Math.max(i.learningState.lastProductionAt ?? 0, i.learningState.lastContextualAt ?? 0);
    return Date.now() - lastSeen > 3 * 86_400_000;
  });
  const decayScore = Math.min(100, staleItems.length * 25);
  const decayFactor: PriorityFactor = {
    name: "Time Decay",
    weight: 0.10,
    rawScore: decayScore,
    weightedScore: decayScore * 0.10,
    detail: staleItems.length > 0
      ? `${plural(staleItems.length, "item")} not produced in 3+ days — memory traces fading.`
      : "All items recently exercised.",
  };

  // ── Trajectory feedback: adjust weights based on 30-day trends ─────────
  const { getTrajectory } = await import("@/server/services/trajectory");
  const { plateau, acceleration } = await getTrajectory(userId, 30);

  // If a skill is plateauing, increase its weakness weight
  const plateauSkills = new Set(plateau.map((p) => p.skill.toLowerCase()));
  // If a skill is accelerating, decrease its priority (give time to others)
  const acceleratingSkills = new Set(acceleration.map((a) => a.skill.toLowerCase()));

  // ── Determine primary skill (with diversity + trajectory) ────────────────
  // Weakest link maps to primary skill
  const weakestSkill = weakest.skill.toLowerCase();
  const primarySkill = (["listening", "reading", "speaking", "writing"].includes(weakestSkill)
    ? weakestSkill
    : "listening") as MissionDecision["primarySkill"];

  // Diversity: check last mission's focus
  const lastMission = pastMissions[0];
  const lastPlan = lastMission?.plan as { rationale?: { primaryFocus?: { skill: string } } } | undefined;
  const lastPrimary = lastPlan?.rationale?.primaryFocus?.skill?.toLowerCase();
  let diversityNote: string | undefined;
  let adjustedSkill = primarySkill;

  if (lastPrimary === primarySkill && pastMissions.length > 0) {
    // Rotate to next skill to avoid burnout on same area
    const idx = SKILL_ROTATION.indexOf(primarySkill as typeof SKILL_ROTATION[number]);
    adjustedSkill = SKILL_ROTATION[(idx + 1) % SKILL_ROTATION.length] as MissionDecision["primarySkill"];
    diversityNote = `Yesterday's primary was also ${primarySkill} — rotating to ${adjustedSkill} for balanced training.`;
  }

  // Trajectory adjustment: plateaued skills get priority boost
  if (plateauSkills.has(adjustedSkill)) {
    urgencyFactor.rawScore = Math.min(100, urgencyFactor.rawScore + 20);
    urgencyFactor.weightedScore = urgencyFactor.rawScore * urgencyFactor.weight;
    urgencyFactor.detail += ` [Plateau detected: ${adjustedSkill} flat for 14 days — format change needed.]`;
  }

  // Accelerating skills get deprioritized
  if (acceleratingSkills.has(adjustedSkill) && !plateauSkills.has(adjustedSkill)) {
    const altSkill = SKILL_ROTATION[(SKILL_ROTATION.indexOf(adjustedSkill) + 2) % SKILL_ROTATION.length];
    diversityNote = (diversityNote ?? "") + ` ${adjustedSkill} is accelerating — shifting focus to ${altSkill} to balance growth.`;
  }

  // ── Normalize factor weights to exactly 100%, then let overall urgency
  // co-decide the day's length. The declared shares are relative magnitudes
  // (they historically summed to 110%); the rationale UI displays both weight
  // and weightedScore, so both must live on a true 0-1 scale. ──────────────
  const factors = [weaknessFactor, errorRiskFactor, urgencyFactor, ieltsFactor, transferFactor, decayFactor];
  const weightSum = factors.reduce((a, f) => a + f.weight, 0);
  for (const f of factors) {
    f.weight = f.weight / weightSum;
    f.weightedScore = f.rawScore * f.weight;
  }
  const totalWeighted = factors.reduce((a, f) => a + f.weightedScore, 0);

  // ── Length recommendation ────────────────────────────────────────────────
  const recommendedLength = recommendLength(dailyMinutes, totalWeighted);

  // ── Select retrieval items (priority-weighted) ───────────────────────────
  const retrievalItemIds = dueItems
    .sort((a, b) => {
      // Overdue first, then by error association, then by state advancement potential
      const aOver = a.dueAt <= Date.now() ? 1 : 0;
      const bOver = b.dueAt <= Date.now() ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;
      const aErr = a.itemType === "error" ? 1 : 0;
      const bErr = b.itemType === "error" ? 1 : 0;
      return bErr - aErr;
    })
    .slice(0, recommendedLength === "quick" ? 5 : recommendedLength === "standard" ? 8 : 12)
    .map((i) => i.id);

  // ── Select target chunks (items needing production/transfer) ────────────
  const targetChunkIds = dueItems
    .filter((i) => i.itemType === "chunk")
    .filter((i) => {
      const ls = i.learningState;
      if (!ls) return true; // new items
      return ls.state === "retrieval" || ls.state === "usage" || ls.state === "recognition";
    })
    .slice(0, 4)
    .map((i) => i.itemId);

  const targetErrorIds = activeErrors.slice(0, 3).map((e) => e.id);

  // ── Compose rationale ────────────────────────────────────────────────────
  const urgentItems: string[] = [];
  if (overdueCount > 0) urgentItems.push(`${plural(overdueCount, "item")} overdue for retrieval`);
  if (highSeverityCount > 0) urgentItems.push(`${plural(highSeverityCount, "high-severity error pattern")} active`);
  const failedItems = dueItems.filter((i) => i.failCount >= 2);
  if (failedItems.length > 0) urgentItems.push(`${plural(failedItems.length, "item")} with repeated retrieval failures`);

  const rationale: MissionRationale = {
    headline: `Focus: ${adjustedSkill} → ${weakest.subSkill}. ` +
      (urgentItems.length > 0
        ? `Urgent: ${urgentItems[0]}.`
        : `Maintaining steady progress across all skills.`),
    factors: [weaknessFactor, errorRiskFactor, urgencyFactor, ieltsFactor, transferFactor, decayFactor],
    primaryFocus: { skill: adjustedSkill, subSkill: weakest.subSkill, score: weakestScore },
    diversityNote,
    urgentItems,
  };

  return {
    primarySkill: adjustedSkill,
    primarySubSkill: weakest.subSkill,
    factors: [weaknessFactor, errorRiskFactor, urgencyFactor, ieltsFactor, transferFactor, decayFactor],
    rationale,
    retrievalItemIds,
    targetChunkIds,
    targetErrorIds,
    recommendedLength,
  };
}

/** Generate Mission Outcome: what changed during this session. */
export async function computeMissionOutcome(
  userId: number,
  missionId: number,
): Promise<MissionOutcome> {
  // Snapshot "after" metrics
  const [reviewRows, chunkRows, errorRows] = await Promise.all([
    db.select().from(reviewHistory)
      .where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${Date.now() - 86_400_000}`)),
    db.select().from(chunks).where(eq(chunks.userId, userId)),
    db.select().from(errors).where(and(eq(errors.userId, userId), eq(errors.status, "active"))),
  ]);

  const todayAccuracy = reviewRows.length
    ? Math.round((reviewRows.filter((r) => r.correct === 1).length / reviewRows.length) * 100)
    : 0;
  const activeChunks = chunkRows.filter((c) => c.activatedAt !== null).length;
  const activeErrors = errorRows.length;

  // Find items that improved (moved states today)
  const improvements: string[] = [];
  const needsAttention: string[] = [];

  for (const item of chunkRows) {
    if (!item.activatedAt || item.activatedAt < Date.now() - 86_400_000) continue;
    // Activated today
    improvements.push(`"${item.text}" moved to Active — you produced it in real output.`);
  }

  // Check for items that failed retrieval today
  const todayFailures = reviewRows.filter((r) => r.correct === 0 && r.createdAt > Date.now() - 86_400_000);
  for (const f of todayFailures.slice(0, 3)) {
    needsAttention.push(`"${f.expected}" failed retrieval — still needs production practice.`);
  }

  // Check error improvements
  const improvingErrors = errorRows.filter((e) => e.correctedCount > 0 && e.status !== "active");
  for (const e of improvingErrors.slice(0, 2)) {
    improvements.push(`"${e.wrongForm}" error improving (${e.correctedCount} corrections).`);
  }

  const highErrors = errorRows.filter((e) => e.severity === "high");
  for (const e of highErrors.slice(0, 2)) {
    needsAttention.push(`"${e.wrongForm}" still high-severity (${e.occurrenceCount} occurrences).`);
  }

  return {
    completedAt: Date.now(),
    improvements,
    needsAttention,
    metricsBefore: { retrievalAccuracy: 0, activeChunks: 0, errorCount: 0 }, // filled by caller
    metricsAfter: { retrievalAccuracy: todayAccuracy, activeChunks, errorCount: activeErrors },
  };
}
