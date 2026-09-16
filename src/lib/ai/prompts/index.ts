/* ── AI prompt profiles per exam goal (V8) ──────────────────────────────────
 * Shared rules live here; exam-specific learning priorities live in the
 * sibling files. The profile is appended to task prompts as context — task
 * schemas stay identical across exams, so parsing/validation never branches. */

import type { ExamProfile } from "@/lib/exam-profiles";
import { CET4_PROMPT, CET6_PROMPT, IELTS_PROMPT } from "./profiles";

export const BASE_PROMPT_RULES = `
Honesty rules (always):
- NEVER claim a word/expression "is CET-4/CET-6/IELTS vocabulary" unless you are quoting exam metadata you were given. Classification from your own judgement must be phrased as an inference: "useful for CET-4-level learning", "relevant to CET-6-style academic reading".
- Do not select vocabulary merely because it is difficult. Select what is USEFUL and REUSABLE for this learner's goal.
- Lead with the few things worth learning (default: 3). Full detail stays available, but the summary must be short and human.
- Reply in the exact JSON shape the task specifies — never add fields.`;

export function examPromptProfile(exam: ExamProfile): string {
  const focus =
    exam === "cet4" ? CET4_PROMPT : exam === "cet6" ? CET6_PROMPT : IELTS_PROMPT;
  return `The learner's goal: ${exam === "ielts" ? "IELTS" : exam === "cet4" ? "CET-4 (College English Test Band 4)" : "CET-6 (College English Test Band 6)"}.
${focus}
${BASE_PROMPT_RULES}`;
}
