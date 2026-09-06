// ── Shared domain types for the whole app ───────────────────────────────────

export type CEFR = "A2" | "B1" | "B2" | "C1";
export type ContentType = "reading" | "listening";
export type VocabStatus = "passive" | "active";
export type ErrorCategory =
  | "grammar"
  | "vocabulary"
  | "collocation"
  | "preposition"
  | "article"
  | "tense"
  | "word_choice"
  | "sentence_structure"
  | "naturalness"
  | "pronunciation"
  | "spelling"
  | "chinese_english"
  | "listening_recognition"
  | "ielts_specific";
export type ErrorStatus = "active" | "improving" | "stable" | "resolved";
export type RetrievalItemType = "chunk" | "vocab" | "grammar" | "error" | "sentence_pattern" | "spoken_pattern";
export type ReviewMode = "recognition" | "cued_recall" | "production" | "cloze" | "context_transfer" | "audio_retrieval" | "retention_check";

/** Retention-specific fields on a retrieval item. */
export interface RetentionInfo {
  retentionScore: number; // 0-100, independent from strength
  lastRetentionCheckAt: number | null;
  retentionCheckInterval: number; // days between checks (7 → 30 → 90)
  forgettingDetected: boolean;
  crossContextSuccess: number; // times retrieved in a different module context
  delayedRecallSuccess: number; // times retrieved after ≥7 days gap
}
export type StepStatus = "pending" | "done" | "skipped";

/** The seven learning states — every LanguageItem walks this ladder.
 *  Seeing ≠ learning; each state is earned by the learner producing evidence. */
export const LEARNING_STATES = [
  "exposure",       // 0: met in input (reading/listening)
  "understanding",  // 1: opened analysis, guessed meaning
  "recognition",    // 2: picked it from choices / heard and identified it
  "retrieval",      // 3: produced it from memory (Chinese cue / cloze)
  "usage",          // 4: used it in own sentence (speaking/writing)
  "transfer",       // 5: used it in a NEW context (different module/scenario)
  "retention",      // 6: survived 7+ days of retrieval — actually retained
] as const;
export type LearningState = (typeof LEARNING_STATES)[number];

/** Which module context a retrieval happened in — cross-module reuse tracking. */
export type ModuleContext = "reading" | "listening" | "speaking" | "writing" | "review" | "ielts";

/** Full learning state record per LanguageItem. */
export interface ItemLearningState {
  state: LearningState;
  achievedAt: Partial<Record<LearningState, number>>;
  contexts: ModuleContext[];
  productionHits: number;
  productionMisses: number;
  contextualHits: number;
  contextualMisses: number;
  lastProductionAt?: number;
  lastContextualAt?: number;
}

export interface SpeechPhenomenon {
  type: "linking" | "weak_form" | "reduction" | "elision" | "assimilation";
  span: string; // the written form, e.g. "going to"
  spoken: string; // how it actually sounds, e.g. "gonna"
  note: string;
}

// ── Daily Mission plan (stored as JSON in daily_missions.plan) ──────────────

export interface MissionReadingStep {
  contentId: number;
  title: string;
  minutes: number;
  status: StepStatus;
}
export interface MissionListeningStep {
  contentId: number;
  title: string;
  minutes: number;
  status: StepStatus;
}
export interface MissionNoticeStep {
  contentId: number;
  chunkIds: number[]; // corpus chunk ids suggested for noticing
  savedCount: number;
  status: StepStatus;
}
export interface MissionDeepStep {
  chunkIds: number[];
  status: StepStatus;
}
export interface MissionRetrievalStep {
  itemIds: number[];
  doneCount: number;
  status: StepStatus;
}
export interface MissionSpeakingStep {
  prompt: string;
  requiredChunkIds: number[]; // chunks the user must try to use
  rounds: number;
  status: StepStatus;
}
export interface MissionTransferStep {
  cueCard: string;
  part3: string[];
  status: StepStatus;
}

/** Daily snapshot of the user's complete learning state — the trajectory data. */
export interface LearningSnapshot {
  date: string; // YYYY-MM-DD
  overall: number;
  reading: number;
  listening: number;
  speaking: number;
  writing: number;
  retrievalAccuracy: number;
  transferRate: number;
  activeChunks: number;
  activeVocab: number;
  recurringErrors: number;
  studyMinutes: number;
  meaningfulEvents: number;
  estimatedIelts: number | null;
  bottleneck: string;
}

