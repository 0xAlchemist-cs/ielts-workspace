/* ── IELTSCB /Report/show — raw payload types (ALL optional: never assume a
 *    field exists; the site may change shape) + canonical reading model ──── */

/** Raw envelope: { e: "9999", m: "操作成功", data: {...} } */
export interface IeltscbEnvelope {
  e?: string | null;
  m?: string | null;
  data?: IeltscbReportData | null;
}

export interface IeltscbReportData {
  e?: string | null;
  m?: string | null;
  bread_crumbs?: string | null;
  crumbs_text?: string | null;
  id?: string | null;
  synonym?: { title?: string | null; list?: IeltscbSynonymRow[] | null } | null;
  synonym_expand?: unknown;
  content_title?: string | null;
  guide?: { title?: string | null; analysis?: string | null } | null;
  core_words?: { title?: string | null; list?: IeltscbCoreWordRow[] | null } | null;
  content?: { title?: string | null; list?: IeltscbContentRow[] | null } | null;
  analysis?: { title?: string | null; list?: IeltscbAnalysisRow[] | null } | null;
  question_list?: { title?: string | null; list?: IeltscbQuestionGroupRow[] | null } | null;
  answer?: IeltscbAnswerCard | null;
  re_test?: unknown;
  ai_note?: unknown;
}

export interface IeltscbSynonymRow {
  question_num?: string | null;
  question_word?: string | null;
  primeval?: string | null;
  status?: string | null;
  url?: string | null;
  id?: string | null;
}

export interface IeltscbCoreWordRow {
  text?: string | null;
  note?: string | null;
  url?: string | null;
}

/** One passage part: [0] is usually the subtitle (no label); A–H follow.
 *  `en` embeds evidence markers: <sentence data-tag='Q1' data-question='676'>…</sentence> */
export interface IeltscbContentRow {
  id?: string | number | null;
  en?: string | null;
  zh?: string | null;
}

/** Official per-question explanation (top-level analysis.list, joined by `sort`). */
export interface IeltscbAnalysisRow {
  id?: string | null;
  title?: string | null;
  question?: string | null;
  question_prefix?: string | null;
  answer?: string | null;
  guide?: string | null;
  guide_prefix?: string | null;
  en?: string | null;
  en_prefix?: string | null;
  zh?: string | null;
  zh_prefix?: string | null;
  stem?: string | null;
  stem_prefix?: string | null;
  related?: string | null;
  related_prefix?: string | null;
  sort?: string | null;
  type?: string | null;
  analysis_key?: number | null;
}

export interface IeltscbQuestionGroupRow {
  style?: string | null;
  number?: string | null;
  guide?: string | null;
  img?: string | null;
  question?: string | null;
  options?: { title?: string | null; list?: { prefix?: string | null; answer?: string | null }[] | null } | null;
  answer?: { sid?: string | null; answer?: string | null; img?: string | null }[] | null;
  analysis?: unknown[] | null;
  type?: string | null;
  real_type?: string | null;
  question_type?: string | null;
  /** select_input groups carry the questions here; input groups leave it empty. */
  list?: {
    id?: string | null;
    number?: string | null;
    question?: string | null;
    answer?: string | null;
    analysis?: unknown[] | null;
    analysis_key?: number | null;
    select_answer?: string | null;
  }[] | null;
}

/** Answer card: text = USER answer, option_names = CORRECT answer (variants
 *  pipe-separated for fill-ins), isright = official grading of that submission. */
export interface IeltscbAnswerCard {
  title?: string | null;
  duration?: string | null;
  right_num?: string | null;
  right_num_all?: number | null;
  avg_right?: number | null;
  list?: {
    text?: string | null;
    isright?: number | string | null;
    question_id?: string | null;
    chapter_id?: string | null;
    option_names?: string | null;
    real_type?: string | null;
    question_type?: string | null;
    sort?: string | null;
    section_id?: string | null;
    analysis_key?: number | null;
  }[] | null;
}

/* ── Canonical Reading model (site vocabulary never leaks past the adapter) ── */

export type CanonicalQuestionType =
  | "matching_information"
  | "matching_classification"
  | "matching_headings"
  | "multiple_choice"
  | "sentence_completion"
  | "summary_completion"
  | "note_completion"
  | "table_completion"
  | "flow_chart_completion"
  | "diagram_label"
  | "short_answer"
  | "unknown";

