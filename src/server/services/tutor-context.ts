import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  errors, chunks, vocabularies, reviewHistory, learningProfiles,
  retrievalItems, chunkEvents, learningSnapshots, ieltsSkillProfiles,
} from "@/db/schema";
import { lookupWord } from "@/server/services/dictionary";
import { plural } from "@/lib/plural";

/* ── Tutor Context Builder ─────────────────────────────────────────────────
 * Assembles ONLY the data relevant to the user's current question.
 * Never sends full history — compressed, targeted, cost-controlled. */

export interface TutorContext {
  /** user profile snapshot (compact) */
  cefr: string;
  ieltsTarget: number | null;
  immersionLevel: number;
  /** relevant errors from Error Bank */
  relevantErrors: { wrongForm: string; correctForm: string; category: string; occurrenceCount: number; explanation: string }[];
  /** relevant LanguageItems (chunks the user has that match the query) */
  relevantChunks: { text: string; meaningEn: string; strength: number; state: string }[];
  /** recent retrieval performance (last 7 days, compact) */
  recentAccuracy: number;
  recentAttempts: number;
  /** active learning state (compact) */
  activeItems: number;
  retentionScore: number;
  /** latest trajectory snapshot (compact) */
  lastSnapshot: { overall: number; listening: number; reading: number; speaking: number; writing: number } | null;
  /** IELTS readiness (compact) */
  ieltsBands: Record<string, number | null>;
  /** tutor insights from past conversations */
  insights: string[];
}

export async function buildTutorContext(
  userId: number,
  query: string,
): Promise<TutorContext> {
  const queryLower = query.toLowerCase();
  const week = Date.now() - 7 * 86_400_000;

  // Extract key words from query for matching
  const queryWords = queryLower.replace(/[^a-z\s]/g, "").split(/\s+/).filter((w) => w.length > 2);

  // ── Profile (single row) ─────────────────────────────────────────────────
  const [profile] = await db
    .select({ cefr: learningProfiles.cefr, ieltsOverall: learningProfiles.ieltsOverall, immersionLevel: learningProfiles.immersionLevel })
    .from(learningProfiles)
    .where(eq(learningProfiles.userId, userId))
    .limit(1);

  // ── Relevant errors: match query words against error bank ────────────────
  const allErrors = await db
    .select()
    .from(errors)
    .where(and(eq(errors.userId, userId), eq(errors.status, "active")))
    .orderBy(desc(errors.occurrenceCount))
    .limit(20);

  const relevantErrors = allErrors
    .filter((e) => {
      const errLower = (e.wrongForm + " " + e.correctForm + " " + e.explanation).toLowerCase();
      return queryWords.some((qw) => errLower.includes(qw)) || e.category.includes(queryLower.slice(0, 6));
    })
    .slice(0, 5)
    .map((e) => ({
      wrongForm: e.wrongForm,
      correctForm: e.correctForm,
      category: e.category,
      occurrenceCount: e.occurrenceCount,
      explanation: e.explanation.slice(0, 150),
    }));

  // ── Relevant chunks: match query words against user's chunk bank ────────
  const userChunks = await db
    .select()
    .from(chunks)
    .where(eq(chunks.userId, userId))
    .orderBy(desc(chunks.retrievalStrength))
    .limit(30);

  const relevantChunks = userChunks
    .filter((c) => {
      const chunkLower = (c.text + " " + c.meaningEn + " " + c.meaningZh).toLowerCase();
      return queryWords.some((qw) => chunkLower.includes(qw));
    })
    .slice(0, 5)
    .map((c) => ({
      text: c.text,
      meaningEn: c.meaningEn.slice(0, 100),
      strength: c.retrievalStrength,
      state: "active",
    }));

  // ── Recent retrieval performance ────────────────────────────────────────
  const [reviewStats] = await db
    .select({
      total: sql<number>`count(*)`,
      correct: sql<number>`sum(case when ${reviewHistory.correct} = 1 then 1 else 0 end)`,
    })
    .from(reviewHistory)
    .where(and(eq(reviewHistory.userId, userId), gte(reviewHistory.createdAt, week)));

  const recentAttempts = reviewStats?.total ?? 0;
  const recentAccuracy = recentAttempts ? Math.round(((reviewStats.correct ?? 0) / recentAttempts) * 100) : 0;

  // ── Active items + retention ────────────────────────────────────────────
  const [itemStats] = await db
    .select({
      total: sql<number>`count(*)`,
      avgRetention: sql<number>`coalesce(avg(${retrievalItems.retentionScore}), 0)`,
    })
    .from(retrievalItems)
    .where(eq(retrievalItems.userId, userId));

  // ── Latest trajectory snapshot ──────────────────────────────────────────
  const [snap] = await db
    .select({ snapshot: learningSnapshots.snapshot })
    .from(learningSnapshots)
    .where(eq(learningSnapshots.userId, userId))
    .orderBy(desc(learningSnapshots.date))
    .limit(1);

  const lastSnapshot = snap?.snapshot
    ? { overall: snap.snapshot.overall, listening: snap.snapshot.listening, reading: snap.snapshot.reading, speaking: snap.snapshot.speaking, writing: snap.snapshot.writing }
    : null;

  // ── IELTS readiness ─────────────────────────────────────────────────────
  const ieltsRows = await db
    .select({ skill: ieltsSkillProfiles.skill, band: ieltsSkillProfiles.estimatedBand })
    .from(ieltsSkillProfiles)
    .where(eq(ieltsSkillProfiles.userId, userId));
  const ieltsBands: Record<string, number | null> = {};
  for (const r of ieltsRows) ieltsBands[r.skill] = r.band;

  // ── Tutor insights from past conversations ──────────────────────────────
  const insightRows = await db
    .select({ detail: chunkEvents.detail })
    .from(chunkEvents)
    .where(and(eq(chunkEvents.userId, userId), eq(chunkEvents.type, "tutor_insight")))
    .orderBy(desc(chunkEvents.createdAt))
    .limit(5);
  const insights = insightRows.map((r) => r.detail).filter(Boolean);

  return {
    cefr: profile?.cefr ?? "B1",
    ieltsTarget: profile?.ieltsOverall ?? null,
    immersionLevel: profile?.immersionLevel ?? 1,
    relevantErrors,
    relevantChunks,
    recentAccuracy,
    recentAttempts,
    activeItems: itemStats?.total ?? 0,
    retentionScore: Math.round(itemStats?.avgRetention ?? 0),
    lastSnapshot,
    ieltsBands,
    insights,
  };
}

