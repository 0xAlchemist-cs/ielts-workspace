"use server";

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

// ── Content import (paste text or public URL) ──────────────────────────────

function extractReadable(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  // rebuild paragraph breaks on sentence boundaries (crude but effective)
  body = body.replace(/(?<=[.!?])\s{2,}/g, "\n\n");
  const title = titleMatch?.[1]?.trim().slice(0, 120) ?? "";
  return { title, text: body };
}

export async function assessDifficultyAction(text: string): Promise<{
  cefr: string;
  advancedRatio: number;
  avgSentenceLen: number;
  words: number;
}> {
  const trimmed = text.trim();
  const sents = splitSentences(trimmed.replace(/\n+/g, "\n\n"));
  const words = tokenizeWords(trimmed);

  // Rank-based scoring over CONTENT words only (function words drag the mean down).
  const content = contentTokens(trimmed);
  const uniqueLower = [...new Set(content.map((w) => w))];
  const ranks = wordRanksFor(uniqueLower);
  const logs: number[] = [];
  let advanced = 0;
  let counted = 0;
  for (const w of uniqueLower) {
    if (ranks[w] === undefined) continue;
    counted++;
    logs.push(Math.log10(ranks[w]));
    if (ranks[w] > 12000) advanced++;
  }
  const avgLog = logs.length ? logs.reduce((a, b) => a + b, 0) / logs.length : 4;
  const advancedRatio = counted ? Math.round((advanced / counted) * 1000) / 10 : 0;
  const avgSentenceLen = sents.length ? Math.round(words.length / sents.length) : 0;

  let cefr = "B1";
  if (avgLog >= 3.9 || avgSentenceLen >= 24) cefr = "B2";
  if (avgLog >= 4.3 || avgSentenceLen >= 30) cefr = "C1";
  return { cefr, advancedRatio, avgSentenceLen, words: words.length };
}

export async function importContentAction(input: {
  title?: string;
  topic?: string;
  cefr?: string;
  text?: string;
  url?: string;
}): Promise<{ ok: boolean; id?: number; duplicate?: boolean; error?: string }> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false, error: "未登录" };

  let body = (input.text ?? "").trim();
  let title = (input.title ?? "").trim();
  let sourceNote = "";

  if (!body && input.url?.trim()) {
    // SSRF-safe fetch: the strong guard (hostname + DNS resolution) validates
    // the URL AND every redirect hop; redirects are followed manually, never
    // by the fetch runtime (which would skip the guard).
    const res = await fetchPublicPage(input.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IELTSWorkspace/1.0)" },
    });
    if (!res.ok) return { ok: false, error: `抓取失败：${res.error}` };
    if (res.status !== 200) return { ok: false, error: `抓取失败：HTTP ${res.status}` };
    const parsed = extractReadable(res.text);
    body = parsed.text;
    if (!title) title = parsed.title;
    sourceNote = ` (source: ${new URL(res.url).hostname})`;
  }

  const words = tokenizeWords(body).length;
  if (words < 50) {
    return { ok: false, error: `内容太短（${words} 词）——至少需要 50 词的英文正文` };
  }
  if (!/[a-zA-Z]/.test(body)) {
    return { ok: false, error: "未检测到英文正文，请确认粘贴的是英文文章" };
  }
  if (!title) {
    const firstLine = body.split("\n")[0]?.trim() ?? "Imported article";
    title = firstLine.split(/[.!?]/)[0].slice(0, 80) || "Imported article";
  }

  const cefr = (["A2", "B1", "B2", "C1"].includes(input.cefr ?? "") ? input.cefr : "B2") as CEFR;
  // Dedup guard: the same body never enters the library twice.
  // exam-aware: pasted text joins the ACTIVE exam's corpus; identical text in
  // another exam's corpus is that goal's material, not a duplicate (V8).
  // Dual-read (step-05): historical rows carry the legacy prefix fingerprint,
  // new rows the full-text one; a legacy hit is verified against the full
  // body so same-prefix-different-ending articles are never swallowed.
  const exam = cu.user.examProfile;
  const fingerprint = contentFingerprint(body);
  const legacyFingerprint = legacyContentFingerprint(body);
  const [dup] = await db
    .select({ id: contents.id, fingerprint: contents.fingerprint, body: contents.body })
    .from(contents)
    .where(and(inArray(contents.fingerprint, [fingerprint, legacyFingerprint]), eq(contents.examProfile, exam)))
    .limit(1);
  const fullTextEquals = dup != null &&
    dup.body.trim().toLowerCase().replace(/\s+/g, " ") === body.trim().toLowerCase().replace(/\s+/g, " ");
  if (dup && (dup.fingerprint === fingerprint || fullTextEquals)) return { ok: true, id: dup.id, duplicate: true };

  const [row] = await db
    .insert(contents)
    .values({
      type: "reading",
      title: (title + sourceNote).slice(0, 180),
      topic: (input.topic ?? "imported").slice(0, 40),
      cefr,
      difficulty: 3,
      vocabDensity: 0.5,
      grammarComplexity: 3,
      ieltsRelevance: 3,
      summaryEn: body.slice(0, 160),
      body,
      minutes: Math.max(2, Math.ceil(words / 180)),
      fingerprint,
      examProfile: exam,
    })
    .returning({ id: contents.id });

  const sents = splitSentences(body);
  if (sents.length) {
    await db.insert(sentencesT).values(sents.map((text, i) => ({ contentId: row.id, orderNo: i, text })));
  }

  // tolerate direct (non-request) invocation from scripts
  try {
    revalidatePath("/library");
    revalidatePath("/");
  } catch {
    /* outside request context */
  }
  return { ok: true, id: row.id };
}

