/* ── Evidence Policy (step-06) ──────────────────────────────────────────────
 * The single source of truth for what a piece of learning evidence IS and
 * what it may be used FOR. Every consumer of scores/bands resolves through
 * these gates — no more per-file inline rules that drift apart.
 *
 * ── Source → can prove → cannot prove ────────────────────────────────────
 *  ai_band_live       | verified writing/speaking band from a live AI
 *                     |   grading (feedback.isMock !== true) — CAN feed
 *                     |   ability scoring & readiness states; CANNOT
 *                     |   impersonate an official exam result.
 *  ai_band_mock       | offline fallback output after a live error
 *                     |   (feedback.isMock === true) — practice record
 *                     |   only; CANNOT feed any ability metric.
 *  deterministic_grade| engine-graded retrieval / IELTS-practice answers
 *                     |   (gradeRetrieval, evaluateAttempt) — CAN feed
 *                     |   ability scoring; measures practice, not the exam.
 *  behavioral_event   | chunkEvents ledger (use/transfer/success events,
 *                     |   written only on quality-5 production) — CAN
 *                     |   prove an act happened; no score semantics.
 *  self_report        | externalSessions the learner logged by hand —
 *                     |   engagement/display only; never a band, never a
 *                     |   gate into on_track/needs_work scoring.
 *
 * Legacy compatibility: rows persisted before the isMock stamp exist
 * (feedback without isMock, or null) — they are TRUSTED as live. The
 * policy never fabricates a verified mark, and never demotes real old
 * data. Mock-ness is only ever claimed by an explicit isMock:true stamp. */

export type EvidenceSource =
  | "ai_band_live"
  | "ai_band_mock"
  | "deterministic_grade"
  | "behavioral_event"
  | "self_report";

export type EvidenceUse = "ability_scoring" | "readiness_state" | "engagement" | "display";

/** Which uses each source may participate in. */
export const USABLE_FOR: Record<EvidenceSource, EvidenceUse[]> = {
  ai_band_live: ["ability_scoring", "readiness_state", "engagement", "display"],
  ai_band_mock: ["display"],
  deterministic_grade: ["ability_scoring", "readiness_state", "engagement", "display"],
  behavioral_event: ["engagement", "display"],
  self_report: ["engagement", "display"],
};

export function isUsableFor(source: EvidenceSource, use: EvidenceUse): boolean {
  return USABLE_FOR[source].includes(use);
}

/** The persisted shape every graded attempt carries (feedback JSON column +
 *  ieltsScores JSON column). feedback carries isMock at its TOP level. */
export interface AttemptEvidenceRow {
  feedback: unknown;
  scores: unknown;
}

/** Mock gate — one rule everywhere (was inlined separately in readiness.ts
 *  and learning-profile.ts; progress.ts had none at all). Explicit
 *  isMock:true → mock. Everything else — including legacy rows without the
 *  stamp and null feedback — is trusted as a real graded row. */
export function isMockFeedback(feedback: unknown): boolean {
  const fb = feedback as { isMock?: unknown } | null;
  return fb?.isMock === true;
}

/** Resolve the overall band of a graded attempt under the policy: live rows
 *  read feedback.overallEstimate first, then the legacy
 *  ieltsScores.overallEstimate shape; mock rows resolve to undefined —
 *  their heuristic estimate is never exam evidence. */
export function attemptBandEvidence(row: AttemptEvidenceRow): number | undefined {
  if (isMockFeedback(row.feedback)) return undefined;
  const fb = row.feedback as { overallEstimate?: unknown } | null;
  const fromFeedback = fb?.overallEstimate;
  if (typeof fromFeedback === "number" && fromFeedback > 0) return fromFeedback;
  const fromScores = (row.scores as { overallEstimate?: unknown } | null)?.overallEstimate;
  if (typeof fromScores === "number" && fromScores > 0) return fromScores;
  return undefined;
}

/** Classify an attempt row's evidence source (mock vs live AI band). */
export function classifyAttemptEvidence(row: { feedback: unknown }): EvidenceSource {
  return isMockFeedback(row.feedback) ? "ai_band_mock" : "ai_band_live";
}
