import { lemmaCandidates, normalizeText } from "@/lib/text";
import type { RetrievalGrade } from "@/lib/types";

// ── Local retrieval grader (deterministic, works offline) ───────────────────
// Used directly in mock mode and as the first pass in live mode.

export interface GradeTarget {
  itemType: "chunk" | "vocab" | "grammar" | "error" | "sentence_pattern" | "spoken_pattern";
  chunkText?: string;
  pattern?: string;
  headword?: string;
  wrongForm?: string;
  correctForm?: string;
  examples?: string[];
  /** recognition mode (multiple choice): a wrong choice is a clean 0, not "close spelling" */
  exactMatch?: boolean;
}

const PLACEHOLDER_TOKENS = new Set([
  "doing", "verb", "noun", "sth", "sb", "somebody", "something", "clause", "ing",
  "a", "an", "x",
]);

function coreTokens(text: string): string[] {
  const raw = text
    .replace(/\(.*?\)/g, " ") // drop parenthetical "(that)"
    .replace(/\.\.\./g, " ")
    .replace(/\bA\b/g, " ");
  return normalizeText(raw)
    .split(" ")
    .filter((t) => t && !PLACEHOLDER_TOKENS.has(t));
}

function tokenMatches(userToken: string, targetToken: string): boolean {
  if (userToken === targetToken) return true;
  return lemmaCandidates(userToken).includes(targetToken);
}

export function gradeRetrieval(target: GradeTarget, response: string): RetrievalGrade {
  const userNorm = normalizeText(response);
  const userTokenSet = new Set(userNorm.split(" ").filter(Boolean));

  if (target.itemType === "error") {
    const wrong = normalizeText(target.wrongForm ?? "");
    const correct = normalizeText(target.correctForm ?? "");
    const hasWrong = !!wrong && userNorm.includes(wrong);
    const hasCorrect = !!correct && userNorm.includes(correct);
    let quality: 0 | 3 | 5 = 0;
    if (hasCorrect && !hasWrong) quality = 5;
    else if (hasCorrect && hasWrong) quality = 3;
    const verdict =
      quality === 5
        ? `Correct — you used "${target.correctForm}" and avoided "${target.wrongForm}".`
        : quality === 3
          ? `Almost — you wrote both "${target.correctForm}" and "${target.wrongForm}".`
          : `The correct form is "${target.correctForm}", not "${target.wrongForm}".`;
    return { quality, correct: quality === 5, verdict, targetAnswer: target.correctForm ?? "", missingPieces: quality === 5 ? [] : [target.correctForm ?? ""], isMock: true };
  }

  if (target.itemType === "vocab") {
    const head = (target.headword ?? "").toLowerCase().trim();
    const normHead = normalizeText(head);
    const single = userNorm.trim();
    let quality: 0 | 3 | 5 = 0;
    if (!single) quality = 0;
    else if (userTokenSet.has(normHead) || lemmaCandidates(single).includes(normHead)) quality = 5;
    else if (target.exactMatch) quality = 0; // wrong multiple-choice option
    else if (Math.abs(single.length - normHead.length) <= 2 && single[0] === normHead[0]) quality = 3;
    const verdict =
      quality === 5
        ? `Correct — "${head}".`
        : quality === 3
          ? `Very close — check the spelling/word form: "${head}".`
          : `The word was "${head}".`;
    return { quality, correct: quality === 5, verdict, targetAnswer: head, missingPieces: quality === 5 ? [] : [head], isMock: true };
  }

  // chunk / grammar — token coverage against the core of the expression
  const text = target.chunkText ?? target.pattern ?? "";
  const targets = coreTokens(text);
  if (!targets.length) {
    return { quality: 0, correct: false, verdict: "Nothing to compare.", targetAnswer: text, missingPieces: [], isMock: true };
  }
  const missing: string[] = [];
  let hit = 0;
  for (const t of targets) {
    let found = false;
    for (const u of userTokenSet) {
      if (tokenMatches(u, t)) {
        found = true;
        break;
      }
    }
    if (found) hit++;
    else missing.push(t);
  }
  const ratio = hit / targets.length;
  let quality: 0 | 3 | 5 = 0;
  if (ratio >= 0.85) quality = 5;
  else if (ratio >= 0.5) quality = 3;

  const example = target.examples?.[0] ?? text;
  const verdict =
    quality === 5
      ? `Retrieved — "${text}" used correctly.`
      : quality === 3
        ? `Partially retrieved — you missed: ${missing.map((m) => `"${m}"`).join(", ")}.`
        : `Not retrieved yet. The target expression was "${text}".`;
  return { quality, correct: quality === 5, verdict, targetAnswer: example, missingPieces: missing, isMock: true };
}
