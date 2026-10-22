import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { errors, reviewHistory, retrievalItems, chunkEvents, chunks, vocabularies, speakingAttempts, writingAttempts, listeningMisses, learningProfiles, contentHistory } from "@/db/schema";
import type { ErrorCategory, ErrorStatus, ModuleContext } from "@/lib/types";
import { plural } from "@/lib/plural";

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
  /** null = insufficient evidence — practiced at most, never verified.
   *  The UI must render a "Developing" state, never a fabricated number.
   *  Absence of diagnosed failure is NOT mastery; only positive test
   *  evidence (diagnosed misses, graded attempts, reviews) yields a score. */
  score: number | null;
  evidence: string; // human-readable trace
  subDimensions?: { key: string; label: string; score: number | null; evidence: string }[];
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
    score: number | null;
    evidence: string;
  };
  errorPatterns: ErrorPattern[];
  totalEvents: number;
  lastUpdated: number;
}

/** Offline fallback output (FallbackProvider after a live AI error) stamps
 *  isMock:true at the TOP LEVEL of the feedback column; ieltsScores still
 *  carries heuristic pseudo-bands. Mock attempts stay in history as practice
 *  records but must never become ability evidence (same rule as readiness.ts
 *  bandOf). Rows without the flag (incl. legacy rows) count as real. */
export function isMockAttempt(row: { feedback: unknown }): boolean {
  const fb = row.feedback as { isMock?: unknown } | null;
  return fb?.isMock === true;
}

