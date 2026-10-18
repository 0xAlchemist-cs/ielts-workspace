import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import type {
  CEFR,
  ContentType,
  ErrorCategory,
  ErrorStatus,
  ItemLearningState,
  LearningSnapshot,
  MissionPlan,
  MissionCounters,
  RetrievalItemType,
  ReviewMode,
  SpeechPhenomenon,
  VocabStatus,
} from "@/lib/types";

// ── Identity & profile ──────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // V8: each exam goal (ielts|cet4|cet6) is its own learning-memory namespace —
  // one row per profile, selected by the active exam in app_config
  examProfile: text("exam_profile").$type<"ielts" | "cet4" | "cet6">().notNull().default("ielts"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const learningProfiles = sqliteTable("learning_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  ieltsOverall: real("ielts_overall"),
  ieltsListening: real("ielts_listening"),
  ieltsReading: real("ielts_reading"),
  ieltsWriting: real("ielts_writing"),
  ieltsSpeaking: real("ielts_speaking"),
  cefr: text("cefr").$type<CEFR>().notNull().default("B1"),
  immersionLevel: integer("immersion_level").notNull().default(1),
  dailyMinutes: integer("daily_minutes").notNull().default(45),
  /** V12.1: IELTS target band (5.0–8.0 in 0.5 steps); null = not set (goal
   * defaults to baseline overall). CET goals carry no score model — null. */
  targetBand: real("target_band"),
  grammarWeaknesses: text("grammar_weaknesses", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  speakingWeaknesses: text("speaking_weaknesses", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
    listeningWeaknesses: text("listening_weaknesses", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    // Listening sub-profile: { global, wordRecognition, connectedSpeech, weakForms, speed }
    // levels "A2"|"B1"|"B2" — the real bottleneck map, updated by Listening Lab sessions.
    listeningProfile: text("listening_profile", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

// ── Content corpus ──────────────────────────────────────────────────────────

export const contents = sqliteTable(
  "contents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").$type<ContentType>().notNull(),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    cefr: text("cefr").$type<CEFR>().notNull(),
    // V9: AI difficulty classification evidence (confidence + one-line reason).
    // Empty = never AI-classified; the cefr column itself may hold pre-existing
    // corpus annotations or an AI result — never a silent local guess.
    cefrMeta: text("cefr_meta", { mode: "json" })
      .$type<{ confidence?: number; summary?: string }>()
      .notNull()
      .default({}),
    difficulty: integer("difficulty").notNull().default(3), // 1-5
    vocabDensity: real("vocab_density").notNull().default(0.5), // 0-1
    grammarComplexity: integer("grammar_complexity").notNull().default(3), // 1-5
    ieltsRelevance: integer("ielts_relevance").notNull().default(3), // 1-5
    summaryEn: text("summary_en").notNull().default(""),
    body: text("body").notNull(), // article text or listening transcript
    audioUrl: text("audio_url"), // real recording (e.g. Cambridge MP3) — whole-content playback
    minutes: integer("minutes").notNull().default(10),
    fingerprint: text("fingerprint"), // sha256 of normalized body — import dedup guard
    // V8: corpus namespace — imported material belongs to the exam that was
    // active at import time; seeded Cambridge corpus is ielts
    examProfile: text("exam_profile").$type<"ielts" | "cet4" | "cet6">().notNull().default("ielts"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_contents_type").on(t.type), index("idx_contents_exam").on(t.examProfile)],
);

// ── Local import system (V6): every uploaded file, its fate, and its content ─

export const importedResources = sqliteTable(
  "imported_resources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    fileName: text("file_name").notNull(), // display only — never a path
    resourceType: text("resource_type").$type<"document" | "subtitle" | "image" | "audio" | "video">().notNull(),
    format: text("format").notNull(), // pdf|docx|txt|md|png|jpg|webp|srt|vtt|mp3|wav|m4a|mp4
    mimeType: text("mime_type").notNull().default(""),
    fileSize: integer("file_size").notNull(),
    contentHash: text("content_hash").notNull(), // sha256 of raw bytes — file-level dedup
    storageKey: text("storage_key").notNull(), // generated uuid name inside data/uploads
    status: text("status")
      .$type<"ready" | "duplicate" | "needs_attention" | "needs_transcription" | "failed">()
      .notNull(),
    examProfile: text("exam_profile").$type<"ielts" | "cet4" | "cet6">().notNull().default("ielts"),
    error: text("error"),
    contentId: integer("content_id"), // resulting contents row, when ready
    /** P0 ownership contract: true → THIS import created the contentId row
     * (delete-all may remove it); false → contentId only references content
     * that existed first (duplicate of a paste/seed/other import — never
     * delete). NULL on legacy rows → callers derive from status. */
    ownsContent: integer("owns_content", { mode: "boolean" }),
    meta: text("meta", { mode: "json" })
      .$type<{ pages?: number; durationMs?: number; ocrConfidence?: number; cues?: number; folder?: string }>()
      .notNull()
      .default({}),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    uniqueIndex("uq_imported_hash").on(t.userId, t.contentHash),
    index("idx_imported_user").on(t.userId),
  ],
);

/** Content rotation history — drives selectNextContent cooldown/rotation:
 *  what was used, when, how often, and whether it reached completion. */
export const contentHistory = sqliteTable(
  "content_history",  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    contentId: integer("content_id").notNull(),
    skill: text("skill").notNull(), // reading|listening (content type at use time)
    startedAt: integer("started_at").notNull(),
    completedAt: integer("completed_at"),
    lastUsedAt: integer("last_used_at").notNull(),
    timesUsed: integer("times_used").notNull().default(1),
    completionStatus: text("completion_status").notNull().default("in_progress"), // in_progress|completed
  },
  (t) => [
    uniqueIndex("uq_content_history_user_content").on(t.userId, t.contentId),
    index("idx_content_history_user").on(t.userId),
  ],
);

export const sentences = sqliteTable(
  "sentences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contentId: integer("content_id").notNull(),
    orderNo: integer("order_no").notNull(),
    text: text("text").notNull(),
    wordAnalysis: text("word_analysis", { mode: "json" }), // cached per-word lookups
    sentenceAnalysis: text("sentence_analysis", { mode: "json" }),
  },
  (t) => [index("idx_sentences_content").on(t.contentId)],
);

export const listeningClips = sqliteTable(
  "listening_clips",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contentId: integer("content_id").notNull(),
    orderNo: integer("order_no").notNull(),
    startMs: integer("start_ms").notNull().default(0),
    endMs: integer("end_ms").notNull().default(0),
    text: text("text").notNull(),
    phenomena: text("phenomena", { mode: "json" })
      .$type<SpeechPhenomenon[]>()
      .notNull()
      .default([]),
  },
  (t) => [index("idx_clips_content").on(t.contentId)],
);

// ── Language knowledge ──────────────────────────────────────────────────────
// Corpus chunks (userId = null) are pre-authored and attached to seed contents.
// When a user saves one, a personal copy is created with userId set.

export const vocabularies = sqliteTable(
  "vocabularies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id"), // null = corpus entry owned by the seed library
    headword: text("headword").notNull(),
    pos: text("pos").notNull().default(""),
    cefr: text("cefr").$type<CEFR>(),
    meaningEn: text("meaning_en").notNull().default(""),
    meaningZh: text("meaning_zh").notNull().default(""),
    exampleEn: text("example_en").notNull().default(""),
    collocations: text("collocations", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    // Corpus rows only: per-word pronunciation audio (/audio/vocab/<topic>/<word>.mp3
    // or /audio/179/<word>.mp3), wired from the my-ielts material repo. Null = no audio.
    audioUrl: text("audio_url"),
    status: text("status").$type<VocabStatus>().notNull().default("passive"),
    // "认识" ≠ "听得出来": reading knowledge and listening recognition are
    // tracked separately — listeningStrength is earned only by hearing it.
    listeningStrength: integer("listening_strength").notNull().default(0),
    retrievalStrength: integer("retrieval_strength").notNull().default(0),
    lastReviewAt: integer("last_review_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [uniqueIndex("uq_vocab_user_word").on(t.userId, t.headword)],
);

export const chunks = sqliteTable(
  "chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id"), // null = corpus chunk owned by the seed library
    text: text("text").notNull(),
    pattern: text("pattern").notNull().default(""),
    meaningEn: text("meaning_en").notNull().default(""),
    meaningZh: text("meaning_zh").notNull().default(""),
    examples: text("examples", { mode: "json" }).$type<string[]>().notNull().default([]),
    register: text("register").notNull().default("neutral"), // neutral|informal|academic|ielts
    sourceContentId: integer("source_content_id"),
    retrievalStrength: integer("retrieval_strength").notNull().default(0),
    activatedAt: integer("activated_at"), // set on first production success / accepted own sentence / real output use — Passive → Active
    lastReviewAt: integer("last_review_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_chunks_user").on(t.userId),
    index("idx_chunks_source").on(t.sourceContentId),
  ],
);

/** Per-expression learning event stream — the honest ledger behind the funnel. */
export const chunkEvents = sqliteTable(
  "chunk_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    chunkId: integer("chunk_id").notNull(),
    type: text("type").notNull(), // guess|analysis|generation|...|listen_*|shadow|ielts_use
    detail: text("detail").notNull().default(""),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_chunk_events").on(t.userId, t.chunkId)],
);

/** Listening error taxonomy — WHY each miss happened, not just that it did. */
export const listeningMisses = sqliteTable(
  "listening_misses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    contentId: integer("content_id").notNull(),
    clipId: integer("clip_id"),
    missed: text("missed").notNull(), // what the learner reported not catching
    // A unknown | B known_not_recognized | C connected_speech | D weak_form
    // E reduction | F speed | G attention | H meaning_integration
    category: text("category").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_listening_misses").on(t.userId, t.category)],
);

/** Shadowing attempts — structure ready for real pronunciation analysis;
 *  MVP stores clip-driven coach notes + self-check, never a fake score. */
export const shadowAttempts = sqliteTable("shadow_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  contentId: integer("content_id").notNull(),
  clipId: integer("clip_id").notNull(),
  clipText: text("clip_text").notNull(),
  // pronunciation/rhythm/stress/pausing/intonation/fluency — notes per dimension
  analysis: text("analysis", { mode: "json" }).$type<Record<string, string>>(),
  engine: text("engine").notNull().default("clip-phenomena-notes"), // future: real analyser id
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const grammarPatterns = sqliteTable("grammar_patterns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  pattern: text("pattern").notNull(),
  meaning: text("meaning").notNull().default(""),
  meaningZh: text("meaning_zh").notNull().default(""),
  examples: text("examples", { mode: "json" }).$type<string[]>().notNull().default([]),
  kind: text("kind").notNull().default("grammar"), // grammar|sentence_pattern|spoken_pattern
  retrievalStrength: integer("retrieval_strength").notNull().default(0),
});

export const lexicalRelations = sqliteTable(
  "lexical_relations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromType: text("from_type").notNull(), // vocab|chunk
    fromId: integer("from_id").notNull(),
    toType: text("to_type").notNull(),
    toId: integer("to_id").notNull(),
    relation: text("relation").notNull(), // collocation|synonym|contrast|derivative|related
    note: text("note").notNull().default(""),
  },
  (t) => [index("idx_rel_from").on(t.fromType, t.fromId)],
);

