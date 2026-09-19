import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { chunks, contents, dailyMissions, errors, learningProfiles, retrievalItems, type DailyMission } from "@/db/schema";
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

  // ── Content selection: prefer content matching the primary skill ────────
  const primaryType = primarySkill === "listening" ? "listening" : "reading";
  const secondaryType = primaryType === "listening" ? "reading" : "listening";

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
  // Engine-selected target chunks override default deep picks
  const deepIds = decision.targetChunkIds.length
    ? noticeIds.filter((id) => decision.targetChunkIds.includes(id)).slice(0, 2)
    : (actualLite ? [] : noticeIds.slice(0, 2));

  // ── Retrieval: V15.2 — the mission batch comes from the SAME canonical
  // review queue as /review (one scheduling path); the planner's budget caps
  // the batch so a backlog never floods the day (V10 P6) ──────────────────
  const retrievalItemIds = (decision.retrievalItemIds.length > 0
    ? decision.retrievalItemIds
    : (await generateReviewQueue(userId, actualLite ? 6 : Math.max(6, budget.reviewCount))).map((q) => q.retrievalItemId)
  ).slice(0, budget.reviewCount);

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
        en: readinessNote ? `${budget.whyEn} ${readinessNote.en}` : budget.whyEn,
        zh: readinessNote ? `${budget.whyZh} ${readinessNote.zh}` : budget.whyZh,
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

/** Toggle today's mission between lite and full by regenerating the plan. */
export async function toggleTodayLite(userId: number): Promise<boolean> {
  const mission = await getTodayMission(userId);
  if (!mission) return false;
  const lite = !mission.plan.lite;
  await db.delete(dailyMissions).where(eq(dailyMissions.id, mission.id));
  await generateTodayMission(userId, lite);
  return lite;
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