/** Compress context into a concise system prompt string for the AI. */
export function contextToPrompt(ctx: TutorContext): string {
  const parts: string[] = [];

  parts.push(`Learner profile: CEFR ${ctx.cefr}, IELTS target ${ctx.ieltsTarget ?? "not set"}.`);
  parts.push(`Recent retrieval: ${ctx.recentAccuracy}% accuracy over ${plural(ctx.recentAttempts, "attempt")} (7 days).`);
  parts.push(`Active language items: ${ctx.activeItems}, average retention score: ${ctx.retentionScore}/100.`);

  if (ctx.relevantErrors.length > 0) {
    parts.push(`Known recurring errors: ${ctx.relevantErrors.map((e) => `"${e.wrongForm}" → "${e.correctForm}" (×${e.occurrenceCount})`).join("; ")}.`);
  }

  if (ctx.relevantChunks.length > 0) {
    parts.push(`Relevant learned chunks: ${ctx.relevantChunks.map((c) => `"${c.text}" (strength ${c.strength})`).join("; ")}.`);
  }

  if (ctx.lastSnapshot) {
    parts.push(`Latest skill scores: Listening ${ctx.lastSnapshot.listening}, Reading ${ctx.lastSnapshot.reading}, Speaking ${ctx.lastSnapshot.speaking}, Writing ${ctx.lastSnapshot.writing}.`);
  }

  if (Object.keys(ctx.ieltsBands).length > 0) {
    parts.push(`IELTS estimated bands: ${Object.entries(ctx.ieltsBands).map(([s, b]) => `${s} ${b ?? "?"}`).join(", ")}.`);
  }

  if (ctx.insights.length > 0) {
    parts.push(`Previous tutor insights: ${ctx.insights.join(" | ")}.`);
  }

  return parts.join(" ");
}
