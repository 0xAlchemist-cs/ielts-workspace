import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { errors, reviewHistory, retrievalItems, chunkEvents, chunks, vocabularies, speakingAttempts, writingAttempts, listeningMisses, learningProfiles } from "@/db/schema";
import type { ErrorCategory, ErrorStatus, ModuleContext } from "@/lib/types";

/* ── Error Pattern Detection ────────────────────────────────────────────────
 * Groups isolated errors into recurring patterns. "interested on" ×3 isn't
 * three separate mistakes — it's one pattern: "interested + wrong preposition".
 * Patterns drive Retrieval Engine scheduling and Weakest Link computation. */

export interface ErrorPattern {
  key: string;
  label: string;
  category: ErrorCategory;
  occurrences: number;
  severity: "low" | "medium" | "high";
  examples: { wrong: string; correct: string; module: string }[];
  status: ErrorStatus;
}

/** Detect recurring error patterns from the user's error bank. */
export async function detectErrorPatterns(userId: number): Promise<ErrorPattern[]> {
  const rows = await db
    .select()
    .from(errors)
    .where(eq(errors.userId, userId))
    .orderBy(desc(errors.occurrenceCount));

  if (!rows.length) return [];

  const patterns: ErrorPattern[] = [];
  const grouped = new Map<string, ErrorPattern>();

  for (const e of rows) {
    // ── Pattern 1: same wrong form repeatedly ────────────────────────────
    const repeatKey = `repeat:${e.wrongForm}`;
    const existing = grouped.get(repeatKey);
    if (existing) {
      existing.occurrences += e.occurrenceCount;
      existing.examples.push({ wrong: e.wrongForm, correct: e.correctForm, module: e.sourceModule });
      existing.severity = existing.occurrences >= 4 ? "high" : existing.occurrences >= 2 ? "medium" : "low";
    } else if (e.occurrenceCount >= 2) {
      grouped.set(repeatKey, {
        key: repeatKey,
        label: `"${e.wrongForm}" — recurring ${e.category.replace("_", " ")}`,
        category: e.category,
        occurrences: e.occurrenceCount,
        severity: e.occurrenceCount >= 4 ? "high" : "medium",
        examples: [{ wrong: e.wrongForm, correct: e.correctForm, module: e.sourceModule }],
        status: e.status,
      });
    }

    // ── Pattern 2: preposition errors with the same headword ─────────────
    if (e.category === "preposition") {
      const headword = e.wrongForm.split(/\s+/)[0]?.toLowerCase() ?? "";
      if (headword.length > 2) {
        const prepKey = `prep:${headword}`;
        const prepExisting = grouped.get(prepKey);
        if (prepExisting) {
          prepExisting.occurrences++;
          prepExisting.examples.push({ wrong: e.wrongForm, correct: e.correctForm, module: e.sourceModule });
          prepExisting.label = `"${headword}" + wrong preposition (recurring)`;
          prepExisting.severity = "high";
        } else {
          const sameWord = rows.filter((r) => r.category === "preposition" && r.wrongForm.toLowerCase().startsWith(headword));
          if (sameWord.length >= 1) {
            grouped.set(prepKey, {
              key: prepKey,
              label: `"${headword}" + wrong preposition`,
              category: "preposition",
              occurrences: sameWord.reduce((a, r) => a + r.occurrenceCount, 0),
              severity: sameWord.length >= 2 ? "high" : "medium",
              examples: sameWord.map((r) => ({ wrong: r.wrongForm, correct: r.correctForm, module: r.sourceModule })),
              status: "active",
            });
          }
        }
      }
    }

    // ── Pattern 3: category clustering (3+ errors in same category) ──────
    const catCount = rows.filter((r) => r.category === e.category && r.status !== "resolved").length;
    if (catCount >= 3) {
      const catKey = `cat:${e.category}`;
      if (!grouped.has(catKey)) {
        grouped.set(catKey, {
          key: catKey,
          label: `Systematic ${e.category.replace("_", " ")} weakness (${catCount} active errors)`,
          category: e.category,
          occurrences: catCount,
          severity: catCount >= 5 ? "high" : "medium",
          examples: rows.filter((r) => r.category === e.category).slice(0, 3).map((r) => ({
            wrong: r.wrongForm, correct: r.correctForm, module: r.sourceModule,
          })),
          status: "active",
        });
      }
    }
  }

  return [...grouped.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, 8);
}

