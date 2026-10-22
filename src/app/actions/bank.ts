"use server";

/* ── Personal bank: chunks, vocab, sentences, errors ── split from src/app/actions.ts (step-11); the original
 *  module re-exports these unchanged — UI call sites keep working. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  learningProfiles,
  users,
  writingAttempts,
  speakingAttempts,
  contents,
  sentences as sentencesT,
  grammarPatterns,
  externalSessions,
  appConfig,
  retrievalItems,
} from "@/db/schema";
import { getActiveExam, getCurrentUser, setActiveExam } from "@/server/current-user";
import { isExamProfile } from "@/lib/exam-profiles";
import { generateTodayMission, getTodayMission, markStepDone, toggleTodayLite } from "@/server/services/mission";
import { contentFingerprint, legacyContentFingerprint, markContentCompleted, markContentUsed } from "@/server/services/content-selection";
import { analyzeContent } from "@/server/services/content-analysis";
import { recordEvent } from "@/server/services/progress";
import {
  addError,
  saveCorpusChunk,
  saveCustomChunk,
  saveUserSentence,
  saveVocabulary,
  toggleErrorStatus,
} from "@/server/services/bank";
import { contentTokens, splitSentences, tokenizeWords } from "@/lib/text";
import { wordRanksFor } from "@/server/services/dictionary";
import { logChunkEvent } from "@/server/services/events";
import { ensureRetrievalItem } from "@/server/services/retrieval";
import { ieltsQuestionFor, transferPromptFor } from "@/lib/banks";
import { getAIProviderStatus, invalidateAIConfigCache, loadAIProviderConfig } from "@/lib/ai";
import { checkPublicHttpUrl, fetchPublicPage } from "@/lib/url-guard";
import type { CEFR, ErrorCategory } from "@/lib/types";

// ── Immersion level (topbar quick switch) ──────────────────────────────────

export async function saveCorpusChunkAction(chunkId: number): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await saveCorpusChunk(cu.user.id, chunkId);
  revalidatePath("/chunks");
  revalidatePath("/");
}

export async function saveCustomChunkAction(input: {
  text: string;
  pattern?: string;
  meaningEn?: string;
  meaningZh?: string;
  examples?: string[];
  sourceContentId?: number | null;
}): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await saveCustomChunk(cu.user.id, input);
  revalidatePath("/chunks");
}

export async function saveVocabAction(word: string, context?: string): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await saveVocabulary(cu.user.id, word, context);
}

export async function saveSentenceAction(
  refType: "chunk" | "vocab" | "grammar",
  refId: number,
  text: string,
): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await saveUserSentence(cu.user.id, refType, refId, text);
}

export async function addErrorAction(input: {
  category: ErrorCategory;
  wrongForm: string;
  correctForm: string;
  explanation?: string;
}): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await addError(cu.user.id, { ...input, source: "manual" });
  revalidatePath("/errors");
}

export async function toggleErrorAction(errorId: number): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await toggleErrorStatus(cu.user.id, errorId);
  revalidatePath("/errors");
}

// ── Attempts (non-AI persistence; AI parts flow through API routes) ─────────
