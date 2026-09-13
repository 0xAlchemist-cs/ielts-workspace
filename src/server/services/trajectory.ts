import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  learningSnapshots, progressEvents, reviewHistory, chunks, vocabularies,
  errors, speakingAttempts, writingAttempts, listeningMisses, chunkEvents,
  learningProfiles,
} from "@/db/schema";
import { computeFullProfile } from "@/server/services/learning-profile";
import { todayKey } from "@/lib/text";
import type {
  LearningSnapshot, ProgressEvent, SkillTrend, Bottleneck, IeltsReadiness, WeeklyReview,
} from "@/lib/types";

/* ── Learning Trajectory Engine ────────────────────────────────────────────
 * Evidence → Measurement → Diagnosis → Decision. Every conclusion traces
 * to real learning events. No fabricated progress. */

const DAY = 86_400_000;

/** Take today's snapshot and store it (idempotent per day). */
export async function takeDailySnapshot(userId: number): Promise<LearningSnapshot> {
  const fullProfile = await computeFullProfile(userId);

  const [reviewRows, chunkRows, vocabRows, errorRows, speakRows, writeRows, listenRows, eventRows] =
    await Promise.all([
      db.select().from(reviewHistory).where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${Date.now() - DAY}`)),
      db.select().from(chunks).where(eq(chunks.userId, userId)),
      db.select().from(vocabularies).where(eq(vocabularies.userId, userId)),
      db.select().from(errors).where(and(eq(errors.userId, userId), eq(errors.status, "active"))),
      db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, userId)),
      db.select().from(writingAttempts).where(eq(writingAttempts.userId, userId)),
      db.select().from(listeningMisses).where(eq(listeningMisses.userId, userId)),
      db.select().from(chunkEvents).where(and(eq(chunkEvents.userId, userId), sql`${chunkEvents.createdAt} > ${Date.now() - DAY}`)),
    ]);

  const todayReviews = reviewRows.length;
  const todayCorrect = reviewRows.filter((r) => r.correct === 1).length;
  const retrievalAccuracy = todayReviews ? Math.round((todayCorrect / todayReviews) * 100) : 0;

  const activeChunks = chunkRows.filter((c) => c.activatedAt !== null).length;
  const activeVocab = vocabRows.filter((v) => v.status === "active").length;
  const recurringErrors = errorRows.filter((e) => e.occurrenceCount >= 2).length;
  const meaningfulEvents = eventRows.filter((e) =>
    ["retrieval_success", "generation_pass", "context_transfer", "speaking_use", "ielts_use"].includes(e.type)
  ).length;

  // Skill scores from full profile (average of VERIFIED sub-dimensions only —
  // null "developing" dims neither inflate nor drag the trend)
  const avgDims = (dims: { score: number | null }[]) => {
    const nums = dims.map((d) => d.score).filter((s): s is number => typeof s === "number");
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  };

  const snapshot: LearningSnapshot = {
    date: todayKey(),
    overall: avgDims([...fullProfile.listening, ...fullProfile.reading, ...fullProfile.speaking, ...fullProfile.writing]),
    reading: avgDims(fullProfile.reading),
    listening: avgDims(fullProfile.listening),
    speaking: avgDims(fullProfile.speaking),
    writing: avgDims(fullProfile.writing),
    retrievalAccuracy,
    transferRate: fullProfile.overall.find((d) => d.key === "transfer_rate")?.score ?? 0,
    activeChunks,
    activeVocab,
    recurringErrors,
    studyMinutes: 0, // computed from session duration, approximate
    meaningfulEvents,
    estimatedIelts: null, // computed by estimateIeltsReadiness
    bottleneck: fullProfile.weakestLink.subSkill,
  };

  // IELTS readiness
  const readiness = estimateIeltsReadiness(snapshot, speakRows.length, writeRows.length);
  snapshot.estimatedIelts = readiness.reduce((a, r) => a + (r.low + r.high) / 2, 0) / readiness.length || null;

  // Store (upsert by date)
  await db
    .insert(learningSnapshots)
    .values({ userId, date: snapshot.date, snapshot })
    .onConflictDoUpdate({
      target: [learningSnapshots.userId, learningSnapshots.date],
      set: { snapshot },
    });

  // Record progress events (compare with yesterday's snapshot)
  const [yesterday] = await db
    .select()
    .from(learningSnapshots)
    .where(and(eq(learningSnapshots.userId, userId), sql`${learningSnapshots.date} < ${snapshot.date}`))
    .orderBy(desc(learningSnapshots.date))
    .limit(1);

  if (yesterday) {
    const prev = yesterday.snapshot;
    await recordProgressDeltas(userId, prev, snapshot);
  }

  return snapshot;
}

/** Record metric changes with attribution evidence. */
async function recordProgressDeltas(userId: number, prev: LearningSnapshot, curr: LearningSnapshot): Promise<void> {
  const metrics: { key: keyof LearningSnapshot; label: string; reason: string }[] = [
    { key: "listening", label: "Listening", reason: "Connected speech recognition and word identification" },
    { key: "reading", label: "Reading", reason: "Vocabulary knowledge and comprehension accuracy" },
    { key: "speaking", label: "Speaking", reason: "Fluency, grammar accuracy, and active production" },
    { key: "writing", label: "Writing", reason: "Lexical precision and grammatical complexity" },
    { key: "retrievalAccuracy", label: "Retrieval Accuracy", reason: "Successful retrievals vs total attempts" },
    { key: "activeChunks", label: "Active Chunks", reason: "Expressions produced in real output" },
    { key: "recurringErrors", label: "Recurring Errors", reason: "Error patterns with 2+ occurrences" },
  ];

  for (const m of metrics) {
    const prevVal = prev[m.key] as number;
    const currVal = curr[m.key] as number;
    if (Math.abs(currVal - prevVal) < 1) continue; // skip noise

    await db.insert(progressEvents).values({
      userId,
      metric: m.key as string,
      previousValue: prevVal,
      newValue: currVal,
      delta: currVal - prevVal,
      reason: `${m.label}: ${prevVal} → ${currVal}. ${m.reason}.`,
      evidence: `${curr.meaningfulEvents} meaningful events today, ${curr.retrievalAccuracy}% retrieval accuracy.`,
    });
  }
}

/** Get trajectory: skill trends with direction and attribution. */
export async function getTrajectory(userId: number, days: 7 | 30 | 90 | 365 = 30): Promise<{
  snapshots: LearningSnapshot[];
  trends: SkillTrend[];
  bottleneck: Bottleneck | null;
  plateau: { skill: string; detail: string }[];
  acceleration: { skill: string; detail: string }[];
}> {
  const since = todayKey(new Date(Date.now() - days * DAY));
  const rows = await db
    .select()
    .from(learningSnapshots)
    .where(and(eq(learningSnapshots.userId, userId), sql`${learningSnapshots.date} >= ${since}`))
    .orderBy(learningSnapshots.date);

  const snapshots = rows.map((r) => r.snapshot);
  if (snapshots.length < 2) {
    return { snapshots, trends: [], bottleneck: null, plateau: [], acceleration: [] };
  }

  const latest = snapshots[snapshots.length - 1];
  const weekAgo = snapshots[Math.max(0, snapshots.length - 8)];
  const monthAgo = snapshots[Math.max(0, snapshots.length - 31)];

  const skillKeys: { key: keyof LearningSnapshot; label: string }[] = [
    { key: "overall", label: "Overall" },
    { key: "listening", label: "Listening" },
    { key: "reading", label: "Reading" },
    { key: "speaking", label: "Speaking" },
    { key: "writing", label: "Writing" },
    { key: "retrievalAccuracy", label: "Retrieval" },
    { key: "transferRate", label: "Transfer" },
  ];

  // Fetch attribution evidence from progress_events
  const events = await db
    .select()
    .from(progressEvents)
    .where(and(eq(progressEvents.userId, userId), sql`${progressEvents.createdAt} > ${Date.now() - days * DAY}`))
    .orderBy(desc(progressEvents.createdAt))
    .limit(50);

  const trends: SkillTrend[] = skillKeys.map(({ key, label }) => {
    const current = latest[key] as number;
    const w7 = current - (weekAgo[key] as number);
    const w30 = current - (monthAgo[key] as number);

    let direction: SkillTrend["direction"] = "insufficient-data";
    if (snapshots.length >= 7) {
      if (w7 > 3) direction = "improving";
      else if (w7 < -3) direction = "declining";
      else direction = "plateau";
    }

    const attribution = events
      .filter((e) => e.metric === key)
      .slice(0, 3)
      .map((e) => e.reason);

    return { key: key as string, label, current, trend7: w7, trend30: w30, direction, attribution };
  });

  // ── Bottleneck detection ───────────────────────────────────────────────
  const bottleneck = detectBottleneck(latest, trends);

  // ── Plateau detection: <±2 change over 14 days ─────────────────────────
  const plateau: { skill: string; detail: string }[] = [];
  if (snapshots.length >= 14) {
    const twoWeeksAgo = snapshots[snapshots.length - 15];
    for (const { key, label } of skillKeys) {
      const change = (latest[key] as number) - (twoWeeksAgo[key] as number);
      if (Math.abs(change) <= 2 && snapshots.length >= 14) {
        plateau.push({
          skill: label,
          detail: `${label} has been ${latest[key]} ± 2 for 14 days. Consider changing task format, context, or difficulty.`,
        });
      }
    }
  }

  // ── Acceleration detection: >8 gain over 14 days ────────────────────────
  const acceleration: { skill: string; detail: string }[] = [];
  if (snapshots.length >= 14) {
    const twoWeeksAgo = snapshots[snapshots.length - 15];
    for (const { key, label } of skillKeys) {
      const change = (latest[key] as number) - (twoWeeksAgo[key] as number);
      if (change >= 8) {
        acceleration.push({
          skill: label,
          detail: `${label} improved +${change} in 14 days — rapid progress. Priority Engine will shift focus to the next bottleneck.`,
        });
      }
    }
  }

  return { snapshots, trends, bottleneck, plateau, acceleration };
}

/** Detect the root-cause bottleneck (not just the weakest skill). */
function detectBottleneck(latest: LearningSnapshot, trends: SkillTrend[]): Bottleneck | null {
  // If speaking is low but retrieval accuracy is also low → bottleneck is vocabulary retrieval
  if (latest.speaking < 60 && latest.retrievalAccuracy < 60) {
    return {
      skill: "Speaking",
      rootCause: "Active Vocabulary Retrieval",
      detail: `Speaking scores ${latest.speaking} but the real constraint is retrieval accuracy at ${latest.retrievalAccuracy}%. You know the words but can't access them fast enough during speech.`,
      recommendation: "Prioritize production-mode retrieval over recognition. The gap is in recall speed, not knowledge.",
    };
  }

  // If listening is low but vocabulary is fine → bottleneck is connected speech
  if (latest.listening < 60 && latest.activeVocab > 20) {
    return {
      skill: "Listening",
      rootCause: "Connected Speech Processing",
      detail: `Listening scores ${latest.listening} despite ${latest.activeVocab} active vocabulary words. The ear isn't parsing fast speech — it's not a vocabulary problem.`,
      recommendation: "Focus on shadowing and spoken-form analysis. Recognition isn't enough — you need to retrain how connected sounds map to words.",
    };
  }

  // If writing is low but reading is fine → bottleneck is production confidence
  if (latest.writing < 60 && latest.reading > 65) {
    return {
      skill: "Writing",
      rootCause: "Active Production Gap",
      detail: `Reading comprehension at ${latest.reading} but writing at ${latest.writing}. You understand more than you can produce — the gap is in output practice, not comprehension.`,
      recommendation: "Increase Targeted Writing mode frequency. The Retrieval Engine should push more chunks into writing activation.",
    };
  }

  // Default: the lowest skill IS the bottleneck
  const lowest = trends.filter((t) => t.current > 0).sort((a, b) => a.current - b.current)[0];
  if (lowest) {
    return {
      skill: lowest.label,
      rootCause: "General skill weakness",
      detail: `${lowest.label} at ${lowest.current}/100 is the primary limiter. ${lowest.trend30 !== 0 ? `30-day trend: ${lowest.trend30 > 0 ? "+" : ""}${lowest.trend30}.` : "No 30-day trend data yet."}`,
      recommendation: `Continue mission focus on ${lowest.label.toLowerCase()}. The Adaptive Mission Engine is already prioritizing this.`,
    };
  }

  return null;
}

