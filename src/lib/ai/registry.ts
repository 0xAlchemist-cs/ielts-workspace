/* ── V13 Prompt Registry — the single source of truth for every AI prompt ──
 * Each task has {id, version, systemPrompt, responseSchema}. Business modules
 * ask the Resolver for a composed prompt; they never hold prompt strings. */

import type { z } from "zod";
import { BASE_PROMPT } from "./prompts/base";
import { examPromptProfile } from "./prompts";
import { cefrPrompt } from "./prompts/cefr";
import {
  wordSchema, sentenceSchema, retrievalSchema, speakingSchema,
  writingSchema, paraphraseSchema, tutorSchema, drillSchema,
  contentLevelSchema, cetWritingFeedbackSchema,
  WORD_PROMPT, SENTENCE_PROMPT, RETRIEVAL_PROMPT, SPEAKING_PROMPT,
  WRITING_PROMPT, PARAPHRASE_PROMPT, TUTOR_PROMPT, DRILL_PROMPT,
} from "./tasks";
import { IELTS_CONTENT_LEVEL_PROMPT } from "./prompts/ielts-content-level";
import { CET_WRITING_FEEDBACK_PROMPT } from "./prompts/cet-writing-feedback";
import type { ExamProfile } from "@/lib/exam-profiles";

/* ── Prompt descriptor ───────────────────────────────────────────────────── */

export interface PromptDescriptor<S extends z.ZodTypeAny = z.ZodTypeAny> {
  promptId: string;
  version: string;
  systemPrompt: string;
  responseSchema: S;
  /** "ielts" = only composed for IELTS; "cet" = only for CET-4/6; null = all */
  examScope: "ielts" | "cet" | null;
  /** whether CEFR-level context is appended (IELTS only, per spec) */
  usesCefr: boolean;
}

type TaskKey =
  | "word" | "sentence" | "retrieval" | "speaking" | "writing"
  | "paraphrase" | "tutor" | "drills"
  | "classifyContentLevel" | "cetWritingFeedback";

/* ── Registry ────────────────────────────────────────────────────────────── */

export const PROMPT_REGISTRY: Record<TaskKey, PromptDescriptor> = {
  word: {
    promptId: "word-analysis", version: "v1",
    systemPrompt: WORD_PROMPT, responseSchema: wordSchema,
    examScope: null, usesCefr: true,
  },
  sentence: {
    promptId: "sentence-analysis", version: "v1",
    systemPrompt: SENTENCE_PROMPT, responseSchema: sentenceSchema,
    examScope: null, usesCefr: true,
  },
  retrieval: {
    promptId: "retrieval-feedback", version: "v1",
    systemPrompt: RETRIEVAL_PROMPT, responseSchema: retrievalSchema,
    examScope: null, usesCefr: false, // grading is objective — CEFR never changes correctness
  },
  speaking: {
    promptId: "ielts-speaking-feedback", version: "v1",
    systemPrompt: SPEAKING_PROMPT, responseSchema: speakingSchema,
    examScope: "ielts", usesCefr: true,
  },
  writing: {
    promptId: "ielts-writing-evaluation", version: "v1",
    systemPrompt: WRITING_PROMPT, responseSchema: writingSchema,
    examScope: "ielts", usesCefr: true,
  },
  paraphrase: {
    promptId: "paraphrase-evaluation", version: "v1",
    systemPrompt: PARAPHRASE_PROMPT, responseSchema: paraphraseSchema,
    examScope: null, usesCefr: true,
  },
  tutor: {
    promptId: "ai-tutor", version: "v1",
    systemPrompt: TUTOR_PROMPT, responseSchema: tutorSchema,
    examScope: null, usesCefr: true,
  },
  drills: {
    promptId: "parallel-drills", version: "v1",
    systemPrompt: DRILL_PROMPT, responseSchema: drillSchema,
    examScope: null, usesCefr: false, // drill difficulty follows the error, not the level
  },
  classifyContentLevel: {
    promptId: "content-level-classifier", version: "v1",
    systemPrompt: IELTS_CONTENT_LEVEL_PROMPT, responseSchema: contentLevelSchema,
    examScope: "ielts", usesCefr: false, // classification must never bend to learner level
  },
  cetWritingFeedback: {
    promptId: "cet-writing-feedback", version: "v1",
    systemPrompt: CET_WRITING_FEEDBACK_PROMPT, responseSchema: cetWritingFeedbackSchema,
    examScope: "cet", usesCefr: false, // CET has no CEFR layer (product rule)
  },
};

/* ── Prompt Resolver — composes Base + Exam + CEFR + Module ─────────────── */

export interface ResolvePromptInput {
  task: TaskKey;
  exam: ExamProfile;
  /** IELTS only — the learner's current CEFR level (A2-C1) */
  cefr?: string | null;
}

export interface ResolvedPrompt {
  promptId: string;
  version: string;
  /** the fully composed system prompt to send */
  systemPrompt: string;
  /** zod schema for validating the model's output */
  responseSchema: z.ZodTypeAny;
}

export function resolvePrompt(input: ResolvePromptInput): ResolvedPrompt {
  const descriptor = PROMPT_REGISTRY[input.task];
  if (!descriptor) throw new Error(`Unknown AI task: ${input.task}`);

  // exam-scope check: a CET-scoped task must never run under IELTS and vice versa
  if (descriptor.examScope === "ielts" && input.exam !== "ielts") {
    throw new Error(`Task ${input.task} is IELTS-only (active exam: ${input.exam})`);
  }
  if (descriptor.examScope === "cet" && input.exam === "ielts") {
    throw new Error(`Task ${input.task} is CET-only (active exam: ${input.exam})`);
  }

  // composition: Module prompt (which already contains the old persona) stays
  // as the base — the BASE_PROMPT's injection guard is always appended
  let prompt = descriptor.systemPrompt;

  // exam context (for tasks that aren't already exam-specific)
  const examSpecific = descriptor.examScope !== null;
  if (!examSpecific) {
    prompt += `\n\n---\n${examPromptProfile(input.exam)}`;
  }

  // CEFR context (IELTS only, for tasks that use it)
  if (descriptor.usesCefr && input.exam === "ielts" && input.cefr) {
    const cefrBlock = cefrPrompt(input.cefr);
    if (cefrBlock) prompt += `\n\n---\n${cefrBlock}`;
  }

  // injection guard (always, from the base)
  prompt += `\n\n---\n${BASE_PROMPT}`;

  return {
    promptId: descriptor.promptId,
    version: descriptor.version,
    systemPrompt: prompt,
    responseSchema: descriptor.responseSchema,
  };
}
