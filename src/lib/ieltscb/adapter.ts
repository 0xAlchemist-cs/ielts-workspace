/* ── IELTSCB adapter — deterministic raw JSON → CanonicalReadingTest.
 *    No AI, no OCR, no guessing: every mapping is traceable to a site field,
 *    every doubt becomes a warning, every raw value is preserved. */

import type {
  CanonicalCoreWord,
  CanonicalEvidence,
  CanonicalExplanation,
  CanonicalPassage,
  CanonicalQuestion,
  CanonicalQuestionGroup,
  CanonicalQuestionType,
  CanonicalReadingTest,
  CanonicalSynonym,
  IeltscbReportData,
  IeltscbWarning,
} from "./types";
import type { IeltscbReportParams } from "./url";

/* ── HTML cleaning: keep semantic text, extract <sentence> evidence markers ── */

interface SentenceMarker {
  tag: string | null; // "Q1"
  questionId: string | null; // "676" — site analysis id space
  text: string;
}

/** Strip display markup to plain text (nbsp normalized). */
export function htmlToText(html: string): string {
  return html
    .replace(/<sentence\b[^>]*>/gi, "")
    .replace(/<\/sentence>/gi, "")
    .replace(/<space\b[^>]*>/gi, "____")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim();
}

/** Pull <sentence data-tag data-question> markers out of a paragraph's HTML. */
function extractSentenceMarkers(html: string): { markers: SentenceMarker[]; text: string } {
  const markers: SentenceMarker[] = [];
  for (const m of html.matchAll(/<sentence\b([^>]*)>([\s\S]*?)<\/sentence>/gi)) {
    const attrs = m[1];
    const tag = attrs.match(/data-tag=['"]([^'"]+)['"]/i)?.[1] ?? null;
    const questionId = attrs.match(/data-question=['"]([^'"]+)['"]/i)?.[1] ?? null;
    markers.push({ tag, questionId, text: htmlToText(m[2]) });
  }
  return { markers, text: htmlToText(html) };
}

/** <space data-sid data-number> slots inside input-group stems. */
interface SpaceSlot {
  sid: string;
  number: number;
}
function extractSpaceSlots(html: string): SpaceSlot[] {
  const slots: SpaceSlot[] = [];
  for (const m of html.matchAll(/<space\b([^>]*)>/gi)) {
    const sid = m[1].match(/data-sid=['"]([^'"]+)['"]/i)?.[1] ?? null;
    const num = m[1].match(/data-number=['"]([^'"]+)['"]/i)?.[1] ?? null;
    if (sid && num && /^\d+$/.test(num)) slots.push({ sid, number: Number(num) });
  }
  return slots;
}

/* ── answer normalization ─────────────────────────────────────────────────── */

/** Split fill-in variant strings. The site mixes "/" and "|" separators with
 *  curly quotes; keep variants verbatim (no invention), dedupe normalized. */