/** A single measurable change in a metric, with full evidence trail. */
export interface ProgressEvent {
  id: number;
  userId: number;
  metric: string; // "listening", "retrieval_accuracy", etc.
  previousValue: number;
  newValue: number;
  delta: number;
  reason: string; // human-readable explanation
  evidence: string; // what events caused this
  createdAt: number;
}

export interface SkillTrend {
  key: string;
  label: string;
  current: number;
  trend7: number;  // change over 7 days
  trend30: number; // change over 30 days
  direction: "improving" | "plateau" | "declining" | "insufficient-data";
  attribution: string[]; // why it changed
}

export interface Bottleneck {
  skill: string;
  rootCause: string;
  detail: string;
  recommendation: string;
}

export interface IeltsReadiness {
  skill: string;
  low: number;
  high: number;
  confidence: "low" | "medium" | "high";
  evidenceCount: number;
  evidenceNote: string;
}

export interface WeeklyReview {
  weekOf: string;
  improved: { skill: string; delta: number; reason: string }[];
  stillWeak: { skill: string; score: number; reason: string }[];
  topErrors: string[];
  strongestItems: string[];
  weakestItems: string[];
  retrievalStats: { attempts: number; accuracy: number };
  transferStats: { attempted: number; succeeded: number };
  ieltsChange: string;
  nextPriority: string;
}

export type IeltsSkill = "listening" | "reading" | "speaking" | "writing";
export type IeltsMode = "learning" | "exam";
export type IeltsTaskType =
  | "listening_section" | "reading_passage"
  | "speaking_part1" | "speaking_part2" | "speaking_part3"
  | "writing_task1" | "writing_task2";

/** IELTS sub-skill taxonomy — the granular abilities tested. */
export const IELTS_SUB_SKILLS = {
  listening: ["main_idea", "detail", "inference", "distractor_recognition", "vocabulary_recognition", "connected_speech", "note_completion", "multiple_choice", "matching", "sentence_completion"],
  reading: ["skimming", "scanning", "main_idea", "detail", "inference", "paraphrase_recognition", "vocabulary_in_context", "tfng", "matching_headings", "sentence_completion"],
  speaking: ["fluency", "coherence", "lexical_resource", "grammar", "pronunciation", "naturalness", "answer_development", "paraphrasing"],
  writing: ["task_response", "coherence_cohesion", "lexical_resource", "grammar", "sentence_variety", "paraphrasing", "argument_development"],
} as const;

/** An IELTS task — the measurement + transfer unit. */
export interface IeltsTask {
  id: number;
  taskType: IeltsTaskType;
  skill: IeltsSkill;
  difficulty: number; // 1-5
  topic: string;
  prompt: string;
  /** content for listening/reading tasks */
  content?: string;
  /** questions with answers (for objective tasks) */
  questions?: { question: string; options?: string[]; answer: string; subSkill: string }[];
  /** target LanguageItems the engine wants transferred (never shown to user) */
  targetChunkIds: number[];
  estimatedBand: number;
  timeLimitMinutes: number;
  source: string;
}

/** Result of one IELTS attempt. */
export interface IeltsAttempt {
  id: number;
  userId: number;
  taskId: number;
  mode: IeltsMode;
  responses: unknown;
  score: number | null;
  band: number | null;
  /** which sub-skills were tested and how */
  subSkillResults: { skill: string; correct: boolean; note: string }[];
  /** language items: retrieved / produced / transferred / avoided */
  transferResults: { chunkId: number; text: string; status: "retrieved" | "produced" | "transferred" | "avoided" }[];
  /** strategy errors (not language errors) */
  strategyIssues: string[];
  /** language errors → Error Bank */
  languageErrors: string[];
  durationMinutes: number;
  createdAt: number;
}

/** Per-skill IELTS tracking — separate from language ability. */
export interface IeltsSkillProfile {
  skill: IeltsSkill;
  estimatedBand: number | null;
  bandRange: { low: number; high: number } | null;
  confidence: "low" | "medium" | "high";
  sampleCount: number;
  subSkillScores: Record<string, number>; // sub-skill → 0-100
  strategyIssues: string[]; // test strategy, not language
  lastAssessedAt: number | null;
}

export interface BandGap {
  skill: IeltsSkill;
  current: number | null;
  target: number;
  gap: number;
  mainIssue: string;
  isStrategy: boolean; // true = test strategy, false = language ability
  recommendation: string;
}

export interface MissionRationale {
  headline: string;
  factors: { name: string; weight: number; rawScore: number; weightedScore: number; detail: string }[];
  primaryFocus: { skill: string; subSkill: string; score: number };
  diversityNote?: string;
  urgentItems: string[];
}