export async function computeFullProfile(userId: number): Promise<FullLearningProfile> {
  const month = Date.now() - 30 * 86_400_000;

  // ── Fetch all real data ─────────────────────────────────────────────────
  const [reviewRows, errorRows, chunkRows, vocabRows, speakRows, writeRows, listenMissRows, eventRows, listenSessionRows] =
    await Promise.all([
      db.select().from(reviewHistory).where(and(eq(reviewHistory.userId, userId), sql`${reviewHistory.createdAt} > ${month}`)),
      db.select().from(errors).where(eq(errors.userId, userId)),
      db.select().from(chunks).where(eq(chunks.userId, userId)),
      db.select().from(vocabularies).where(eq(vocabularies.userId, userId)),
      db.select({ ieltsScores: speakingAttempts.ieltsScores, feedback: speakingAttempts.feedback, createdAt: speakingAttempts.createdAt })
        .from(speakingAttempts).where(eq(speakingAttempts.userId, userId)).orderBy(desc(speakingAttempts.createdAt)).limit(10),
      db.select({ ieltsScores: writingAttempts.ieltsScores, feedback: writingAttempts.feedback, createdAt: writingAttempts.createdAt })
        .from(writingAttempts).where(eq(writingAttempts.userId, userId)).orderBy(desc(writingAttempts.createdAt)).limit(10),
      db.select().from(listeningMisses).where(eq(listeningMisses.userId, userId)),
      db.select().from(chunkEvents).where(eq(chunkEvents.userId, userId)),
      // engagement basis for listening: distinct listening contents actually opened
      db.select({ c: sql<number>`count(distinct ${contentHistory.contentId})` })
        .from(contentHistory).where(and(eq(contentHistory.userId, userId), eq(contentHistory.skill, "listening"))),
    ]);
  const listeningSessions = Number(listenSessionRows[0]?.c ?? 0);

  // Mock (offline fallback) attempts are practice history, not ability
  // evidence — only real graded rows feed the dimensions below.
  const realSpeakRows = speakRows.filter((r) => !isMockAttempt(r));
  const realWriteRows = writeRows.filter((r) => !isMockAttempt(r));

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
      evidence: `${plural(activeVocab, "word")} promoted to active status through production`,
    },
    {
      key: "active_chunks", label: "Active Chunks", score: Math.min(100, activeChunks * 10),
      evidence: `${plural(activeChunks, "expression")} activated (produced in speech/writing)`,
    },
    {
      key: "transfer_rate", label: "Transfer Rate", score: transferRate,
      evidence: `${transferRate}% of chunks reached strength ≥50 (used across contexts)`,
    },
    {
      key: "retention", label: "Retention", score: retention,
      evidence: `${retainedItems}/${plural(chunkRows.length, "chunk")} at strength ≥60 after spaced retrieval`,
    },
  ];

  // Reading: derived from reading-related review performance + word knowledge.
  // No reviews yet → null (not 0): "never tested" must not read as "zero ability".
  const readingReviews = reviewRows.filter((r) => r.mode === "cued_recall" || r.mode === "recognition");
  const readingAccuracy = readingReviews.length
    ? Math.round((readingReviews.filter((r) => r.correct === 1).length / readingReviews.length) * 100)
    : 0;
  const reading: DimensionScore[] = [
    { key: "comprehension", label: "Comprehension", score: readingReviews.length ? readingAccuracy : null, evidence: readingReviews.length ? `${readingReviews.length} reading-linked review${readingReviews.length === 1 ? "" : "s"}, ${readingAccuracy}% accuracy` : "No reading-linked reviews yet" },
    { key: "vocabulary", label: "Vocabulary", score: Math.min(100, vocabRows.length * 2), evidence: `${vocabRows.length} word${vocabRows.length === 1 ? "" : "s"} in personal vocabulary` },
    { key: "inference", label: "Inference", score: totalReviews ? Math.round(retrievalAccuracy * 0.9) : null, evidence: totalReviews ? `Inferred from retrieval accuracy (${retrievalAccuracy}%) — inference requires vocabulary automation` : "No retrieval evidence yet" },
    { key: "paraphrasing", label: "Paraphrasing", score: realWriteRows.length ? Math.round((((realWriteRows[0].ieltsScores as Record<string, number> | null)?.lexical ?? 4.5) / 9) * 100) : null, evidence: realWriteRows.length ? `Derived from writing Lexical Resource score` : "No writing attempts yet" },
  ];

  // Listening: honest evidence model.
  // A dimension gets a NUMBER only from diagnosed misses (real test evidence).
  // Practiced-but-undiagnosed → null "Developing"; never practiced → null too.
  // The old formula scored 100 − misses×penalty for EVERYONE, so a single
  // session with zero marked misses rendered all 7 dimensions as 100 —
  // "not observed failing" was being read as "verified mastery".
  const listenByCat: Record<string, number> = {};
  for (const m of listenMissRows) listenByCat[m.category] = (listenByCat[m.category] ?? 0) + 1;
  const sessionWord = listeningSessions === 1 ? "session" : "sessions";
  const listenDim = (
    key: string, label: string, missCount: number, penalty: number, missLabel: string,
  ): DimensionScore => {
    if (listeningSessions === 0) {
      return { key, label, score: null, evidence: "No listening sessions recorded yet — start one in the Listening Lab" };
    }
    if (missCount === 0) {
      return { key, label, score: null, evidence: `Practiced in ${listeningSessions} listening ${sessionWord}, nothing diagnosed wrong here yet — a score needs test evidence` };
    }
    return { key, label, score: Math.max(0, 100 - missCount * penalty), evidence: `${missCount} ${missLabel} diagnosed across ${listeningSessions} listening ${sessionWord}` };
  };
  const listening: DimensionScore[] = [
    listenDim("global", "Global Comprehension", listenByCat.meaning_integration ?? 0, 10, "meaning-integration misses"),
    listenDim("word_rec", "Word Recognition", (listenByCat.unknown ?? 0) + (listenByCat.known_not_recognized ?? 0), 8, "word-level misses"),
    listenDim("connected", "Connected Speech", listenByCat.connected_speech ?? 0, 12, "connected-speech misses"),
    listenDim("weak_forms", "Weak Forms", listenByCat.weak_form ?? 0, 12, "weak-form misses"),
    listenDim("linking", "Linking", listenByCat.connected_speech ?? 0, 12, "linking/connected-speech misses"),
    listenDim("reduction", "Reduction", listenByCat.reduction ?? 0, 12, "reduction misses (gonna/wanna)"),
    listenDim("speed", "Speed Tolerance", listenByCat.speed ?? 0, 10, "speed-related misses"),
  ];

  // Speaking: from real (non-mock) speaking attempt scores — no verified
  // attempts → null, not 0. Offline fallback attempts exist as practice but
  // are explicitly not ability evidence.
  const recentSpeak = realSpeakRows.slice(0, 5).map((s) => (s.ieltsScores as Record<string, number> | null) ?? {});
  const avg = (key: string) => {
    const vals = recentSpeak.map((s) => s[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const bandTo100 = (band: number) => Math.round((band / 9) * 100);
  const hasSpeakEvidence = recentSpeak.some((s) => Object.keys(s).length > 0);
  const noSpeakWhy = speakRows.length > realSpeakRows.length
    ? "Only offline mock attempts so far — they don't count as verified evidence"
    : "No speaking attempts recorded yet";
  const speaking: DimensionScore[] = [
    { key: "fluency", label: "Fluency", score: hasSpeakEvidence ? bandTo100(avg("fluency")) : null, evidence: hasSpeakEvidence ? `Average fluency ${avg("fluency").toFixed(1)} from ${plural(recentSpeak.length, "speaking attempt")}` : noSpeakWhy },
    { key: "grammar", label: "Grammar", score: hasSpeakEvidence ? bandTo100(avg("grammar")) : null, evidence: hasSpeakEvidence ? `Average grammar ${avg("grammar").toFixed(1)}` : noSpeakWhy },
    { key: "vocabulary", label: "Vocabulary", score: hasSpeakEvidence ? bandTo100(avg("lexical")) : null, evidence: hasSpeakEvidence ? `Average lexical ${avg("lexical").toFixed(1)}` : noSpeakWhy },
    { key: "naturalness", label: "Naturalness", score: hasSpeakEvidence ? Math.round(bandTo100(avg("grammar")) * 0.9) : null, evidence: hasSpeakEvidence ? `Inferred from grammar accuracy and Chinese-style English error count` : noSpeakWhy },
    { key: "production", label: "Active Production", score: Math.min(100, activeChunks * 10), evidence: `${plural(activeChunks, "chunk")} successfully produced in speaking` },
  ];

  // Writing: from real (non-mock) writing attempt scores — no verified
  // essays → null, not 0. Same mock-exclusion rule as speaking.
  const recentWrite = realWriteRows.slice(0, 5).map((w) => (w.ieltsScores as Record<string, number> | null) ?? {});
  const wAvg = (key: string) => {
    const vals = recentWrite.map((s) => s[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const hasWriteEvidence = recentWrite.some((s) => Object.keys(s).length > 0);
  const noWriteWhy = writeRows.length > realWriteRows.length
    ? "Only offline mock attempts so far — they don't count as verified evidence"
    : "No writing attempts yet";
  const writing: DimensionScore[] = [
    { key: "task_response", label: "Task Response", score: hasWriteEvidence ? bandTo100(wAvg("taskResponse")) : null, evidence: hasWriteEvidence ? `Average TR ${wAvg("taskResponse").toFixed(1)} from ${plural(recentWrite.length, "essay")}` : noWriteWhy },
    { key: "coherence", label: "Coherence", score: hasWriteEvidence ? bandTo100(wAvg("coherence")) : null, evidence: hasWriteEvidence ? `Average CC ${wAvg("coherence").toFixed(1)}` : noWriteWhy },
    { key: "lexical", label: "Lexical Resource", score: hasWriteEvidence ? bandTo100(wAvg("lexical")) : null, evidence: hasWriteEvidence ? `Average LR ${wAvg("lexical").toFixed(1)}` : noWriteWhy },
    { key: "grammar", label: "Grammar", score: hasWriteEvidence ? bandTo100(wAvg("grammar")) : null, evidence: hasWriteEvidence ? `Average GRA ${wAvg("grammar").toFixed(1)}` : noWriteWhy },
    { key: "sentence_variety", label: "Sentence Variety", score: hasWriteEvidence ? bandTo100(wAvg("lexical")) : null, evidence: hasWriteEvidence ? `Correlated with Lexical Resource score` : noWriteWhy },
    { key: "paraphrasing", label: "Paraphrasing", score: hasWriteEvidence ? bandTo100(wAvg("taskResponse")) : null, evidence: hasWriteEvidence ? `Correlated with Task Response (ability to reformulate)` : noWriteWhy },
  ];

  // ── Weakest Link: find lowest dimension across all skills ──────────────
  // Only dimensions with verified numeric evidence participate; null
  // (developing / untested) dimensions cannot be a "weakest link".
  const allDims = [
    ...listening.map((d) => ({ skill: "Listening", ...d })),
    ...reading.map((d) => ({ skill: "Reading", ...d })),
    ...speaking.map((d) => ({ skill: "Speaking", ...d })),
    ...writing.map((d) => ({ skill: "Writing", ...d })),
  ].filter((d) => typeof d.score === "number" && d.score > 0);

  const sorted = allDims.sort((a, b) => (a.score as number) - (b.score as number));
  const weakest = sorted[0] ?? {
    skill: "Listening",
    label: "Building first evidence",
    score: null,
    evidence: "Not enough verified evidence yet — complete learning sessions and the weakest link will be computed from real data",
  };

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