// ── Bank operations ────────────────────────────────────────────────────────

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

// ── AI provider credentials (Settings page; saved in local DB) ──────────────

async function upsertConfig(key: string, value: string): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: Date.now() } });
}

export async function saveAIProviderConfigAction(input: {
  baseUrl: string;
  apiKey: string;
  model?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const check = await checkPublicHttpUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!check.ok) return { ok: false, error: check.error };
  if (!apiKey) return { ok: false, error: "API key is empty" };
  const baseUrl = check.url;

  await upsertConfig("ai_base_url", baseUrl);
  await upsertConfig("ai_api_key", apiKey);
  if (input.model?.trim()) await upsertConfig("ai_model", input.model.trim());
  else await db.delete(appConfig).where(eq(appConfig.key, "ai_model"));

  invalidateAIConfigCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearAIProviderConfigAction(): Promise<{ ok: boolean }> {
  await db.delete(appConfig).where(eq(appConfig.key, "ai_base_url"));
  await db.delete(appConfig).where(eq(appConfig.key, "ai_api_key"));
  await db.delete(appConfig).where(eq(appConfig.key, "ai_model"));
  invalidateAIConfigCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Reading Lab: ad-hoc word target (articles without pre-set targets) ──────

/** Saves a tapped word as a custom chunk (own bank + retrieval item) and
 *  returns everything the Lab needs to study it, mirroring the page-level
 *  toTarget derivation. Keeps generation judging/activation untouched. */
export async function addWordTargetAction(input: {
  word: string;
  meaningEn?: string;
  meaningZh?: string;
  example: string;
  contentId: number;
}): Promise<{
  chunkId: number;
  retrievalItemId: number;
  text: string;
  pattern: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  zhCue: string;
  transferInstruction: string;
  transferSentence: string | null;
  ieltsQuestion: string;
} | null> {
  const cu = await getCurrentUser();
  if (!cu) return null;
  const saved = await saveCustomChunk(cu.user.id, {
    text: input.word.trim(),
    pattern: "",
    meaningEn: input.meaningEn ?? "",
    meaningZh: input.meaningZh ?? "",
    examples: [input.example],
    sourceContentId: input.contentId,
  });
  await ensureRetrievalItem(cu.user.id, "chunk", saved.id);
  const [item] = await db
    .select({ id: retrievalItems.id })
    .from(retrievalItems)
    .where(
      and(
        eq(retrievalItems.userId, cu.user.id),
        eq(retrievalItems.itemType, "chunk"),
        eq(retrievalItems.itemId, saved.id),
      ),
    )
    .limit(1);
  const transfer = transferPromptFor(saved.text);
  revalidatePath("/chunks");
  return {
    chunkId: saved.id,
    retrievalItemId: item?.id ?? 0,
    text: saved.text,
    pattern: saved.pattern,
    meaningEn: saved.meaningEn,
    meaningZh: saved.meaningZh,
    examples: saved.examples,
    zhCue: saved.meaningZh || saved.meaningEn,
    transferInstruction: transfer.instruction,
    transferSentence: transfer.sentence,
    ieltsQuestion: ieltsQuestionFor(saved.text),
  };
}

/** One tiny real completion to verify the endpoint + key actually work. */
export async function testAIProviderConfigAction(input?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}): Promise<{ ok: boolean; message: string }> {
  const apiKey = input?.apiKey?.trim() || undefined;
  const saved = getAIProviderStatus();
  let useBase = saved.live ? saved.baseUrl : undefined;
  const formBase = input?.baseUrl?.trim();
  if (formBase) {
    // A filled-in URL must itself be valid and public — never silently
    // fall back to the saved config and report a misleading pass.
    const check = await checkPublicHttpUrl(formBase);
    if (!check.ok) return { ok: false, message: check.error };
    useBase = check.url;
  }
  if (!useBase) return { ok: false, message: "No Base URL configured" };

  // The saved key only ever travels to the SAVED base URL. Testing a new
  // address requires its own key in the form — no credential phishing.
  const cfg = loadAIProviderConfig();
  const sameHost = cfg != null && useBase === cfg.baseUrl;
  const resolvedKey = apiKey ?? (sameHost ? cfg.apiKey : "");
  if (!resolvedKey) {
    return {
      ok: false,
      message: "Enter the API key for this address — the saved key is only used for the saved endpoint（新地址需填写对应 Key，已保存的 Key 只发往已保存的端点）",
    };
  }

  const model = input?.model?.trim() || saved.model || "glm-4.6";

  try {
    const res = await fetch(`${useBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolvedKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
      }),
      redirect: "manual", // a redirecting "endpoint" is a probe vector — never follow
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, message: "Endpoint answered with a redirect — not allowed（端点返回了重定向，不允许）" };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `HTTP ${res.status} — ${body.slice(0, 160) || "no detail"}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim();
    return { ok: true, message: reply ? `${model}: ${reply.slice(0, 60)}` : model };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 160) };
  }
}
