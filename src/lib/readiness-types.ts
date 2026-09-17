/* Readiness types + state text — client-safe (no server imports).
 * The derived service lives in server/services/readiness.ts; both share
 * these shapes. */

export type ReadinessState = "none" | "building" | "needs_work" | "on_track" | "strong";

export interface SkillReadiness {
  skill: string;
  label: { en: string; zh: string };
  state: ReadinessState;
  why: { en: string; zh: string };
  evidenceCount: number;
  devExplanation: { evidence: string[]; state: string };
}

export interface ReadinessSnapshot {
  exam: string;
  targetBand: number | null;
  skills: SkillReadiness[];
  topGap: { skill: string; label: { en: string; zh: string } } | null;
}

export const READINESS_STATE_TEXT: Record<ReadinessState, { en: string; zh: string }> = {
  none: { en: "Not enough evidence yet", zh: "证据还不够" },
  building: { en: "Building", zh: "积累中" },
  needs_work: { en: "Needs work", zh: "需要加强" },
  on_track: { en: "On track", zh: "在正轨上" },
  strong: { en: "Strong evidence", zh: "证据充分" },
};

export function readinessStateText(state: ReadinessState) {
  return READINESS_STATE_TEXT[state];
}