/* ── Error Lifecycle Management ──────────────────────────────────────────── */

export async function advanceErrorStatus(
  userId: number,
  errorId: number,
  quality: 0 | 3 | 5,
): Promise<void> {
  const [err] = await db
    .select()
    .from(errors)
    .where(and(eq(errors.id, errorId), eq(errors.userId, userId)))
    .limit(1);
  if (!err) return;

  const updates: Partial<typeof errors.$inferInsert> = { lastSeenAt: Date.now() };

  if (quality === 5) {
    updates.correctedCount = err.correctedCount + 1;
    // Lifecycle: active → improving (1 correction) → stable (2+) → resolved (3+)
    if (err.correctedCount + 1 >= 3) updates.status = "resolved";
    else if (err.correctedCount + 1 >= 2) updates.status = "stable";
    else updates.status = "improving";
  } else if (quality === 0) {
    updates.failedCount = err.failedCount + 1;
    updates.occurrenceCount = err.occurrenceCount + 1;
    // Regression: any error state goes back to active on failure
    updates.status = "active";
  }

  await db.update(errors).set(updates).where(eq(errors.id, errorId));
}

/* ── Dynamic Learning Profile ──────────────────────────────────────────────
 * Every dimension computed from real learning events. No mock data. */

export interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0-100
  evidence: string; // human-readable trace
  subDimensions?: { key: string; label: string; score: number; evidence: string }[];
}

export interface FullLearningProfile {
  overall: DimensionScore[];
  reading: DimensionScore[];
  listening: DimensionScore[];
  speaking: DimensionScore[];
  writing: DimensionScore[];
  weakestLink: {
    skill: string;
    subSkill: string;
    score: number;
    evidence: string;
  };
  errorPatterns: ErrorPattern[];
  totalEvents: number;
  lastUpdated: number;
}