export function splitAnswerVariants(raw: string): string[] {
  const parts = raw
    .split(/[\/|]/)
    .map((s) => s.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

/** tolerant compare — mirrors the IELTS engine's norm() so local re-grading
 *  and the site's isright can be cross-checked (GRADING_MISMATCH warning). */
export function tolerantEqual(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

/** Dedupe a variant list by tolerant key (list answers "/" and card answers
 *  "|" carry the same variants — merged sources produce cosmetic doubles). */
export function dedupeVariants(variants: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const k = v.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Leading option letter ("B.  Egyptians" → "B"); null when none. */
function leadingLetter(s: string): string | null {
  const m = s.trim().match(/^([A-Za-z])(?=[\s.,：:]|$)/);
  return m ? m[1].toUpperCase() : null;
}

/** Compare a question-list answer against an answer-card correct answer:
 *  equal if letters match (both carry one) or texts match tolerantly. */
function answersAgree(listAnswer: string, cardAnswer: string): boolean {
  const la = leadingLetter(listAnswer);
  const ca = leadingLetter(cardAnswer);
  if (la && ca) return la === ca;
  if (la || ca) {
    // one has a letter, the other doesn't — compare the letter against text start
    const letter = la ?? ca;
    const other = la ? cardAnswer : listAnswer;
    return leadingLetter(other) === letter || tolerantEqual(listAnswer, cardAnswer);
  }
  const variants = splitAnswerVariants(cardAnswer);
  return variants.some((v) => tolerantEqual(v, listAnswer)) || tolerantEqual(listAnswer, cardAnswer);
}

/* ── question-type detection (guide keywords first, site ids second) ─────── */

const TYPE_BY_REAL_TYPE: Record<string, CanonicalQuestionType> = {
  "7": "matching_information",
  "14": "matching_classification",
  "11": "diagram_label",
};

export function detectQuestionType(
  guide: string,
  rawMeta: { style?: string | null; realType?: string | null; questionType?: string | null; type?: string | null },
): CanonicalQuestionType {
  const g = guide.toLowerCase();
  const has = (...words: string[]) => words.every((w) => g.includes(w));
  if (g.includes("which paragraph") || g.includes("contains the following information")) return "matching_information";
  if (g.includes("choose the correct heading")) return "matching_headings";
  if (g.includes("match each") || g.includes("match a")) return "matching_classification";
  if (g.includes("label the diagram")) return "diagram_label";
  if (g.includes("flow-chart")) return "flow_chart_completion";
  if (g.includes("complete the table")) return "table_completion";
  if (g.includes("complete the notes")) return "note_completion";
  if (g.includes("complete the summary")) return "summary_completion";
  if (g.includes("complete the sentences")) return "sentence_completion";
  if (g.includes("answer the questions below") || (g.includes("choose") && has("one word"))) return "short_answer";
  if (g.includes("choose the correct letter") || g.includes("choose two letters")) return "multiple_choice";
  if (rawMeta.realType && TYPE_BY_REAL_TYPE[rawMeta.realType]) return TYPE_BY_REAL_TYPE[rawMeta.realType];
  if (rawMeta.style === "input") return "sentence_completion";
  return "unknown";
}

/* ── main adapter ─────────────────────────────────────────────────────────── */

export function adaptIeltscbReport(
  raw: IeltscbReportData,
  params: IeltscbReportParams,
  sourceUrl: string,
): { test: CanonicalReadingTest; warnings: IeltscbWarning[] } {
  const warnings: IeltscbWarning[] = [];

  /* passage ─────────────────────────────────────────────────────────────── */
  const contentRows = raw.content?.list ?? [];
  const paragraphs = contentRows.map((row) => {
    const html = row.en ?? "";
    const { markers, text } = extractSentenceMarkers(html);
    const label = text.match(/^([A-H])\b/)?.[1] ?? null;
    return {
      label,
      text,
      translation: row.zh ? htmlToText(row.zh) : null,
      rawHtml: html,
      markers,
    };
  });
  const subtitle = paragraphs.length && paragraphs[0].label === null ? paragraphs[0].text : null;
  const bodyParas = paragraphs.filter((p) => p.label !== null);
  const passage: CanonicalPassage = {
    title: raw.content_title?.trim() || "IELTSCB Reading",
    subtitle,
    paragraphs: bodyParas.map(({ label, text, translation, rawHtml }) => ({ label, text, translation, rawHtml })),
  };
  if (!bodyParas.length) warnings.push({ code: "MISSING_PASSAGE" });

  /* evidence map: question tag (Q1) → paragraphs' sentence markers ──────── */
  const evidenceByTag = new Map<string, CanonicalEvidence[]>();
  for (const p of bodyParas) {
    for (const m of p.markers) {
      if (!m.tag) continue;
      const qNum = Number(m.tag.replace(/^Q/i, ""));
      if (!Number.isInteger(qNum)) continue;
      const arr = evidenceByTag.get(m.tag) ?? [];
      arr.push({ questionNumber: qNum, paragraphLabel: p.label ?? "", sentenceId: m.questionId, text: m.text });
      evidenceByTag.set(m.tag, arr);
    }
  }

  /* synonyms ────────────────────────────────────────────────────────────── */
  const synonyms: CanonicalSynonym[] = (raw.synonym?.list ?? [])
    .filter((r) => (r.question_word ?? "").trim() && (r.primeval ?? "").trim())
    .map((r) => ({
      questionNumber: r.question_num ? Number(r.question_num.replace(/^Q/i, "")) || null : null,
      questionWord: (r.question_word ?? "").trim(),
      passageWords: (r.primeval ?? "").trim(),
    }));
  const synonymsByNumber = new Map<number, CanonicalSynonym[]>();
  for (const s of synonyms) {
    if (s.questionNumber == null) continue;
    const arr = synonymsByNumber.get(s.questionNumber) ?? [];
    arr.push(s);
    synonymsByNumber.set(s.questionNumber, arr);
  }

  /* official explanations (top-level list covers every question) ────────── */
  const explanationByNumber = new Map<number, CanonicalExplanation>();
  for (const row of raw.analysis?.list ?? []) {
    const num = Number(row.sort);
    if (!Number.isInteger(num)) continue;
    explanationByNumber.set(num, {
      questionNumber: num,
      answer: row.answer ?? null,
      officialGuide: row.guide ?? null,
      evidenceEn: row.en ?? null,
      evidenceZh: row.zh ?? null,
      officialReasoning: row.stem ?? null,
      officialParaphrase: row.related ?? null,
      raw: row,
    });
  }

  /* answer card: user answers + official grading, joined by `sort` ──────── */
  interface CardRow {
    userAnswer: string;
    isCorrect: boolean;
    correctAnswer: string;
    realType: string | null;
    questionType: string | null;
    number: number;
  }
  const cardByNumber = new Map<number, CardRow>();
  for (const r of raw.answer?.list ?? []) {
    const num = Number(r.sort);
    if (!Number.isInteger(num)) continue;
    cardByNumber.set(num, {
      userAnswer: (r.text ?? "").replace(/\u00a0/g, " ").trim(),
      isCorrect: Number(r.isright) === 1,
      correctAnswer: (r.option_names ?? "").replace(/\u00a0/g, " ").trim(),
      realType: r.real_type ?? null,
      questionType: r.question_type ?? null,
      number: num,
    });
  }

  /* question groups ─────────────────────────────────────────────────────── */
  const groups: CanonicalQuestionGroup[] = [];
  const flat: CanonicalQuestion[] = [];

  for (const g of raw.question_list?.list ?? []) {
    const rawMeta = { style: g.style ?? null, realType: g.real_type ?? null, questionType: g.question_type ?? null, type: g.type ?? null };
    const instruction = g.guide ? htmlToText(g.guide) : "";
    const options = (g.options?.list ?? []).map((o) => (o.prefix ?? "").replace(/\u00a0/g, " ").trim()).filter(Boolean);
    const groupType = detectQuestionType(instruction, rawMeta);
    const questions: CanonicalQuestion[] = [];

    if ((g.list ?? []).length > 0) {
      // select-style groups carry concrete questions
      for (const q of g.list ?? []) {
        const num = Number(q.number);
        if (!Number.isInteger(num)) continue;
        const card = cardByNumber.get(num) ?? null;
        const listAnswer = (q.answer ?? "").replace(/\u00a0/g, " ").trim();
        if (card && card.correctAnswer && listAnswer && !answersAgree(listAnswer, card.correctAnswer)) {
          warnings.push({ code: "ANSWER_CONFLICT", questionNumber: num, questionListAnswer: listAnswer, cardAnswer: card.correctAnswer });
        }
        const variants = card?.correctAnswer ? splitAnswerVariants(card.correctAnswer) : [];
        const correct = listAnswer || variants[0] || "";
        const accepted = variants.filter((v) => !tolerantEqual(v, correct));
        const type = detectQuestionType(`${instruction} ${q.question ?? ""}`, {
          ...rawMeta,
          realType: card?.realType ?? rawMeta.realType,
        });
        if (type === "unknown") warnings.push({ code: "UNKNOWN_QUESTION_TYPE", questionNumber: num });
        const evidence = evidenceByTag.get(`Q${num}`) ?? [];
        if (!evidence.length) warnings.push({ code: "UNPARSED_EVIDENCE", questionNumber: num });
        questions.push({
          number: num,
          type,
          questionText: htmlToText(q.question ?? ""),
          options,
          correctAnswer: correct,
          acceptedAnswers: accepted,
          userAnswer: card?.userAnswer ?? null,
          isCorrect: card ? card.isCorrect : null,
          evidence,
          explanation: explanationByNumber.get(num) ?? null,
          paraphrases: (synonymsByNumber.get(num) ?? []).map((s) => ({ questionWord: s.questionWord, passageWords: s.passageWords })),
          rawMeta: { ...rawMeta, realType: card?.realType ?? rawMeta.realType },
        });
      }
    } else {
      // input-style groups: questions live as <space data-sid data-number> slots;
      // answers by sid; stems = group guide (labels often sit in a diagram image)
      const slots = extractSpaceSlots(g.question ?? "");
      const answersBySid = new Map((g.answer ?? []).map((a) => [a.sid ?? "", a.answer ?? ""]));
      for (const slot of slots) {
        const num = slot.number;
        const card = cardByNumber.get(num) ?? null;
        const groupVariantsRaw = answersBySid.get(slot.sid) ?? "";
        const listVariants = splitAnswerVariants(groupVariantsRaw);
        const listAnswer = listVariants[0] ?? "";
        if (card && card.correctAnswer && listAnswer && !answersAgree(listAnswer, card.correctAnswer)) {
          warnings.push({ code: "ANSWER_CONFLICT", questionNumber: num, questionListAnswer: listAnswer, cardAnswer: card.correctAnswer });
        }
        const cardVariants = card?.correctAnswer ? splitAnswerVariants(card.correctAnswer) : [];
        const allVariants = dedupeVariants([...listVariants, ...cardVariants]);
        const correct = listAnswer || cardVariants[0] || "";
        const accepted = allVariants.filter((v) => !tolerantEqual(v, correct));
        const type = detectQuestionType(instruction, { ...rawMeta, realType: card?.realType ?? rawMeta.realType });
        if (type === "unknown") warnings.push({ code: "UNKNOWN_QUESTION_TYPE", questionNumber: num });
        const evidence = evidenceByTag.get(`Q${num}`) ?? [];
        if (!evidence.length) warnings.push({ code: "UNPARSED_EVIDENCE", questionNumber: num });
        questions.push({
          number: num,
          type,
          questionText: instruction || `Question ${num}`,
          options: [],
          correctAnswer: correct,
          acceptedAnswers: accepted,
          userAnswer: card?.userAnswer ?? null,
          isCorrect: card ? card.isCorrect : null,
          evidence,
          explanation: explanationByNumber.get(num) ?? null,
          paraphrases: (synonymsByNumber.get(num) ?? []).map((s) => ({ questionWord: s.questionWord, passageWords: s.passageWords })),
          rawMeta: { ...rawMeta, realType: card?.realType ?? rawMeta.realType },
        });
      }
    }

    groups.push({ number: g.number ?? "", type: groupType, instruction, options, questions, rawMeta });
    flat.push(...questions);
  }

  flat.sort((a, b) => a.number - b.number);
  if (!flat.length) warnings.push({ code: "MISSING_QUESTIONS" });
  for (const q of flat) {
    if (q.isCorrect == null) warnings.push({ code: "MISSING_ANSWERS", questionNumber: q.number });
    if (!q.explanation) warnings.push({ code: "MISSING_EXPLANATION", questionNumber: q.number });
    // cross-check official grading against our tolerant re-grade
    const ua = q.userAnswer;
    if (q.isCorrect != null && ua != null) {
      const locallyRight =
        tolerantEqual(ua, q.correctAnswer) || q.acceptedAnswers.some((a) => tolerantEqual(a, ua));
      if (locallyRight !== q.isCorrect) {
        warnings.push({ code: "GRADING_MISMATCH", questionNumber: q.number, siteIsRight: q.isCorrect, localIsRight: locallyRight });
      }
    }
  }

  /* core words / guide / summary ────────────────────────────────────────── */
  const coreWords: CanonicalCoreWord[] = (raw.core_words?.list ?? [])
    .filter((r) => (r.text ?? "").trim())
    .map((r) => ({ text: (r.text ?? "").trim(), note: (r.note ?? "").trim() || null }));

  const rightNumAll = raw.answer?.right_num_all ?? null;
  const correctCount =
    typeof rightNumAll === "number"
      ? rightNumAll
      : flat.filter((q) => q.isCorrect === true).length || null;

  const test: CanonicalReadingTest = {
    source: "ieltscb",
    sourceUrl,
    externalKey: params,
    title: raw.content_title?.trim() || raw.bread_crumbs?.trim() || "IELTSCB Reading",
    breadcrumb: raw.crumbs_text?.trim() ?? raw.bread_crumbs?.trim() ?? null,
    passage,
    questionGroups: groups,
    questions: flat,
    synonyms,
    coreWords,
    officialGuide: raw.guide?.analysis ? htmlToText(raw.guide.analysis) : null,
    summary: {
      totalQuestions: flat.length,
      correctCount,
      rightNumText: raw.answer?.right_num ?? null,
      durationSeconds: raw.answer?.duration ? Number(raw.answer.duration) || null : null,
    },
    warnings,
  };
  return { test, warnings };
}
