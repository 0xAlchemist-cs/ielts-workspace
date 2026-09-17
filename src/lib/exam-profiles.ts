/* Exam learning goals — shared by client chrome and server resolution.
 * Pure constants/types only (no imports): safe for client bundles.
 *
 * V12 ExamConfig: the single place that declares WHAT DIFFERS between exam
 * goals. Shared engines ask this instead of scattering `=== "ielts"` checks;
 * adding a future exam means adding one entry here, not touching engines. */

export type ExamProfile = "ielts" | "cet4" | "cet6";

export const EXAM_PROFILES: { value: ExamProfile; label: string; zh: string }[] = [
  { value: "ielts", label: "IELTS", zh: "雅思" },
  { value: "cet4", label: "CET-4", zh: "四级" },
  { value: "cet6", label: "CET-6", zh: "六级" },
];

export function isExamProfile(v: string | null | undefined): v is ExamProfile {
  return v === "ielts" || v === "cet4" || v === "cet6";
}

export interface ExamConfig {
  id: ExamProfile;
  /** short UI label ("CET-4") */
  label: string;
  zh: string;
  /** full name for AI prompt composition */
  longLabel: string;
  /** V9 difficulty personalization layer (level step, Settings card, classifier) */
  hasCefrLayer: boolean;
  /** external speaking coach task card (IELTS-only by product decision) */
  hasSpeakingCoach: boolean;
  /** AI difficulty classification on import */
  hasContentClassifier: boolean;
  /** engine routes locked to IELTS until real CET exam engines exist
   * (nav hides them outside IELTS — never faked) */
  examLockedRoutes: string[];
}

export const EXAM_CONFIG: Record<ExamProfile, ExamConfig> = {
  ielts: {
    id: "ielts",
    label: "IELTS",
    zh: "雅思",
    longLabel: "IELTS",
    hasCefrLayer: true,
    hasSpeakingCoach: true,
    hasContentClassifier: true,
    examLockedRoutes: ["/writing", "/ielts"],
  },
  cet4: {
    id: "cet4",
    label: "CET-4",
    zh: "四级",
    longLabel: "CET-4 (College English Test Band 4)",
    hasCefrLayer: false,
    hasSpeakingCoach: false,
    hasContentClassifier: false,
    examLockedRoutes: [],
  },
  cet6: {
    id: "cet6",
    label: "CET-6",
    zh: "六级",
    longLabel: "CET-6 (College English Test Band 6)",
    hasCefrLayer: false,
    hasSpeakingCoach: false,
    hasContentClassifier: false,
    examLockedRoutes: [],
  },
};

export function examConfig(exam: ExamProfile): ExamConfig {
  return EXAM_CONFIG[exam] ?? EXAM_CONFIG.ielts;
}

/** Which exam owns a locked engine route ("/writing", "/ielts")? null = free
 * for every goal. The owner shows it; everyone else hides it — one lookup
 * replaces scattered per-route flags. */
export function lockedRouteOwner(path: string): ExamProfile | null {
  for (const cfg of Object.values(EXAM_CONFIG)) {
    if (cfg.examLockedRoutes.some((r) => path.startsWith(r))) return cfg.id;
  }
  return null;
}
