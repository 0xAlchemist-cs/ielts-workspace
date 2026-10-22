"use server";

/* ── Learning profile & onboarding settings ── split from src/app/actions.ts (step-11); the original
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

export async function setExamProfileAction(exam: string): Promise<void> {
  if (!isExamProfile(exam)) return;
  await setActiveExam(exam);
  revalidatePath("/", "layout");
}

export async function setImmersionLevelAction(level: number): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  const clamped = Math.min(4, Math.max(1, Math.round(level)));
  await db
    .update(learningProfiles)
    .set({ immersionLevel: clamped, updatedAt: Date.now() })
    .where(eq(learningProfiles.userId, cu.user.id));
  revalidatePath("/", "layout");
}

export async function setDailyMinutesAction(minutes: number): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  const clamped = Math.min(240, Math.max(10, Math.round(minutes)));
  await db
    .update(learningProfiles)
    .set({ dailyMinutes: clamped, updatedAt: Date.now() })
    .where(eq(learningProfiles.userId, cu.user.id));
  revalidatePath("/settings");
  revalidatePath("/");
}

/** V9: learning level (CEFR) — adapts recommendations & speaking prompts;
 * never touches history. IELTS-profile surface, but harmless if called. */
export async function setLearningLevelAction(level: string): Promise<void> {
  if (level !== "A2" && level !== "B1" && level !== "B2" && level !== "C1") return;
  const cu = await getCurrentUser();
  if (!cu) return;
  await db
    .update(learningProfiles)
    .set({ cefr: level, updatedAt: Date.now() })
    .where(eq(learningProfiles.userId, cu.user.id));
  revalidatePath("/", "layout");
}

/** V12.1: IELTS target band — readiness recalculates against it; history never touched. */
export async function setTargetBandAction(band: number | null): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  const { setTargetBand } = await import("@/server/services/readiness");
  await setTargetBand(cu.user.id, band);
  revalidatePath("/settings");
  revalidatePath("/profile");
  revalidatePath("/");
}

// ── Onboarding ──────────────────────────────────────────────────────────────

export async function quickStartAction(): Promise<void> {
  const existing = await getCurrentUser();
  if (existing) {
    redirect("/");
  }
  const exam = await getActiveExam();
  const [u] = await db.insert(users).values({ name: "Learner", examProfile: exam }).returning();
  await db.insert(learningProfiles).values({
    userId: u.id,
    cefr: "B1",
    immersionLevel: 1,
    dailyMinutes: 45,
  });
  await generateTodayMission(u.id);
  redirect("/");
}

export async function onboardAction(formData: FormData): Promise<void> {
  const existing = await getCurrentUser();
  const name = String(formData.get("name") || "Learner").trim() || "Learner";
  const num = (k: string): number | null => {
    const v = formData.get(k);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const list = (k: string): string[] =>
    formData.getAll(k).map(String).filter(Boolean);
  const profile = {
    ieltsOverall: num("ieltsOverall"),
    ieltsListening: num("ieltsListening"),
    ieltsReading: num("ieltsReading"),
    ieltsWriting: num("ieltsWriting"),
    ieltsSpeaking: num("ieltsSpeaking"),
    cefr: (String(formData.get("cefr") || "B1") as "A2" | "B1" | "B2" | "C1"),
    immersionLevel: Number(formData.get("immersionLevel") || 1),
    dailyMinutes: Number(formData.get("dailyMinutes") || 45),
    grammarWeaknesses: list("grammarWeaknesses"),
    speakingWeaknesses: list("speakingWeaknesses"),
    listeningWeaknesses: list("listeningWeaknesses"),
  };

  let userId: number;
  if (existing) {
    userId = existing.user.id;
    await db
      .update(learningProfiles)
      .set({ ...profile, updatedAt: Date.now() })
      .where(eq(learningProfiles.userId, userId));
  } else {
    const exam = await getActiveExam();
    const [u] = await db.insert(users).values({ name, examProfile: exam }).returning();
    userId = u.id;
    await db.insert(learningProfiles).values({ userId, ...profile });
  }
  await generateTodayMission(userId);
  redirect("/");
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const cu = await getCurrentUser();
  if (!cu) return;
  const num = (k: string): number | null => {
    const v = formData.get(k);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  await db
    .update(learningProfiles)
    .set({
      ieltsOverall: num("ieltsOverall"),
      ieltsListening: num("ieltsListening"),
      ieltsReading: num("ieltsReading"),
      ieltsWriting: num("ieltsWriting"),
      ieltsSpeaking: num("ieltsSpeaking"),
      cefr: String(formData.get("cefr") || cu.profile.cefr) as "A2" | "B1" | "B2" | "C1",
      immersionLevel: Number(formData.get("immersionLevel") || cu.profile.immersionLevel),
      dailyMinutes: Number(formData.get("dailyMinutes") || cu.profile.dailyMinutes),
      grammarWeaknesses: formData.getAll("grammarWeaknesses").map(String),
      speakingWeaknesses: formData.getAll("speakingWeaknesses").map(String),
      listeningWeaknesses: formData.getAll("listeningWeaknesses").map(String),
      updatedAt: Date.now(),
    })
    .where(eq(learningProfiles.userId, cu.user.id));
  revalidatePath("/profile");
  revalidatePath("/");
}

// ── Learning events ────────────────────────────────────────────────────────