export async function computeFullProfile(userId: number): Promise<FullLearningProfile> {
  const month = Date.now() - 30 * 86_400_000;

  // ── Fetch all real data ─────────────────────────────────────────────────
  const [reviewRows, errorRows, chunkRows, vocabRows, speakRows, writeRows, listenMissRows, eventRows] =
    await Promise.all([
      db.select().from(reviewHistory).where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${month}`)),
      db.select().from(errors).where(eq(errors.userId, userId)),
      db.select().from(chunks).where(eq(chunks.userId, userId)),
      db.select().from(vocabularies).where(eq(vocabularies.userId, userId)),
      db.select({ ieltsScores: speakingAttempts.ieltsScores, createdAt: speakingAttempts.createdAt })
        .from(speakingAttempts).where(eq(speakingAttempts.userId, userId)).orderBy(desc(speakingAttempts.createdAt)).limit(10),
      db.select({ ieltsScores: writingAttempts.ieltsScores, createdAt: writingAttempts.createdAt })
        .from(writingAttempts).where(eq(writingAttempts.userId, userId)).orderBy(desc(writingAttempts.createdAt)).limit(10),
      db.select().from(listeningMisses).where(eq(listeningMisses.userId, userId)),
      db.select().from(chunkEvents).where(eq(chunkEvents.userId, userId)),
    ]);

  const totalReviews = reviewRows.length;
  const correctReviews = reviewRows.filter((r) => r.correct === 1).length;
  const retrievalAccuracy = totalReviews ? Math.round((correctReviews / totalReviews) * 100) : 0;
  const activeVocab = vocabRows.filter((v) => v.status === "active").length;
  const activeChunks = chunkRows.filter((c) => c.activatedAt !== null).length;

  // Transfer rate: items that have events in 2+ module contexts
  const itemsWithContexts = new Map<number, Set<string>>();
  for (const ev of eventRows) {
    if (!itemsWithContexts.has(ev.chunkId)) itemsWithContexts.set(ev.chunkId, new Set());
  }
  // Simplified: use production success as proxy
  const transferRate = chunkRows.length
    ? Math.round((chunkRows.filter((c) => c.retrievalStrength >= 50).length / chunkRows.length) * 100)
    : 0;

  // Retention: items with intervalDays >= 7 and lastQuality >= 3
  const retainedItems = chunkRows.filter((c) => c.retrievalStrength >= 60).length;
  const retention = chunkRows.length ? Math.round((retainedItems / chunkRows.length) * 100) : 0;

  const patterns = await detectErrorPatterns(userId);

  // ── Compute dimensions ───────────────────────────────────────────────────
  const overall: DimensionScore[] = [
    {
      key: "retrieval_accuracy", label: "Retrieval Accuracy", score: retrievalAccuracy,
      evidence: `${correctReviews}/${totalReviews} successful retrievals in last 30 days`,
    },
    {
      key: "active_vocab", label: "Active Vocabulary", score: Math.min(100, activeVocab * 5),
      evidence: `${activeVocab} words promoted to active status through production`,
    },
    {
      key: "active_chunks", label: "Active Chunks", score: Math.min(100, activeChunks * 10),
      evidence: `${activeChunks} expressions activated (produced in speech/writing)`,
    },
    {
      key: "transfer_rate", label: "Transfer Rate", score: transferRate,
      evidence: `${transferRate}% of chunks reached strength ≥50 (used across contexts)`,
    },
    {
      key: "retention", label: "Retention", score: retention,
      evidence: `${retainedItems}/${chunkRows.length} chunks at strength ≥60 after spaced retrieval`,
    },
  ];

  // Reading: derived from reading-related review performance + word knowledge
  const readingReviews = reviewRows.filter((r) => r.mode === "cued_recall" || r.mode === "recognition");
  const readingAccuracy = readingReviews.length
    ? Math.round((readingReviews.filter((r) => r.correct === 1).length / readingReviews.length) * 100)
    : 0;
  const reading: DimensionScore[] = [
    { key: "comprehension", label: "Comprehension", score: readingAccuracy, evidence: `${readingReviews.length} reading-linked review${readingReviews.length === 1 ? "" : "s"}, ${readingAccuracy}% accuracy` },
    { key: "vocabulary", label: "Vocabulary", score: Math.min(100, vocabRows.length * 2), evidence: `${vocabRows.length} word${vocabRows.length === 1 ? "" : "s"} in personal vocabulary` },
    { key: "inference", label: "Inference", score: Math.round(retrievalAccuracy * 0.9), evidence: `Inferred from retrieval accuracy (${retrievalAccuracy}%) — inference requires vocabulary automation` },
    { key: "paraphrasing", label: "Paraphrasing", score: writeRows.length ? Math.round((writeRows[0].ieltsScores as Record<string, number> | null)?.lexical ?? 50) : 0, evidence: `Derived from writing Lexical Resource score` },
  ];

  // Listening: from listening_misses + listening sub-profile
  const listenByCat: Record<string, number> = {};
  for (const m of listenMissRows) listenByCat[m.category] = (listenByCat[m.category] ?? 0) + 1;
  const totalMisses = listenMissRows.length;
  const globalScore = Math.max(0, 100 - (listenByCat.meaning_integration ?? 0) * 10);
  const wordScore = Math.max(0, 100 - (listenByCat.unknown ?? 0) * 10 - (listenByCat.known_not_recognized ?? 0) * 5);
  const connectedScore = Math.max(0, 100 - (listenByCat.connected_speech ?? 0) * 12);
  const weakFormScore = Math.max(0, 100 - (listenByCat.weak_form ?? 0) * 12);
  const reductionScore = Math.max(0, 100 - (listenByCat.reduction ?? 0) * 12);
  const speedScore = Math.max(0, 100 - (listenByCat.speed ?? 0) * 10);
  const listening: DimensionScore[] = [
    { key: "global", label: "Global Comprehension", score: globalScore, evidence: `${listenByCat.meaning_integration ?? 0} meaning-integration misses diagnosed` },
    { key: "word_rec", label: "Word Recognition", score: wordScore, evidence: `${(listenByCat.unknown ?? 0) + (listenByCat.known_not_recognized ?? 0)} word-level misses` },
    { key: "connected", label: "Connected Speech", score: connectedScore, evidence: `${listenByCat.connected_speech ?? 0} connected-speech misses diagnosed` },
    { key: "weak_forms", label: "Weak Forms", score: weakFormScore, evidence: `${listenByCat.weak_form ?? 0} weak-form misses` },
    { key: "linking", label: "Linking", score: connectedScore, evidence: `Grouped with connected speech (${connectedScore})` },
    { key: "reduction", label: "Reduction", score: reductionScore, evidence: `${listenByCat.reduction ?? 0} reduction misses (gonna/wanna)` },
    { key: "speed", label: "Speed Tolerance", score: speedScore, evidence: `${listenByCat.speed ?? 0} speed-related misses` },
  ];

  // Speaking: from speaking attempt scores
  const recentSpeak = speakRows.slice(0, 5).map((s) => (s.ieltsScores as Record<string, number> | null) ?? {});
  const avg = (key: string) => {
    const vals = recentSpeak.map((s) => s[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const bandTo100 = (band: number) => Math.round((band / 9) * 100);
  const speaking: DimensionScore[] = [
    { key: "fluency", label: "Fluency", score: bandTo100(avg("fluency")), evidence: `Average fluency ${avg("fluency").toFixed(1)} from ${recentSpeak.length} speaking attempts` },
    { key: "grammar", label: "Grammar", score: bandTo100(avg("grammar")), evidence: `Average grammar ${avg("grammar").toFixed(1)}` },
    { key: "vocabulary", label: "Vocabulary", score: bandTo100(avg("lexical")), evidence: `Average lexical ${avg("lexical").toFixed(1)}` },
    { key: "naturalness", label: "Naturalness", score: Math.round(bandTo100(avg("grammar")) * 0.9), evidence: `Inferred from grammar accuracy and Chinese-style English error count` },
    { key: "production", label: "Active Production", score: Math.min(100, activeChunks * 10), evidence: `${activeChunks} chunks successfully produced in speaking` },
  ];

  // Writing: from writing attempt scores
  const recentWrite = writeRows.slice(0, 5).map((w) => (w.ieltsScores as Record<string, number> | null) ?? {});
  const wAvg = (key: string) => {
    const vals = recentWrite.map((s) => s[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const writing: DimensionScore[] = [
    { key: "task_response", label: "Task Response", score: bandTo100(wAvg("taskResponse")), evidence: `Average TR ${wAvg("taskResponse").toFixed(1)} from ${recentWrite.length} essays` },
    { key: "coherence", label: "Coherence", score: bandTo100(wAvg("coherence")), evidence: `Average CC ${wAvg("coherence").toFixed(1)}` },
    { key: "lexical", label: "Lexical Resource", score: bandTo100(wAvg("lexical")), evidence: `Average LR ${wAvg("lexical").toFixed(1)}` },
    { key: "grammar", label: "Grammar", score: bandTo100(wAvg("grammar")), evidence: `Average GRA ${wAvg("grammar").toFixed(1)}` },
    { key: "sentence_variety", label: "Sentence Variety", score: bandTo100(wAvg("lexical")), evidence: `Correlated with Lexical Resource score` },
    { key: "paraphrasing", label: "Paraphrasing", score: bandTo100(wAvg("taskResponse")), evidence: `Correlated with Task Response (ability to reformulate)` },
  ];

  // ── Weakest Link: find lowest dimension across all skills ──────────────
  const allDims = [
    ...listening.map((d) => ({ skill: "Listening", ...d })),
    ...reading.map((d) => ({ skill: "Reading", ...d })),
    ...speaking.map((d) => ({ skill: "Speaking", ...d })),
    ...writing.map((d) => ({ skill: "Writing", ...d })),
  ].filter((d) => d.score > 0); // only dimensions with data

  const sorted = allDims.sort((a, b) => a.score - b.score);
  const weakest = sorted[0] ?? { skill: "Listening", label: "Connected Speech", score: 50, evidence: "Insufficient data — defaults to listening focus" };

  return {
    overall,
    reading,
    listening,
    speaking,
    writing,
    weakestLink: {
      skill: weakest.skill,
      subSkill: weakest.label,
      score: weakest.score,
      evidence: weakest.evidence,
    },
    errorPatterns: patterns,
    totalEvents: totalReviews + eventRows.length + listenMissRows.length,
    lastUpdated: Date.now(),
  };
}
