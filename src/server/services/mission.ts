import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { chunks, contentHistory, contents, dailyMissions, errors, learningProfiles, retrievalItems, type DailyMission } from "@/db/schema";
import { selectNextContent } from "@/server/services/content-selection";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { cueCards, genericSpeakingPrompts, speakingPromptByChunk } from "@/lib/banks";
import { todayKey } from "@/lib/text";
import { retrievalIdsForChunks } from "@/server/services/retrieval";
import { generateReviewQueue } from "@/server/services/retention";
import type { MissionPlan, StepStatus } from "@/lib/types";

export async function getTodayMission(userId: number): Promise<DailyMission | null> {
  const date = todayKey();
  const rows = await db
    .select()
    .from(dailyMissions)
    .where(and(eq(dailyMissions.userId, userId), eq(dailyMissions.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

async function pickContent(type: "reading" | "listening", userId: number, notId?: number) {
  // All content choice flows through the selection engine — rotation,
  // cooldown, scoring and fallback live in one place. The full selection
  // (strength label + why-line) travels with the plan, not just the content.
  return selectNextContent({ userId, skill: type, excludeContentIds: notId ? [notId] : undefined });
}

/** Notice list: corpus chunks sourced from this content + any chunks whose
 *  pattern occurs in the text. */
async function noticeChunksFor(contentId: number, body: string) {
  const rows = await db
    .select()
    .from(chunks)
    .where(and(isNull(chunks.userId), or(eq(chunks.sourceContentId, contentId), isNull(chunks.sourceContentId))));
  const hits = rows.filter(
    (c) => c.sourceContentId === contentId || (CHUNK_DETECT[c.text] && CHUNK_DETECT[c.text].test(body)),
  );
  // source-attached chunks first, then text matches, cap at 8
  return hits.sort((a, b) => (b.sourceContentId === contentId ? 1 : 0) - (a.sourceContentId === contentId ? 1 : 0)).slice(0, 8);
}

/** Deep-study targets: engine-prioritized when its due chunks appear among
 * today's noticed material, first-noticed chunks otherwise. The match is by
 * TEXT — engine targets are personal-bank COPIES of corpus chunks (their own
 * row ids) while notice rows are corpus rows; the two ID spaces never
 * overlap, so an id-intersection is always empty. Pure — unit-tested. */
/** Content-slot mapping for the mission's two input slots: content-skill
 * primaries (reading/listening) drive their slot directly. Production or
 * retrieval primaries (writing/speaking/retrieval) have no content slot of
 * their own — take the LESS-practiced input skill instead of silently
 * defaulting to reading (P1-8: a writing-weakest day was silently becoming a
 * reading day). Pure — unit-tested. */
export function pickPrimaryContentType(
  primarySkill: "listening" | "reading" | "speaking" | "writing" | "retrieval",
  readingSessions: number,
  listeningSessions: number,
): "reading" | "listening" {
  if (primarySkill === "reading") return "reading";
  if (primarySkill === "listening") return "listening";
  return readingSessions <= listeningSessions ? "reading" : "listening";
}

export function pickDeepChunkIds(
  notice: { id: number; text: string }[],
  engineTargetTexts: ReadonlySet<string>,
  lite: boolean,
): number[] {
  if (lite) return [];
  const anchored = notice.filter((c) => engineTargetTexts.has(c.text)).slice(0, 2).map((c) => c.id);
  return anchored.length ? anchored : notice.slice(0, 2).map((c) => c.id);
}

export async function generateTodayMission(userId: number, liteOverride?: boolean): Promise<DailyMission> {
  const existing = await getTodayMission(userId);
  if (existing) return existing;

  let lite = liteOverride;
  if (lite === undefined) {
    const [profile] = await db
      .select({ minutes: learningProfiles.dailyMinutes })
      .from(learningProfiles)
      .where(eq(learningProfiles.userId, userId))
      .limit(1);
    lite = (profile?.minutes ?? 45) <= 20;
  }

  // ── Adaptive Priority Engine decides mission composition ────────────────
  const { computeMissionDecision } = await import("@/server/services/priority-engine");
  const decision = await computeMissionDecision(userId);

  // ── V12.1: readiness gap biases the primary skill — the engine stays the
  // single decision-maker; an evidence-backed exam gap outranks its default
  // rotation when one exists ─────────────────────────────────────────────────
  let primarySkill = decision.primarySkill;
  let readinessNote: { en: string; zh: string } | null = null;
  try {
    const { buildReadiness } = await import("@/server/services/readiness");
    const { getActiveExam } = await import("@/server/current-user");
    const exam = await getActiveExam();
    const readiness = await buildReadiness(userId, exam);
    if (readiness.topGap) {
      const gapSkill = readiness.topGap.skill as typeof primarySkill;
      if (gapSkill !== primarySkill) {
        primarySkill = gapSkill;
        readinessNote = {
          en: `Your ${readiness.topGap.label.en.toLowerCase()} is the biggest gap vs your target — today leans that way.`,
          zh: `${readiness.topGap.label.zh}是你离目标最大的差距——今天向它倾斜。`,
        };
      }
    }
  } catch {
    /* readiness is an enhancement — never block the mission */
  }

  // ── V10 planner: time budget + memory pressure shape the day's volume ────
  const { allocateBudget } = await import("@/server/services/planner");
  const { readMemoryPressure } = await import("@/server/services/planner");
  const { pressure, dailyMinutes } = await readMemoryPressure(userId);
  const budget = allocateBudget(dailyMinutes, pressure);
  if (budget.mode === "rescue") lite = true; // missed days → small plan

  // Map engine's recommended length to our lite/full system
  const recommendedLength = decision.recommendedLength;
  const actualLite = lite ?? recommendedLength === "quick";

  // ── Content selection: content-skill primaries drive their slot; production
  // primaries (writing/speaking/retrieval) take the lesser-practiced input ──
  const inputCounts = await db
    .select({ skill: contentHistory.skill, n: sql<number>`count(*)` })
    .from(contentHistory)
    .where(eq(contentHistory.userId, userId))
    .groupBy(contentHistory.skill);
  const readingSessions = Number(inputCounts.find((r) => r.skill === "reading")?.n ?? 0);
  const listeningSessions = Number(inputCounts.find((r) => r.skill === "listening")?.n ?? 0);
  const primaryType = pickPrimaryContentType(primarySkill, readingSessions, listeningSessions);
  const secondaryType = primaryType === "listening" ? "reading" : "listening";
  // and say it like it is: on a production-focus day the reading/listening
  // slots are supporting input, not the focus itself
  const focusNote =
    primarySkill === "writing" || primarySkill === "speaking" || primarySkill === "retrieval"
      ? {
          en: `Today's focus is ${primarySkill === "retrieval" ? "retrieval review" : `${primarySkill} practice`} — the reading/listening slots are supporting input.`,
          zh: `今日主攻${primarySkill === "writing" ? "写作" : primarySkill === "speaking" ? "口语" : "检索复习"}——阅读/听力材料作为配套输入。`,
        }
      : null;

  const primarySel = await pickContent(primaryType, userId);
  // Secondary slot must differ from the primary pick when alternatives exist.
  const secondarySel = actualLite
    ? null
    : await pickContent(secondaryType, userId, primarySel?.content.id);

  // Assign: primary skill gets the primary content slot
  const isPrimaryListening = primaryType === "listening";
  const readingSel = isPrimaryListening ? secondarySel : primarySel;
  const listeningSel = isPrimaryListening ? primarySel : secondarySel;
  const reading = readingSel?.content ?? null;
  const listening = listeningSel?.content ?? null;

  const noticeRows = reading ? await noticeChunksFor(reading.id, reading.body) : [];
  const noticeIds = noticeRows.map((c) => c.id);
  // Engine-selected target chunks prioritize the deep picks when they appear
  // in today's material — matched by TEXT (engine ids are personal copies,
  // notice ids are corpus rows; see pickDeepChunkIds).
  const engineTargetTexts = decision.targetChunkIds.length
    ? new Set(
        (await db.select({ text: chunks.text }).from(chunks).where(inArray(chunks.id, decision.targetChunkIds)))
          .map((r) => r.text),
      )
    : new Set<string>();
  const deepIds = pickDeepChunkIds(noticeRows, engineTargetTexts, actualLite);

  // ── Retrieval: V15.2 + step-03 — the mission batch is a PREFIX of the
  // SAME canonical review queue as /review (one scheduling path: which
  // items, which order, which format); the planner's budget caps the batch
  // so a backlog never floods the day (V10 P6) ─────────────────────────────
  const canonicalBatch = await generateReviewQueue(userId, actualLite ? 6 : Math.max(6, budget.reviewCount));
  const retrievalItemIds = canonicalBatch.slice(0, budget.reviewCount).map((q) => q.retrievalItemId);

  const firstChunk = noticeRows[0];
  const speakingPrompt = firstChunk
    ? (speakingPromptByChunk[firstChunk.text] ?? genericSpeakingPrompts[0])
    : genericSpeakingPrompts[0];

  // Cue card: prefer matching primary skill's topic
  const primaryTopic = (isPrimaryListening ? listening?.topic : reading?.topic) ?? "";
  const card = cueCards.find((c) => c.topic === primaryTopic) ??
    cueCards.find((c) => c.topic === (reading?.topic ?? "")) ??
    cueCards[0];

  const plan: MissionPlan = {
    lite: actualLite,
    length: recommendedLength,
    rationale: {
      ...decision.rationale,
      planWhy: {
        mode: budget.mode,
        en: [budget.whyEn, readinessNote?.en, focusNote?.en].filter(Boolean).join(" "),
        zh: [budget.whyZh, readinessNote?.zh, focusNote?.zh].filter(Boolean).join(" "),
      },
    },
    reading: reading
      ? {
          contentId: reading.id,
          title: reading.title,
          minutes: lite ? Math.max(3, Math.round(reading.minutes * 0.5)) : Math.max(5, Math.round(reading.minutes * 0.7)),
          status: "pending",
          strength: readingSel?.strength,
          why: readingSel?.reasonHuman,
        }
      : { contentId: 0, title: "No reading content available", minutes: 0, status: "done" },
    listening: listening
      ? {
          contentId: listening.id,
          title: listening.title,
          minutes: Math.max(3, Math.round(listening.minutes * 0.7)),
          status: "pending",
          strength: listeningSel?.strength,
          why: listeningSel?.reasonHuman,
        }
      : { contentId: 0, title: "Skipped — lite mode", minutes: 0, status: "skipped" },
    notice: { contentId: reading?.id ?? 0, chunkIds: noticeIds.slice(0, lite ? 5 : 8), savedCount: 0, status: "pending" },
    deep: { chunkIds: deepIds, status: lite ? "skipped" : "pending" },
    retrieval: {
      itemIds: [...new Set(retrievalItemIds)].slice(0, actualLite ? 6 : 12),
      doneCount: 0,
      status: "pending",
    },
    speaking: { prompt: speakingPrompt, requiredChunkIds: noticeIds.slice(0, 2), rounds: 0, status: "pending" },
    transfer: {
      cueCard: card.cueCard,
      part3: card.part3,
      status: lite ? "skipped" : "pending",
    },
  };

  const [mission] = await db
    .insert(dailyMissions)
    .values({ userId, date: todayKey(), plan, status: "pending" })
    .onConflictDoNothing()
    .returning();
  if (mission) return mission;
  const again = await getTodayMission(userId);
  return again!;
}

/** In-place lite/full toggle of a mission plan (step-04). Pure — the caller
 *  supplies recomputation inputs; this function only reshapes the plan.
 *
 *  Invariants:
 *  - DONE steps are never reopened and never re-skipped;
 *  - recorded progress (notice.savedCount, retrieval.doneCount,
 *    speaking.rounds) is untouched;
 *  - expand (→ full): skipped optional steps re-enable — listening
 *    backfills a picked content only when one exists (no fabricated slot),
 *    deep takes notice's first targets when it had none, transfer reopens,
 *    retrieval batch extends (caller supplies canonical extras);
 *  - contract (→ lite): unfinished optional steps skip; retrieval and
 *    speaking keep their state (both exist in lite plans). */
export function applyLiteToggle(
  plan: MissionPlan,
  toLite: boolean,
  ctx: {
    readingMinutes?: number | null;
    listeningPick?: { id: number; title: string; minutes: number } | null;
    /** fill for a lite-placeholder READING slot (contentId 0): the picked
     *  content plus its notice suggestions, so the notice step works */
    readingPick?: { id: number; title: string; minutes: number; noticeChunkIds: number[] } | null;
    extraRetrievalIds?: number[];
  } = {},
): MissionPlan {
  const next: MissionPlan = structuredClone(plan);
  const fullReadingMin = ctx.readingMinutes != null ? Math.max(5, Math.round(ctx.readingMinutes * 0.7)) : null;
  const liteReadingMin = ctx.readingMinutes != null ? Math.max(3, Math.round(ctx.readingMinutes * 0.5)) : null;

  const reOpen = (step: { status: StepStatus }) => {
    if (step.status === "skipped") step.status = "pending";
  };
  const skipIfPending = (step: { status: StepStatus }) => {
    if (step.status === "pending") step.status = "skipped";
  };

  if (toLite) {
    if (liteReadingMin != null && next.reading.status !== "skipped") next.reading.minutes = liteReadingMin;
    skipIfPending(next.listening);
    skipIfPending(next.deep);
    skipIfPending(next.transfer);
    next.lite = true;
    return next;
  }

  // expand → full
  // A contentId-0 slot is a lite PLACEHOLDER ("No reading available" /
  // "Skipped — lite mode"), not user progress: expanding backfills it when
  // the pool has a pick. Real slots (contentId > 0) only get budget/status
  // adjustments — their done state is genuine progress and stays.
  if (next.reading.contentId === 0 && ctx.readingPick) {
    next.reading.contentId = ctx.readingPick.id;
    next.reading.title = ctx.readingPick.title;
    next.reading.minutes = Math.max(5, Math.round(ctx.readingPick.minutes * 0.7));
    next.reading.status = "pending";
    // the notice step points at the reading material — follow the new slot
    next.notice.contentId = ctx.readingPick.id;
    if (next.notice.chunkIds.length === 0) {
      next.notice.chunkIds = ctx.readingPick.noticeChunkIds.slice(0, 8);
    }
  } else if (fullReadingMin != null && next.reading.status !== "skipped") {
    next.reading.minutes = fullReadingMin;
  }
  reOpen(next.listening);
  if (next.listening.contentId === 0 && ctx.listeningPick) {
    next.listening.contentId = ctx.listeningPick.id;
    next.listening.title = ctx.listeningPick.title;
    next.listening.minutes = Math.max(3, Math.round(ctx.listeningPick.minutes * 0.7));
    next.listening.status = "pending";
  }
  reOpen(next.deep);
  if (next.deep.chunkIds.length === 0) {
    next.deep.chunkIds = next.notice.chunkIds.slice(0, 2);
  }
  reOpen(next.transfer);
  if (next.retrieval.status !== "done" && ctx.extraRetrievalIds?.length) {
    const seen = new Set(next.retrieval.itemIds);
    for (const id of ctx.extraRetrievalIds) {
      if (next.retrieval.itemIds.length >= 12) break;
      if (!seen.has(id)) {
        next.retrieval.itemIds.push(id);
        seen.add(id);
      }
    }
  }
  next.lite = false;
  return next;
}

/** Toggle today's mission between lite and full IN PLACE: same row, same
 *  date, all recorded evidence (done statuses, rounds, doneCount, counters)
 *  preserved. The old delete-and-regenerate erased an afternoon's history
 *  with the morning's work (step-04 fix). */
export async function toggleTodayLite(userId: number): Promise<boolean> {
  const mission = await getTodayMission(userId);
  if (!mission) return false;
  const plan = mission.plan as MissionPlan;
  const toLite = !plan.lite;

  // Recomputation inputs — READ-ONLY lookups, nothing is written until the
  // single atomic update below, so a failure mid-way leaves the mission as-is.
  let readingMinutes: number | null = null;
  if (plan.reading.contentId > 0) {
    const [c] = await db.select({ minutes: contents.minutes }).from(contents)
      .where(eq(contents.id, plan.reading.contentId)).limit(1);
    readingMinutes = c?.minutes ?? null;
  }
  let listeningPick: { id: number; title: string; minutes: number } | null = null;
  if (!toLite && plan.listening.contentId === 0 && plan.listening.status === "skipped") {
    const sel = await pickContent("listening", userId, plan.reading.contentId || undefined);
    listeningPick = sel ? { id: sel.content.id, title: sel.content.title, minutes: sel.content.minutes } : null;
  }
  // a lite-placeholder reading slot (contentId 0) gets a real pick on expand,
  // plus notice suggestions from that material — the notice step is what
  // makes the reading slot useful (verify-pm ③ depends on this path)
  let readingPick: { id: number; title: string; minutes: number; noticeChunkIds: number[] } | null = null;
  if (!toLite && plan.reading.contentId === 0) {
    const sel = await pickContent("reading", userId, plan.listening.contentId || undefined);
    if (sel) {
      const noticeRows = await noticeChunksFor(sel.content.id, sel.content.body);
      readingPick = {
        id: sel.content.id, title: sel.content.title, minutes: sel.content.minutes,
        noticeChunkIds: noticeRows.map((c) => c.id),
      };
    }
  }
  let extraRetrievalIds: number[] = [];
  if (!toLite && plan.retrieval.status !== "done") {
    const { generateReviewQueue: canonicalQueue } = await import("@/server/services/retention");
    const existing = new Set(plan.retrieval.itemIds);
    extraRetrievalIds = (await canonicalQueue(userId, 12))
      .map((q) => q.retrievalItemId)
      .filter((id) => !existing.has(id));
  }

  const nextPlan = applyLiteToggle(plan, toLite, { readingMinutes, listeningPick, readingPick, extraRetrievalIds });

  const keys = ["reading", "listening", "notice", "deep", "retrieval", "speaking", "transfer"] as const;
  const allSettled = keys.every((k) => {
    const s = (nextPlan[k] as { status: StepStatus }).status;
    return s === "done" || s === "skipped";
  });

  await db
    .update(dailyMissions)
    .set({ plan: nextPlan, status: allSettled ? "completed" : "pending" })
    .where(eq(dailyMissions.id, mission.id));
  return toLite;
}

export async function getOrCreateTodayMission(userId: number): Promise<DailyMission> {
  return (await getTodayMission(userId)) ?? (await generateTodayMission(userId));
}

type StepKey = "reading" | "listening" | "notice" | "deep" | "retrieval" | "speaking" | "transfer";

export async function markStepDone(userId: number, step: StepKey): Promise<void> {
  const mission = await getTodayMission(userId);
  if (!mission) return;
  const plan = mission.plan as MissionPlan;
  (plan[step] as { status: StepStatus }).status = "done";
  const keys: StepKey[] = ["reading", "listening", "notice", "deep", "retrieval", "speaking", "transfer"];
  const allDone = keys.every((k) => {
    const s = (plan[k] as { status: StepStatus }).status;
    return s === "done" || s === "skipped";
  });
  await db
    .update(dailyMissions)
    .set({ plan, status: allDone ? "completed" : "pending" })
    .where(eq(dailyMissions.id, mission.id));
}

export async function bumpMissionSpeakingRounds(userId: number): Promise<void> {
  const mission = await getTodayMission(userId);
  if (!mission) return;
  const plan = mission.plan as MissionPlan;
  plan.speaking.rounds += 1;
  await db.update(dailyMissions).set({ plan }).where(eq(dailyMissions.id, mission.id));
}
