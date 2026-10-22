import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { getActiveExam } from "@/server/current-user";
import {
  chunks as chunksT,
  contentHistory,
  contents,
  errors as errorsT,
  learningProfiles,
  retrievalItems,
} from "@/db/schema";
import type { Content } from "@/db/schema";

/* ── Content Selection / Rotation / Fallback Engine ──────────────────────────
 * One question it answers: "what should this learner open next?" for any
 * skill. Guarantees:
 *   1. NEVER returns null while a valid readable content exists — filters
 *      relax gradually (anti-repeat window shrinks, CEFR/difficulty only
 *      shape the score, never hard-exclude).
 *   2. Deterministic — no randomness; the same DB state always picks the
 *      same content (refresh-stable).
 *   3. Rotation — never-used content outranks used; the most-recently-used
 *      sinks; same content can't repeat while alternatives exist. */

export type SelectionSkill = "reading" | "listening";
export type CompletionStatus = "new" | "in_progress" | "completed" | "reviewable";

export interface SelectedContent {
  content: Content;
  status: CompletionStatus;
  score: number;
  /** 0 = no relaxation needed; each +1 means the anti-repeat window shrank. */
  fallbackLevel: number;
  /** developer-facing factor summary (observability, V10 P23) */
  reason: string;
  /** learner-facing why-this (V10 P24) — data-backed, bilingual */
  reasonHuman: { en: string; zh: string };
  /** V13.2: strength relative to the learner's level (Good fit / Stretching) */
  strength: { en: string | null; zh: string | null };
}

export interface SelectionInput {
  userId: number;
  skill: SelectionSkill;
  /** Defaults to the user's profile CEFR. */
  cefr?: string;
  /** Hard exclusions (e.g. "not the content shown in the other slot today"). */
  excludeContentIds?: number[];
  /** Mission/topic hint — contents whose topic matches score higher. */
  topics?: string[];
  /** Test hook: restrict the pool to given ids. */
  restrictToIds?: number[];
}

const CEFR_LEVEL: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/** Real English prose only — CJK appendices and stubs can't anchor a session. */
export function isReadableContent(c: Content): boolean {
  if (c.body.length < 800) return false;
  const latin = (c.body.match(/[A-Za-z]/g)?.length ?? 0) / c.body.length;
  return latin >= 0.6;
}

/** Stable body hash for import dedup — normalize before hashing so whitespace
 *  or case differences don't defeat the check. The FULL body is hashed:
 *  the old implementation sliced to the first 2000 normalized chars, so two
 *  articles sharing a long prefix but differing at the end collided and the
 *  second was silently dropped as a "duplicate" (step-05 fix). */
export function contentFingerprint(body: string): string {
  const normalized = body.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

/** The pre-fix algorithm (first 2000 normalized chars only). Historical rows
 *  carry these values; dedup lookups read BOTH fingerprints (dual-read) so a
 *  re-import of pre-fix material still resolves to its original row — no
 *  backfill, no migration, fully reverted by restoring the old call sites. */
export function legacyContentFingerprint(body: string): string {
  const normalized = body.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 2000);
  return createHash("sha256").update(normalized).digest("hex");
}

/** Record that the learner opened a content (page entry = a use). */
export async function markContentUsed(userId: number, contentId: number): Promise<void> {
  const [c] = await db
    .select({ type: contents.type })
    .from(contents)
    .where(eq(contents.id, contentId))
    .limit(1);
  if (!c) return;
  const [h] = await db
    .select()
    .from(contentHistory)
    .where(and(eq(contentHistory.userId, userId), eq(contentHistory.contentId, contentId)))
    .limit(1);
  const now = Date.now();
  if (h) {
    await db
      .update(contentHistory)
      .set({ lastUsedAt: now, timesUsed: h.timesUsed + 1, skill: c.type })
      .where(eq(contentHistory.id, h.id));
  } else {
    await db.insert(contentHistory).values({
      userId,
      contentId,
      skill: c.type,
      startedAt: now,
      lastUsedAt: now,
      timesUsed: 1,
      completionStatus: "in_progress",
    });
  }
}

/** The learner finished the content's session (mission step done). */
export async function markContentCompleted(userId: number, contentId: number): Promise<void> {
  await db
    .update(contentHistory)
    .set({ completionStatus: "completed", completedAt: Date.now() })
    .where(and(eq(contentHistory.userId, userId), eq(contentHistory.contentId, contentId)));
}

/**
 * ContentScore =
 *   30% skill match (pool is skill-filtered → constant 1; weight kept for
 *                  cross-skill comparisons in reports)
 * + 20% CEFR match (±1 level tolerated at reduced value)
 * + 15% IELTS relevance
 * + 15% novelty (never used > used once > used often)
 * + 10% LanguageItem value (active-but-not-yet-retained items sourced here)
 * + 10% mission/topic relevance
 * Then cooldown penalties: used <24h ago −0.25; heavily used recently −0.15.
 */
