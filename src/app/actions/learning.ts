"use server";

/* ── Learning events, mission steps, external sessions, listening lab persistence ── split from src/app/actions.ts (step-11); the original
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

export async function recordExposureAction(contentId: number): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await recordEvent(cu.user.id, "exposure");
  // Rotation engine: a page entry counts as a "use" (cooldown + novelty).
  await markContentUsed(cu.user.id, contentId);
}

export async function markStepAction(step: string): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await markStepDone(
    cu.user.id,
    step as "reading" | "listening" | "notice" | "deep" | "retrieval" | "speaking" | "transfer",
  );
  // Content-history completion: the mission step's content is now finished.
  if (step === "reading" || step === "listening") {
    const mission = await getTodayMission(cu.user.id);
    const contentId = mission?.plan[step]?.contentId;
    if (mission && contentId) await markContentCompleted(cu.user.id, contentId);
  }
  revalidatePath("/");
}

export async function toggleLiteAction(): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await toggleTodayLite(cu.user.id);
  revalidatePath("/");
}

export async function logEventAction(
  chunkId: number,
  type: "guess" | "analysis" | "generation" | "generation_pass" | "retrieval_attempt" | "retrieval_success" | "context_transfer" | "speaking_use" | "ielts_use" | "listen_recall" | "listen_shadow",
  detail = "",
): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  await logChunkEvent(cu.user.id, chunkId, type, detail);
}

// ── External Learning Hub ──────────────────────────────────────────────────

export async function logExternalSessionAction(input: {
  skill: string;
  durationMinutes: number;
  difficulty: string;
  selfAssessment: number;
  struggledWith?: string;
  missionId?: number | null;
  recommendedReason?: string;
}): Promise<{ ok: boolean }> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false };
  await db.insert(externalSessions).values({
    userId: cu.user.id,
    tool: "chatgpt_external",
    skill: input.skill,
    durationMinutes: input.durationMinutes,
    difficulty: input.difficulty,
    selfAssessment: Math.max(1, Math.min(5, input.selfAssessment)),
    struggledWith: input.struggledWith?.slice(0, 500) ?? null,
    missionId: input.missionId ?? null,
    recommendedReason: input.recommendedReason?.slice(0, 500) ?? null,
  });

  // Record as a real learning event (exposure only — self-assessment is NOT objective ability)
  await recordEvent(cu.user.id, "exposure");
  revalidatePath("/external");
  revalidatePath("/");
  return { ok: true };
}

export async function getExternalSessionsAction(): Promise<
  { id: number; skill: string; durationMinutes: number; difficulty: string; selfAssessment: number; struggledWith: string | null; createdAt: number }[]
> {
  const cu = await getCurrentUser();
  if (!cu) return [];
  const rows = await db
    .select()
    .from(externalSessions)
    .where(eq(externalSessions.userId, cu.user.id))
    .orderBy(desc(externalSessions.createdAt))
    .limit(20);
  return rows.map((r) => ({
    id: r.id,
    skill: r.skill,
    durationMinutes: r.durationMinutes,
    difficulty: r.difficulty,
    selfAssessment: r.selfAssessment,
    struggledWith: r.struggledWith,
    createdAt: r.createdAt,
  }));
}

// ── Grammar / Sentence / Spoken pattern registration ───────────────────────

export async function registerPatternAction(input: {
  pattern: string;
  meaning: string;
  meaningZh?: string;
  examples?: string[];
  kind?: "grammar" | "sentence_pattern" | "spoken_pattern";
}): Promise<{ ok: boolean; error?: string }> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false, error: "未登录" };
  const kind = input.kind ?? "grammar";
  const { ensureRetrievalItem } = await import("@/server/services/retrieval");

  const existing = await db
    .select({ id: grammarPatterns.id })
    .from(grammarPatterns)
    .where(and(eq(grammarPatterns.userId, cu.user.id), eq(grammarPatterns.pattern, input.pattern)))
    .limit(1);
  if (existing.length) return { ok: true };

  const [row] = await db
    .insert(grammarPatterns)
    .values({
      userId: cu.user.id,
      pattern: input.pattern.trim(),
      meaning: input.meaning.trim(),
      meaningZh: (input.meaningZh ?? "").trim(),
      examples: input.examples ?? [],
      kind,
    })
    .returning({ id: grammarPatterns.id });
  await ensureRetrievalItem(cu.user.id, kind, row.id);
  return { ok: true };
}

// ── Listening Lab ────────────────────────────────────────────────────────────

export async function saveMissAction(input: {
  contentId: number;
  clipId?: number | null;
  missed: string;
  category: string;
}): Promise<{ knownButNotRecognized: boolean }> {
  const cu = await getCurrentUser();
  if (!cu) return { knownButNotRecognized: false };
  const { saveMiss } = await import("@/server/services/listening");
  const r = await saveMiss({
    userId: cu.user.id,
    contentId: input.contentId,
    clipId: input.clipId,
    missed: input.missed,
    category: input.category as never,
  });
  return r;
}

export async function saveShadowAction(input: {
  contentId: number;
  clipId: number;
  clipText: string;
  analysis: Record<string, string>;
  chunkId?: number | null;
}): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  const { saveShadowAttempt } = await import("@/server/services/listening");
  await saveShadowAttempt({ userId: cu.user.id, ...input });
}

/** Paste-in transcript for real-audio content (e.g. Cambridge MP3 without a
 *  local text layer). Activates the full analysis pipeline on the real audio. */
export async function attachTranscriptAction(input: {
  contentId: number;
  transcript: string;
}): Promise<{ ok: boolean; error?: string }> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false, error: "未登录" };
  const words = tokenizeWords(input.transcript).length;
  if (words < 30) return { ok: false, error: `转写太短（${words} 词）` };

  const [row] = await db
    .select({ id: contents.id })
    .from(contents)
    .where(eq(contents.id, input.contentId))
    .limit(1);
  if (!row) return { ok: false, error: "内容不存在" };

  // refresh the local analysis on the NEW text — cefr/difficulty/minutes on an
  // untranscribed import were placeholders ("B2"/3/default minutes)
  const analysis = await analyzeContent(input.transcript);
  await db
    .update(contents)
    .set({
      body: input.transcript.trim(),
      summaryEn: input.transcript.trim().slice(0, 160),
      cefr: analysis.cefr as (typeof contents.$inferInsert)["cefr"],
      difficulty: analysis.difficulty,
      minutes: Math.max(1, Math.round(words / 130)),
      ...(analysis.topic ? { topic: analysis.topic } : {}),
    })
    .where(eq(contents.id, input.contentId));

  // the cached sentences belong to the OLD body — replace them wholesale so
  // they can't duplicate or contradict the new transcript
  await db.delete(sentencesT).where(eq(sentencesT.contentId, input.contentId));
  const sents = splitSentences(input.transcript);
  if (sents.length) {
    await db.insert(sentencesT).values(sents.map((text, i) => ({ contentId: input.contentId, orderNo: i, text })));
  }
  try {
    revalidatePath(`/listen/${input.contentId}`);
    revalidatePath("/library");
  } catch {
    /* outside request context */
  }
  return { ok: true };
}
// (extractReadable moved to ./import.ts with its caller in step-11)
