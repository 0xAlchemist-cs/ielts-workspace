/* Exam learning goals — shared by client chrome and server resolution.
 * Pure constants/types only (no imports): safe for client bundles. */

export type ExamProfile = "ielts" | "cet4" | "cet6";

export const EXAM_PROFILES: { value: ExamProfile; label: string; zh: string }[] = [
  { value: "ielts", label: "IELTS", zh: "雅思" },
  { value: "cet4", label: "CET-4", zh: "四级" },
  { value: "cet6", label: "CET-6", zh: "六级" },
];

export function isExamProfile(v: string | null | undefined): v is ExamProfile {
  return v === "ielts" || v === "cet4" || v === "cet6";
}
