"use server";

/* ── Content import (paste/URL) + difficulty assessment ── split from src/app/actions.ts (step-11); the original
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

// ── Immersion level (topbar quick switch) ──────────────────────────────────

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
