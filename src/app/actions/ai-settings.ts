"use server";

/* ── AI provider credentials & word targets (Settings page) ── split from src/app/actions.ts (step-11); the original
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

async function upsertConfig(key: string, value: string): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: Date.now() } });
}

// ── Immersion level (topbar quick switch) ──────────────────────────────────

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