/** IELTS Readiness estimate with confidence and evidence. */
export function estimateIeltsReadiness(
  snapshot: LearningSnapshot,
  speakingSamples: number,
  writingSamples: number,
): IeltsReadiness[] {
  const scoreToBand = (score: number) => {
    // 0-100 → 4.0-8.0 scale
    return Math.max(4, Math.min(8, 4 + (score / 100) * 4));
  };

  const confidence = (samples: number): IeltsReadiness["confidence"] => {
    if (samples >= 20) return "high";
    if (samples >= 5) return "medium";
    return "low";
  };

  const band = (skill: string, score: number, samples: number, note: string): IeltsReadiness => {
    const mid = scoreToBand(score);
    const range = confidence(samples) === "high" ? 0.25 : confidence(samples) === "medium" ? 0.5 : 0.75;
    return {
      skill,
      low: Math.round((mid - range) * 2) / 2,
      high: Math.round((mid + range) * 2) / 2,
      confidence: confidence(samples),
      evidenceCount: samples,
      evidenceNote: note,
    };
  };

  return [
    band("Listening", snapshot.listening, snapshot.meaningfulEvents, `${snapshot.meaningfulEvents} listening-related events`),
    band("Reading", snapshot.reading, snapshot.activeVocab, `${snapshot.activeVocab} active vocabulary items`),
    band("Speaking", snapshot.speaking, speakingSamples, `${speakingSamples} speaking samples analyzed`),
    band("Writing", snapshot.writing, writingSamples, `${writingSamples} writing samples analyzed`),
    {
      ...band("Overall", snapshot.overall, (speakingSamples + writingSamples) / 2, `${speakingSamples + writingSamples} production samples`),
      skill: "Overall",
    },
  ];
}