export async function selectNextContent(input: SelectionInput): Promise<SelectedContent | null> {
  const { userId, skill } = input;

  // exam-profile pool: the mission never crosses corpus namespaces (V8)
  const exam = await getActiveExam();
  const pool = (await db.select().from(contents).where(eq(contents.type, skill)))
    .filter((c) => c.examProfile === exam)
    .filter(isReadableContent)
    .filter((c) => (input.restrictToIds ? input.restrictToIds.includes(c.id) : true))
    .filter((c) => !input.excludeContentIds?.includes(c.id));
  // Genuinely empty pool → caller must render an empty state, never a blank page.
  if (pool.length === 0) return null;

  let cefr = input.cefr;
  if (!cefr) {
    const [p] = await db
      .select({ cefr: learningProfiles.cefr })
      .from(learningProfiles)
      .where(eq(learningProfiles.userId, userId))
      .limit(1);
    cefr = p?.cefr ?? "B2";
  }
  const myLevel = CEFR_LEVEL[cefr] ?? 4;

  const historyRows = await db
    .select()
    .from(contentHistory)
    .where(
      and(
        eq(contentHistory.userId, userId),
        inArray(contentHistory.contentId, pool.map((c) => c.id)),
      ),
    );
  const history = new Map(historyRows.map((h) => [h.contentId, h]));
  const recent = [...historyRows].sort((a, b) => b.lastUsedAt - a.lastUsedAt).map((h) => h.contentId);

  // LanguageItem value has two complementary signals (V10.1):
  //  a) provenance — this content SOURCED the learner's mid-ladder items
  //  b) need-overlap — the learner's live weak expressions / recurring-error
  //     corrections occur IN THIS TEXT, so reading it reinforces them in a
  //     fresh context. Either signal can carry the factor; neither alone is
  //     required.
  const chunkRows = await db
    .select({ id: chunksT.id, sourceContentId: chunksT.sourceContentId, text: chunksT.text })
    .from(chunksT)
    .where(eq(chunksT.userId, userId));
  const itemStates = await db
    .select({ itemId: retrievalItems.itemId, learningState: retrievalItems.learningState })
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemType, "chunk")));
  const stateByChunk = new Map(itemStates.map((s) => [s.itemId, s.learningState]));
  const weakByContent = new Map<number, number>();
  const weakNeedTexts: string[] = [];
  for (const ch of chunkRows) {
    const st = stateByChunk.get(ch.id)?.state;
    const midLadder = st && st !== "exposure" && st !== "understanding" && st !== "retention";
    if (!midLadder) continue;
    if (ch.sourceContentId != null) {
      weakByContent.set(ch.sourceContentId, (weakByContent.get(ch.sourceContentId) ?? 0) + 1);
    }
    if (ch.text.length >= 4) weakNeedTexts.push(ch.text);
  }
  const activeErrors = await db
    .select({ correctForm: errorsT.correctForm })
    .from(errorsT)
    .where(and(eq(errorsT.userId, userId), eq(errorsT.status, "active")));
  for (const e of activeErrors) {
    const form = e.correctForm.trim();
    if (form.length >= 4) weakNeedTexts.push(form); // short forms ("at") would match everywhere
  }
  const needHits = (body: string): number => {
    const lower = body.toLowerCase();
    return weakNeedTexts.reduce((n, t) => (lower.includes(t.toLowerCase()) ? n + 1 : n), 0);
  };

  // Anti-repeat with graduated relaxation: exclude last-3 → last-2 → last-1 →
  // allow repeat. A single-content pool re-uses that content (never null).
  let candidates = pool;
  let fallbackLevel = 3;
  for (let n = Math.min(3, recent.length); n >= 0; n--) {
    const blocked = new Set(recent.slice(0, n));
    const cands = pool.filter((c) => !blocked.has(c.id));
    if (cands.length > 0) {
      candidates = cands;
      fallbackLevel = 3 - n;
      break;
    }
  }

  const lastUsed = (id: number) => history.get(id)?.lastUsedAt ?? -1; // never-used = oldest
  const now = Date.now();
  const scoreOf = (c: Content): number => {
    const skillMatch = 1;
    const d = Math.abs((CEFR_LEVEL[c.cefr] ?? 4) - myLevel);
    const cefrMatch = d === 0 ? 1 : d === 1 ? 0.6 : d === 2 ? 0.25 : 0.1;
    const ielts = c.ieltsRelevance / 5;
    const times = history.get(c.id)?.timesUsed ?? 0;
    const novelty = times === 0 ? 1 : times === 1 ? 0.5 : 0.15;
    // provenance (weakByContent) OR in-text need-overlap — either reinforces
    const hits = needHits(c.body);
    const itemValue = Math.min(1, Math.max((weakByContent.get(c.id) ?? 0) / 5, hits / 3));
    const missionRel = input.topics?.includes(c.topic) ? 1 : 0.3;
    let score =
      0.3 * skillMatch + 0.2 * cefrMatch + 0.15 * ielts + 0.15 * novelty + 0.1 * itemValue + 0.1 * missionRel;
    const h = history.get(c.id);
    if (h) {
      if (now - h.lastUsedAt < 86_400_000) score -= 0.25; // < 1 day → cooldown
      if (h.timesUsed >= 3 && now - h.lastUsedAt < 3 * 86_400_000) score -= 0.15;
    }
    // V13.2 topic diversity: ≥2 same-topic uses in the last 7 days → gentle
    // fatigue penalty — but a strong learning-need (all 10% itemValue) earns
    // its reinforcement and the penalty is waived (spec: diversity applies
    // "where learning value is comparable")
    const topicUses = historyRows.filter(
      (r) => now - r.lastUsedAt < 7 * 86_400_000 && candidates.find((cc) => cc.id === r.contentId)?.topic === c.topic,
    ).length;
    if (topicUses >= 2 && itemValue < 0.9) score -= 0.1;
    // V13.2 quality gate: thin/fragmented content sits lower in the pool but
    // never blocked — manual access from the Library stays unrestricted
    const bodyWords = c.body.split(/\s+/).length;
    const sentenceCount = (c.body.match(/[.!?]\s/g) ?? c.body.match(/[.!?]$/g) ?? []).length;
    if (bodyWords < 120 || sentenceCount < 5) score -= 0.15;
    return score;
  };

  const ranked = candidates
    .map((c) => ({ c, score: scoreOf(c) }))
    .sort((a, b) => b.score - a.score || lastUsed(a.c.id) - lastUsed(b.c.id) || a.c.id - b.c.id);
  const pick = ranked[0];

  const h = history.get(pick.c.id);
  const weak = weakByContent.get(pick.c.id) ?? 0;
  const status: CompletionStatus = !h
    ? "new"
    : h.completionStatus === "completed"
      ? weak > 0
        ? "reviewable"
        : "completed"
      : "in_progress";
  const pickHits = needHits(pick.c.body);
  const reason = !h
    ? pickHits > 0
      ? `need overlap — ${pickHits} weak expression${pickHits > 1 ? "s" : ""}/error form${pickHits > 1 ? "s" : ""} occur in this text`
      : "fresh content"
    : weak > 0
      ? `resurfaced context — ${weak} active item${weak > 1 ? "s" : ""} benefit from it`
      : h.completionStatus === "completed"
        ? "completed, re-queued by rotation"
        : "in progress, continuing rotation";

  // human why-this (V10 P24): built from the same real factors, never invented
  // V13.2: strength label derived from CEFR distance (Good fit / Stretching)
  const d = Math.abs((CEFR_LEVEL[pick.c.cefr] ?? 4) - myLevel);
  const strength = d === 0
    ? { en: "Good fit", zh: "正合适" }
    : d === 1 && (CEFR_LEVEL[pick.c.cefr] ?? 4) > myLevel
      ? { en: "Stretching you a little", zh: "稍有挑战" }
      : d === 1
        ? { en: "Comfortable", zh: "轻松复习" }
        : { en: null as string | null, zh: null as string | null };
  const reasonHuman: { en: string; zh: string } = weak > 0
    ? {
        en: `At your level, and it naturally re-uses ${weak} expression${weak > 1 ? "s" : ""} you're still learning.`,
        zh: `符合你的水平，还能让正在学的 ${weak} 个表达自然地再出现。`,
      }
    : pickHits > 0
      ? {
          en: `At your level${d === 0 ? "" : d === 1 ? " (a gentle step)" : ""}, and it contains ${pickHits} expression${pickHits > 1 ? "s" : ""} you're currently weak on.`,
          zh: `符合你的水平${d === 1 ? "（难度差一步）" : ""}，还包含你正在巩固的 ${pickHits} 个表达。`,
        }
      : !h
        ? {
            en: `New to you${d === 0 ? " and right at your level" : d === 1 ? ", one gentle step from your level" : ""}.`,
            zh: `你还没读过${d === 0 ? "，而且正合你的水平" : d === 1 ? "，难度只差一步" : ""}。`,
          }
        : h.completionStatus === "completed"
          ? { en: "You finished it before — a second pass cements it.", zh: "你之前读完过——再过一遍会更牢。" }
          : { en: "You started it — a natural place to continue.", zh: "你读到一半——正好接着读。" };

  return { content: pick.c, status, score: Math.round(pick.score * 1000) / 1000, fallbackLevel, reason, reasonHuman, strength };
}