export interface CanonicalEvidence {
  questionNumber: number;
  paragraphLabel: string;
  /** site analysis id ↔ <sentence data-question> */
  sentenceId: string | null;
  text: string;
}

export interface CanonicalExplanation {
  questionNumber: number;
  answer: string | null;
  /** guide → 定位 (where to look + locator words) */
  officialGuide: string | null;
  /** en → the evidence sentence in the passage */
  evidenceEn: string | null;
  /** zh → evidence translation */
  evidenceZh: string | null;
  /** stem → reasoning (解题思路) */
  officialReasoning: string | null;
  /** related → paraphrase pair, e.g. "freezing weather=cold temperatures" */
  officialParaphrase: string | null;
  /** full raw row preserved for future re-mapping */
  raw: IeltscbAnalysisRow;
}

export interface CanonicalQuestion {
  number: number;
  type: CanonicalQuestionType;
  questionText: string;
  options: string[];
  correctAnswer: string;
  /** fill-in variants exactly as the site lists them — never invented */
  acceptedAnswers: string[];
  userAnswer: string | null;
  isCorrect: boolean | null; // null = site didn't grade (missing answer row)
  evidence: CanonicalEvidence[];
  explanation: CanonicalExplanation | null;
  /** paraphrases harvested from the synonym list for THIS question number */
  paraphrases: { questionWord: string; passageWords: string }[];
  /** raw site type ids, kept verbatim per spec (never guessed away) */
  rawMeta: { style?: string | null; realType?: string | null; questionType?: string | null; type?: string | null };
}

export interface CanonicalQuestionGroup {
  number: string;
  type: CanonicalQuestionType;
  instruction: string;
  options: string[];
  questions: CanonicalQuestion[];
  rawMeta: { style?: string | null; realType?: string | null; questionType?: string | null; type?: string | null };
}

export interface CanonicalParagraph {
  label: string | null; // "A"…"H"; null = subtitle part
  text: string;
  translation: string | null;
  /** raw HTML preserved so evidence re-parsing is always possible */
  rawHtml: string;
}

export interface CanonicalPassage {
  title: string;
  subtitle: string | null;
  paragraphs: CanonicalParagraph[];
}

export interface CanonicalSynonym {
  questionNumber: number | null;
  questionWord: string;
  passageWords: string;
}

export interface CanonicalCoreWord {
  text: string;
  note: string | null;
}

export type IeltscbWarning =
  | { code: "ANSWER_CONFLICT"; questionNumber: number; questionListAnswer: string; cardAnswer: string }
  | { code: "MISSING_PASSAGE" }
  | { code: "MISSING_QUESTIONS" }
  | { code: "MISSING_ANSWERS"; questionNumber: number }
  | { code: "MISSING_EXPLANATION"; questionNumber: number }
  | { code: "GRADING_MISMATCH"; questionNumber: number; siteIsRight: boolean; localIsRight: boolean }
  | { code: "UNPARSED_EVIDENCE"; questionNumber: number }
  | { code: "UNKNOWN_QUESTION_TYPE"; questionNumber: number };

export interface CanonicalReadingTest {
  source: "ieltscb";
  sourceUrl: string;
  externalKey: { paperId: number; chaptersId: number; pType: number; tid: number; classify: number };
  title: string;
  breadcrumb: string | null;
  passage: CanonicalPassage;
  questionGroups: CanonicalQuestionGroup[];
  questions: CanonicalQuestion[]; // flat, ordered by number
  synonyms: CanonicalSynonym[];
  coreWords: CanonicalCoreWord[];
  /** whole-paper strategy explanation (guide.analysis) — paper level, not per question */
  officialGuide: string | null;
  /** answer-card summary */
  summary: {
    totalQuestions: number;
    correctCount: number | null;
    rightNumText: string | null;
    durationSeconds: number | null;
  };
  warnings: IeltscbWarning[];
}

/** Preview payload — everything the confirm step needs, nothing written yet. */
export interface IeltscbImportPreview extends CanonicalReadingTest {
  existing: {
    taskId: number;
    importRowId: number;
    importedAt: number;
    /** exact same report (same tid) already imported */
    sameReport: boolean;
    attemptId: number | null;
  } | null;
  parserVersion: string;
}

export const IELTSCB_PARSER_VERSION = "1.0.0";