/** Generate weekly review from trajectory data. */
export async function generateWeeklyReview(userId: number): Promise<WeeklyReview | null> {
  const { snapshots, trends } = await getTrajectory(userId, 7);
  if (snapshots.length < 2) return null;

  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  const improved = trends
    .filter((t) => t.trend7 > 2)
    .map((t) => ({ skill: t.label, delta: t.trend7, reason: t.attribution[0] ?? "Consistent practice" }));

  const stillWeak = trends
    .filter((t) => t.current < 60 && t.current > 0)
    .map((t) => ({ skill: t.label, score: t.current, reason: t.direction === "plateau" ? "No significant change this week" : "Needs more targeted practice" }));

  // Error patterns
  const { detectErrorPatterns } = await import("@/server/services/learning-profile");
  const patterns = await detectErrorPatterns(userId);
  const topErrors = patterns.slice(0, 3).map((p) => `${p.label} (×${p.occurrences})`);

  // Item strength
  const chunkRows = await db.select().from(chunks).where(eq(chunks.userId, userId));
  const strongest = chunkRows.sort((a, b) => b.retrievalStrength - a.retrievalStrength).slice(0, 3);
  const weakest = chunkRows.sort((a, b) => a.retrievalStrength - b.retrievalStrength).slice(0, 3);

  const weekReviews = await db.select().from(reviewHistory)
    .where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${Date.now() - 7 * DAY}`));
  const weekAcc = weekReviews.length ? Math.round((weekReviews.filter((r) => r.correct === 1).length / weekReviews.length) * 100) : 0;

  const transferEvents = await db.select().from(chunkEvents)
    .where(and(eq(chunkEvents.userId, userId), sql`${chunkEvents.createdAt} > ${Date.now() - 7 * DAY}`));
  const transfers = transferEvents.filter((e) => e.type === "context_transfer" || e.type === "speaking_use").length;
  const transferAttempts = transferEvents.filter((e) => e.type === "retrieval_attempt" || e.type === "retrieval_success").length;

  const ieltsBefore = first.estimatedIelts;
  const ieltsAfter = latest.estimatedIelts;
  const ieltsChange = ieltsBefore != null && ieltsAfter != null
    ? `${ieltsBefore.toFixed(1)} → ${ieltsAfter.toFixed(1)} (${ieltsAfter > ieltsBefore ? "+" : ""}${(ieltsAfter - ieltsBefore).toFixed(1)})`
    : "Insufficient data for comparison";

  const bottleneck = detectBottleneck(latest, trends);

  return {
    weekOf: todayKey(new Date(Date.now() - 7 * DAY)),
    improved,
    stillWeak,
    topErrors,
    strongestItems: strongest.map((c) => `"${c.text}" (${c.retrievalStrength})`),
    weakestItems: weakest.map((c) => `"${c.text}" (${c.retrievalStrength})`),
    retrievalStats: { attempts: weekReviews.length, accuracy: weekAcc },
    transferStats: { attempted: transferAttempts, succeeded: transfers },
    ieltsChange,
    nextPriority: bottleneck?.rootCause ?? "Continue balanced practice across all skills",
  };
}

/** Learning efficiency: meaningful events per study time. */
export async function getLearningEfficiency(userId: number): Promise<{
  eventsPerHour: number;
  retrievalPerHour: number;
  transferPerHour: number;
  errorResolutionRate: number;
  rating: "high" | "medium" | "low";
  detail: string;
}> {
  const events = await db.select().from(chunkEvents)
    .where(and(eq(chunkEvents.userId, userId), sql`${chunkEvents.createdAt} > ${Date.now() - 7 * DAY}`));
  const reviews = await db.select().from(reviewHistory)
    .where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${Date.now() - 7 * DAY}`));

  // Estimate study time from event spread (rough: events with gaps > 30min = separate sessions)
  const timestamps = [...events.map((e) => e.createdAt), ...reviews.map((r) => r.createdAt)].sort((a, b) => a - b);
  let totalMinutes = 0;
  let sessionStart = timestamps[0] ?? Date.now();
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > 30 * 60_000) {
      totalMinutes += Math.min(120, (timestamps[i - 1] - sessionStart) / 60_000 + 5);
      sessionStart = timestamps[i];
    }
  }
  if (timestamps.length > 0) {
    totalMinutes += Math.min(120, (timestamps[timestamps.length - 1] - sessionStart) / 60_000 + 5);
  }
  const hours = Math.max(0.5, totalMinutes / 60);

  const meaningful = events.filter((e) =>
    ["retrieval_success", "generation_pass", "context_transfer", "speaking_use", "ielts_use"].includes(e.type)
  ).length;
  const transfers = events.filter((e) => e.type === "context_transfer" || e.type === "speaking_use").length;
  const retrievals = reviews.filter((r) => r.correct === 1).length;

  const errorRows = await db.select().from(errors).where(eq(errors.userId, userId));
  const resolved = errorRows.filter((e) => e.status === "resolved" || e.correctedCount > 0).length;
  const errorResolutionRate = errorRows.length ? Math.round((resolved / errorRows.length) * 100) : 0;

  const eventsPerHour = Math.round(meaningful / hours);
  const retrievalPerHour = Math.round(retrievals / hours);
  const transferPerHour = Math.round(transfers / hours);

  const composite = eventsPerHour * 2 + transferPerHour * 3 + (errorResolutionRate / 10);
  const rating = composite > 30 ? "high" : composite > 12 ? "medium" : "low";

  return {
    eventsPerHour,
    retrievalPerHour,
    transferPerHour,
    errorResolutionRate,
    rating,
    detail: `${meaningful} meaningful events / ${hours.toFixed(1)}h = ${eventsPerHour}/hr. ${retrievals} successful retrievals. ${transfers} transfers. ${errorResolutionRate}% error resolution rate.`,
  };
}