export interface MissionOutcome {
  completedAt: number;
  improvements: string[];
  needsAttention: string[];
  metricsBefore: { retrievalAccuracy: number; activeChunks: number; errorCount: number };
  metricsAfter: { retrievalAccuracy: number; activeChunks: number; errorCount: number };
}

export interface MissionPlan {
  lite?: boolean;
  /** "quick" 10-15min | "standard" 25-35min | "deep" 45-60min */
  length?: "quick" | "standard" | "deep";
  /** explainable rationale: why this mission, why now, why these items */
  rationale?: MissionRationale;
  reading: MissionReadingStep;
  listening: MissionListeningStep;
  notice: MissionNoticeStep;
  deep: MissionDeepStep;
  retrieval: MissionRetrievalStep;
  speaking: MissionSpeakingStep;
  transfer: MissionTransferStep;
}

// Anti-illusion learning funnel: never collapse this into "words learned".
export interface MissionCounters {
  exposure: number;
  understood: number;
  retrieved: number;
  used: number;
  retained: number;
}

// ── AI feedback shapes (validated with zod in src/lib/ai/tasks.ts) ──────────

export interface WordAnalysis {
  word: string;
  contextualMeaning: string;
  simpleDefinition: string;
  example: string;
  collocations: string[];
  meaningZh: string;
  cefr: string;
  isMock: boolean;
}

export interface SentenceAnalysis {
  sentence: string;
  meaning: string;
  meaningZh: string;
  structure: string;
  whyThisExpression: string;
  nativeLogic: string;
  alternatives: { expression: string; note: string }[];
  differences: string;
  collocations: string[];
  transfer: { daily: string; speaking: string; writing: string };
  detectedChunks: string[];
  isMock: boolean;
}

export interface RetrievalGrade {
  quality: 0 | 3 | 5;
  correct: boolean;
  verdict: string;
  targetAnswer: string;
  missingPieces: string[];
  isMock: boolean;
}

export interface IeltsSubScores {
  fluency?: number;
  coherence?: number;
  lexical?: number;
  grammar?: number;
  pronunciation?: number;
  taskResponse?: number;
}

export interface SpeakingFeedback {
  ielts: IeltsSubScores;
  overallEstimate: number;
  corrections: {
    priority: "P1" | "P2" | "P3" | "P4" | "P5";
    original: string;
    improved: string;
    explanation: string;
  }[];
  chunksUsed: { text: string; used: boolean }[];
  acquisitions: {
    newExpressionsUsed: string[];
    failedRetrievals: string[];
    overusedWords: string[];
    chineseStyleEnglish: string[];
    paraphraseOpportunities: string[];
  };
  followUp: string;
  summary: string;
  isMock: boolean;
}

export interface RewriteTask {
  id: number;
  original: string;      // exact phrase from the essay
  problem: string;       // what's wrong
  fix: string;           // the corrected phrase (live models provide it)
  explanation: string;   // why — the language ability behind it
  hint: string;          // nudge, NOT the answer
  userRewrite?: string;  // filled by the learner
  betterVersion?: string; // revealed only after user attempts
}

export interface LanguageAcquisitionReport {
  activeItemsUsed: { text: string; itemId: number; wasTargeted: boolean }[];
  successfulRetrievals: string[];   // items retrieved from memory in writing
  failedRetrievals: string[];        // targeted items the learner avoided
  newErrors: string[];               // errors auto-banked this session
  reusedExpressions: string[];       // items used across multiple modules
  transferSuccess: number;           // count of items that advanced to transfer
  sentenceVariety: number;           // 0-100
  paraphrasingScore: number;         // 0-100
}

export interface WritingFeedback {
  ielts: IeltsSubScores;
  overallEstimate: number;
  comparisons: { original: string; better: string; why: string }[];
  repeatedMistakes: string[];
  abilityDiagnosis: string[];
  summary: string;
  isMock: boolean;
  // Rewrite loop — the learner fixes these before seeing "better"
  rewriteTasks: RewriteTask[];
  // LanguageItem tracking
  acquisition: LanguageAcquisitionReport;
  usedChunkIds: number[];
  usedChunkTexts: string[];
}

export interface ParaphraseFeedback {
  variation: number; // 0-100 lexical/structural variety
  naturalness: number;
  ieltsRelevance: number;
  analysis: string;
  modelParaphrases: string[];
  isMock: boolean;
}

export interface TutorReply {
  reply: string;
  isMock: boolean;
}
