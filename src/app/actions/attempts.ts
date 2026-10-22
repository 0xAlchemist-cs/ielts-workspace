"use server";

/* ── Writing/speaking attempt persistence ── split from src/app/actions.ts (step-11); the original
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

export async function saveWritingAction(input: {
  taskType: string;
  prompt: string;
  text: string;
  feedback: unknown;
  ieltsScores: unknown;
  usedChunkIds?: number[];
}): Promise<number> {
  const cu = await getCurrentUser();
  if (!cu) return 0;
  const [row] = await db
    .insert(writingAttempts)
    .values({
      userId: cu.user.id,
      taskType: input.taskType,
      prompt: input.prompt,
      text: input.text,
      feedback: input.feedback as object,
      ieltsScores: input.ieltsScores as object,
      usedChunkIds: input.usedChunkIds ?? [],
    })
    .returning({ id: writingAttempts.id });
  const usedCount = input.usedChunkIds?.length ?? 0;
  if (usedCount > 0) await recordEvent(cu.user.id, "used", usedCount);
  revalidatePath("/ielts");
  return row.id;
}

export async function saveWritingRevisionAction(attemptId: number, revision: string): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  // attemptId alone would find ANY goal's row — scope to the current user so
  // a revision can never cross into another exam profile's attempt
  await db
    .update(writingAttempts)
    .set({ revisionText: revision })
    .where(and(eq(writingAttempts.id, attemptId), eq(writingAttempts.userId, cu.user.id)));
  revalidatePath("/writing");
}

export async function saveSpeakingAction(input: {
  prompt: string;
  transcript: string;
  feedback: unknown;
  ieltsScores: unknown;
  usedChunkIds: number[];
  round: number;
  followUp: string | null;
  missionSpeaking?: boolean;
}): Promise<number> {
  const cu = await getCurrentUser();
  if (!cu) return 0;
  const [row] = await db
    .insert(speakingAttempts)
    .values({
      userId: cu.user.id,
      prompt: input.prompt,
      transcript: input.transcript,
      feedback: input.feedback as object,
      ieltsScores: input.ieltsScores as object,
      usedChunkIds: input.usedChunkIds,
      round: input.round,
      followUp: input.followUp,
    })
    .returning({ id: speakingAttempts.id });
  const usedCount = input.usedChunkIds.length;
  if (usedCount > 0) await recordEvent(cu.user.id, "used", usedCount);
  revalidatePath("/speaking");
  revalidatePath("/ielts");
  return row.id;
}
// (upsertConfig moved to ./ai-settings.ts with its callers in step-11)