export const userSentences = sqliteTable("user_sentences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  refType: text("ref_type").notNull(), // chunk|vocab|grammar
  refId: integer("ref_id").notNull(),
  text: text("text").notNull(),
  quality: text("quality").notNull().default("ungraded"), // good|ok|needs_work|ungraded
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

// ── Attempts ────────────────────────────────────────────────────────────────

export const speakingAttempts = sqliteTable("speaking_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  missionId: integer("mission_id"),
  prompt: text("prompt").notNull(),
  transcript: text("transcript").notNull(),
  audioPath: text("audio_path"),
  feedback: text("feedback", { mode: "json" }),
  ieltsScores: text("ielts_scores", { mode: "json" }),
  usedChunkIds: text("used_chunk_ids", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  followUp: text("follow_up"),
  round: integer("round").notNull().default(1),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const writingAttempts = sqliteTable("writing_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  taskType: text("task_type").notNull().default("task2"), // task1|task2|general
  prompt: text("prompt").notNull(),
  text: text("text").notNull(),
  feedback: text("feedback", { mode: "json" }),
  ieltsScores: text("ielts_scores", { mode: "json" }),
  usedChunkIds: text("used_chunk_ids", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  revisionText: text("revision_text"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const errors = sqliteTable(
  "errors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    category: text("category").$type<ErrorCategory>().notNull(),
    wrongForm: text("wrong_form").notNull(),
    correctForm: text("correct_form").notNull(),
    explanation: text("explanation").notNull().default(""),
    source: text("source").notNull().default("manual"), // manual|ai
    sourceModule: text("source_module").notNull().default("review"), // reading|listening|speaking|writing|review|ielts
    languageItemId: integer("language_item_id"), // linked chunk/vocab/grammar item
    severity: text("severity").notNull().default("medium"), // low|medium|high
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    correctedCount: integer("corrected_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    firstSeenAt: integer("first_seen_at").notNull().$defaultFn(() => Date.now()),
    lastSeenAt: integer("last_seen_at").notNull().$defaultFn(() => Date.now()),
    status: text("status").$type<ErrorStatus>().notNull().default("active"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_errors_user_status").on(t.userId, t.status),
    index("idx_errors_user_category").on(t.userId, t.category),
  ],
);

// ── Retrieval engine (the product's heart) ──────────────────────────────────

export const retrievalItems = sqliteTable(
  "retrieval_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    itemType: text("item_type").$type<RetrievalItemType>().notNull(),
    itemId: integer("item_id").notNull(),
    easeFactor: real("ease_factor").notNull().default(2.5),
    intervalDays: real("interval_days").notNull().default(0),
    dueAt: integer("due_at").notNull().$defaultFn(() => Date.now()),
    successCount: integer("success_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    lastQuality: integer("last_quality"),
    learningState: text("learning_state", { mode: "json" })
      .$type<ItemLearningState>()
      .notNull()
      .default({
        state: "exposure",
        achievedAt: {},
        contexts: [],
        productionHits: 0,
        productionMisses: 0,
        contextualHits: 0,
        contextualMisses: 0,
      }),
    retentionScore: integer("retention_score").notNull().default(0),
    lastRetentionCheckAt: integer("last_retention_check_at"),
    retentionCheckInterval: integer("retention_check_interval").notNull().default(7),
    forgettingDetected: integer("forgetting_detected").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    uniqueIndex("uq_retrieval_item").on(t.userId, t.itemType, t.itemId),
    index("idx_retrieval_due").on(t.userId, t.dueAt),
  ],
);

export const reviewHistory = sqliteTable(
  "review_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    retrievalItemId: integer("retrieval_item_id").notNull(),
    userId: integer("user_id").notNull(),
    mode: text("mode").$type<ReviewMode>().notNull(),
    prompt: text("prompt").notNull().default(""),
    expected: text("expected").notNull().default(""),
    userResponse: text("user_response").notNull().default(""),
    correct: integer("correct").notNull().default(0), // 0/1
    quality: integer("quality").notNull().default(0), // 0-5
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_history_item").on(t.retrievalItemId)],
);

// ── Missions & progress ─────────────────────────────────────────────────────

export const dailyMissions = sqliteTable(
  "daily_missions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD local
    plan: text("plan", { mode: "json" }).$type<MissionPlan>().notNull(),
    status: text("status").$type<"pending" | "completed">().notNull().default("pending"),
    counters: text("counters", { mode: "json" })
      .$type<MissionCounters>()
      .notNull()
      .default({ exposure: 0, understood: 0, retrieved: 0, used: 0, retained: 0 }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [uniqueIndex("uq_mission_user_date").on(t.userId, t.date)],
);

export const userProgress = sqliteTable(
  "user_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    date: text("date").notNull(),
    metrics: text("metrics", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
  },
  (t) => [uniqueIndex("uq_progress_user_date").on(t.userId, t.date)],
);

export const ieltsResults = sqliteTable("ielts_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  skill: text("skill").notNull(), // overall|listening|reading|writing|speaking
  score: real("score").notNull(),
  bandDetails: text("band_details", { mode: "json" }),
  source: text("source").notNull().default("self"), // self|estimate|attempt
  date: text("date").notNull(),
});

export const learningSessions = sqliteTable("learning_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  missionId: integer("mission_id"),
  type: text("type").notNull(), // mission|review|lab|speaking|writing
  startedAt: integer("started_at").notNull().$defaultFn(() => Date.now()),
  endedAt: integer("ended_at"),
  summary: text("summary"),
});

// ── ECDICT dictionary corpus (imported, read-only) ──────────────────────────

export const dictionary = sqliteTable("dictionary", {
  word: text("word").primaryKey(),
  phonetic: text("phonetic").notNull().default(""),
  definitionEn: text("definition_en").notNull().default(""),
  translationZh: text("translation_zh").notNull().default(""),
  pos: text("pos").notNull().default(""),
  collins: integer("collins").notNull().default(0), // Collins star rating 1-5
  oxford: integer("oxford").notNull().default(0), // 1 = Oxford 3000
  tag: text("tag").notNull().default(""), // zk/gk/cet4/cet6/ky/toefl/ielts...
  bnc: integer("bnc").notNull().default(0), // BNC frequency rank (smaller = commoner)
  frq: integer("frq").notNull().default(0), // COCA frequency rank
  exchange: text("exchange").notNull().default(""), // morphology: p:d/i:ing/3:s...
});

export const wordLemmas = sqliteTable("word_lemmas", {
  form: text("form").primaryKey(), // inflected surface form
  base: text("base").notNull(), // canonical base form
});

/** Daily snapshot of the user's complete learning state. */
export const learningSnapshots = sqliteTable(
  "learning_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    date: text("date").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<LearningSnapshot>().notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [uniqueIndex("uq_snapshot_user_date").on(t.userId, t.date)],
);

/** A single measurable change with full evidence trail. */
export const progressEvents = sqliteTable(
  "progress_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    metric: text("metric").notNull(),
    previousValue: real("previous_value").notNull(),
    newValue: real("new_value").notNull(),
    delta: real("delta").notNull(),
    reason: text("reason").notNull().default(""),
    evidence: text("evidence").notNull().default(""),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_progress_user_metric").on(t.userId, t.metric)],
);

/** IELTS tasks — the measurement + transfer units. */
export const ieltsTasks = sqliteTable("ielts_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskType: text("task_type").notNull(),
  skill: text("skill").notNull(),
  difficulty: integer("difficulty").notNull().default(3),
  topic: text("topic").notNull().default("general"),
  prompt: text("prompt").notNull(),
  content: text("content"),
  questions: text("questions", { mode: "json" }),
  /** Optional per-question explanations (Chinese): {examId, passageNotes[], questionExplanations[]} —
   * from the IELTS-practice reading bank; shown after submission. Null = none. */
  explanations: text("explanations", { mode: "json" }),
  targetChunkIds: text("target_chunk_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
  estimatedBand: real("estimated_band").notNull().default(6),
  timeLimitMinutes: integer("time_limit_minutes").notNull().default(20),
  source: text("source").notNull().default("seed"),
  /** Listening tasks: audio file under public/ to play while answering (null = none). */
  audioUrl: text("audio_url"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

// ── V12.2 CET written-test tasks (official structure: 写作|听力|阅读|翻译) ────
// Shape mirrors ielts_tasks where useful but stays a separate table: the
// IELTS engine keeps its contract; CET never touches it and vice versa.

export type CetSection = "writing" | "listening" | "reading" | "translation";
export type CetTaskSource = "official" | "synthetic_test" | "user_imported";

export const cetTasks = sqliteTable(
  "cet_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    examProfile: text("exam_profile").$type<"cet4" | "cet6">().notNull(),
    section: text("section").$type<CetSection>().notNull(),
    /** reading: banked cloze|matching|careful · listening: news|conversation|passage|lecture · writing: essay · translation: passage_cn_to_en */
    taskType: text("task_type").notNull(),
    difficulty: integer("difficulty").notNull().default(3),
    topic: text("topic").notNull().default("general"),
    /** writing: the essay prompt · translation: the Chinese passage · reading/listening: the instruction line */
    prompt: text("prompt").notNull(),
    /** reading: passage text · listening: transcript (learning mode only) · writing/translation: reference answer */
    content: text("content"),
    /** objective questions [{question, options[], answer}] — writing/translation: null */
    questions: text("questions", { mode: "json" }).$type<
      { question: string; options: string[]; answer: string }[]
    >(),
    /** 汉译英 reference translation (translation section) */
    referenceAnswer: text("reference_answer"),
    source: text("source").$type<CetTaskSource>().notNull(),
    audioUrl: text("audio_url"),
    durationMinutes: integer("duration_minutes").notNull().default(20),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_cet_tasks_exam_section").on(t.examProfile, t.section),
    index("idx_cet_tasks_exam").on(t.examProfile),
  ],
);

/** V12.2: CET written-test attempt records — real evidence for readiness. */
export const cetAttempts = sqliteTable(
  "cet_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    taskId: integer("task_id").notNull(),
    section: text("section").$type<CetSection>().notNull(),
    mode: text("mode").$type<"learning" | "exam">().notNull(),
    responses: text("responses", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    freeText: text("free_text"),
    correctCount: integer("correct_count"),
    totalCount: integer("total_count"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_cet_attempts_user").on(t.userId),
    index("idx_cet_attempts_user_section").on(t.userId, t.section),
  ],
);

/** V12.2.1: CET Exam-Mode sessions — server-clock section timing.
 * Refresh/back/remount cannot reset or add time: all truth is here. */
export const cetExamSessions = sqliteTable(
  "cet_exam_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    exam: text("exam").$type<"cet4" | "cet6">().notNull(),
    testMode: integer("test_mode").notNull().default(0),
    currentSection: text("current_section").$type<"writing" | "listening" | "reading" | "translation">().notNull(),
    examStartTime: integer("exam_start_time").notNull(),
    sectionStartTime: integer("section_start_time"),
    /** {section: {responses, freeText, sectionEndTime, timedOut}} */
    answers: text("answers", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    timedOut: text("timed_out", { mode: "json" }).$type<string[]>().notNull().default([]),
    submittedAt: integer("submitted_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_cet_exam_user").on(t.userId),
    index("idx_cet_exam_live").on(t.userId, t.submittedAt),
  ],
);

/** One IELTS attempt with full results. */
export const ieltsAttempts = sqliteTable(
  "ielts_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    taskId: integer("task_id").notNull(),
    mode: text("mode").notNull().default("learning"),
    responses: text("responses", { mode: "json" }),
    score: real("score"),
    band: real("band"),
    subSkillResults: text("sub_skill_results", { mode: "json" }),
    transferResults: text("transfer_results", { mode: "json" }),
    strategyIssues: text("strategy_issues", { mode: "json" }).$type<string[]>().notNull().default([]),
    languageErrors: text("language_errors", { mode: "json" }).$type<string[]>().notNull().default([]),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_ielts_attempts_user").on(t.userId)],
);

/** V14 IELTSCB reading imports — one row per imported report session.
 *  Keeps the raw JSON snapshot + canonical conversion + import warnings so a
 *  future site change can be re-adapted without re-fetching, and gives
 *  duplicate detection its stable keys. ielts_tasks/ielts_attempts stay the
 *  business tables the engines already read. */
export const ieltscbImports = sqliteTable(
  "ieltscb_imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    /** linked ielts_tasks.id (source="ieltscb") */
    taskId: integer("task_id").notNull(),
    /** latest linked ielts_attempts.id (external session result) */
    attemptId: integer("attempt_id"),
    /** ieltscb external identifiers */
    paperId: integer("paper_id").notNull(),
    chaptersId: integer("chapters_id").notNull(),
    pType: integer("p_type").notNull(),
    tid: integer("tid").notNull(),
    classify: integer("classify").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    breadcrumb: text("breadcrumb"),
    parserVersion: text("parser_version").notNull(),
    /** sha256 of the raw JSON — change detection for updates */
    rawHash: text("raw_hash").notNull(),
    /** sanitized raw API payload, preserved for future re-adaptation */
    rawSnapshot: text("raw_snapshot", { mode: "json" }),
    /** canonical conversion result (passage/questions/evidence/synonyms…) */
    canonical: text("canonical", { mode: "json" }),
    importWarnings: text("import_warnings", { mode: "json" }).$type<unknown[]>().notNull().default([]),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_ieltscb_imports_user").on(t.userId),
    // one report session (tid) imports once; same test re-taken gets a new tid
    index("idx_ieltscb_imports_report").on(t.userId, t.chaptersId, t.paperId, t.pType, t.tid),
    index("idx_ieltscb_imports_test").on(t.userId, t.chaptersId, t.paperId, t.pType),
  ],
);

/** V15.1 Wrong→Practice ledger — provenance for every targeted practice
 *  attempt, SEPARATE from the original error (which is never modified).
 *  Grading/scheduling itself lives in the existing retrieval/retention
 *  engines (submitRetentionReview writes review_history + updates the
 *  ladder); this table only records WHERE the practice came from. */
export const wrongPracticeLog = sqliteTable(
  "wrong_practice_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    /** client session id issued by /start — one submission per stage */
    sessionId: text("session_id").notNull(),
    errorId: integer("error_id").notNull(),
    /** e.g. "IELTSCB report" | "Error Bank" | "Review" */
    source: text("source").notNull(),
    sourceQuestion: text("source_question"),
    /** "retrieval" | "transfer" */
    practiceType: text("practice_type").notNull(),
    /** "correct" | "partial" | "incorrect" */
    result: text("result").notNull(),
    quality: integer("quality").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("idx_wrong_practice_user").on(t.userId),
    // round-2: UNIQUE — the database itself backstops the duplicate-stage
    // guard so two concurrent submissions can never both grade + log
    uniqueIndex("uq_wrong_practice_session_stage").on(t.sessionId, t.practiceType),
  ],
);

/** Hardening: practice sessions ISSUED by startWrongPractice. A submission
 *  must present an id this table issued to the same learner for the same
 *  error — fabricated ids can no longer fabricate practice evidence (review
 *  counts, SM-2 churn). Rows are swept 24h after issue (next start). */
export const wrongPracticeSessions = sqliteTable(
  "wrong_practice_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    userId: integer("user_id").notNull(),
    errorId: integer("error_id").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("idx_wp_sessions_user").on(t.userId)],
);

/** Per-skill IELTS tracking — IELTS Performance ≠ Language Ability. */
export const ieltsSkillProfiles = sqliteTable(
  "ielts_skill_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    skill: text("skill").notNull(),
    estimatedBand: real("estimated_band"),
    bandLow: real("band_low"),
    bandHigh: real("band_high"),
    confidence: text("confidence").notNull().default("low"),
    sampleCount: integer("sample_count").notNull().default(0),
    subSkillScores: text("sub_skill_scores", { mode: "json" }).$type<Record<string, number>>().notNull().default({}),
    strategyIssues: text("strategy_issues", { mode: "json" }).$type<string[]>().notNull().default([]),
    targetBand: real("target_band"),
    lastAssessedAt: integer("last_assessed_at"),
  },
  (t) => [uniqueIndex("uq_ielts_profile_user_skill").on(t.userId, t.skill)],
);

/** External learning sessions — user logs their own training with external AI tools. */
export const externalSessions = sqliteTable("external_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tool: text("tool").notNull().default("chatgpt_external"), // chatgpt_external
  skill: text("skill").notNull(), // listening|speaking
  durationMinutes: integer("duration_minutes").notNull().default(10),
  difficulty: text("difficulty").notNull().default("medium"), // easy|medium|hard
  selfAssessment: integer("self_assessment").notNull().default(3), // 1-5
  struggledWith: text("struggled_with"),
  missionId: integer("mission_id"),
  recommendedReason: text("recommended_reason"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
}, (t) => [index("idx_external_user").on(t.userId)]);

/** App-level key/value config (AI provider credentials saved from Settings). */
export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

// Shared row types used across services and pages.
export type User = typeof users.$inferSelect;
export type LearningProfile = typeof learningProfiles.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type Sentence = typeof sentences.$inferSelect;
export type ListeningClip = typeof listeningClips.$inferSelect;
export type Vocabulary = typeof vocabularies.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type ErrorRow = typeof errors.$inferSelect;
export type RetrievalItem = typeof retrievalItems.$inferSelect;
export type DailyMission = typeof dailyMissions.$inferSelect;
export type SpeakingAttempt = typeof speakingAttempts.$inferSelect;
export type WritingAttempt = typeof writingAttempts.$inferSelect;
export type LexicalRelation = typeof lexicalRelations.$inferSelect;
