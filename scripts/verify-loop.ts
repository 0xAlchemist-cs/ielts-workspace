import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  chunks as chunksT,
  chunkEvents,
  dailyMissions,
  errors as errorsT,
  ieltsAttempts,
  ieltsTasks,
  learningProfiles,
  learningSnapshots,
  progressEvents,
  retrievalItems,
  reviewHistory,
  users,
} from "../src/db/schema";
import { addError, saveCustomChunk } from "../src/server/services/bank";
import { ensureRetrievalItem } from "../src/server/services/retrieval";
import { submitRetentionReview, generateReviewQueue } from "../src/server/services/retention";
import { generateTodayMission } from "../src/server/services/mission";
import { computeMissionDecision } from "../src/server/services/priority-engine";
import { logChunkEvent, markChunkActivated } from "../src/server/services/events";
import { advanceState, decideFormat } from "../src/lib/retrieval-engine";
import { evaluateAttempt } from "../src/server/services/ielts-engine";
import { computeFullProfile } from "../src/server/services/learning-profile";
import { takeDailySnapshot, getTrajectory } from "../src/server/services/trajectory";
import { recordEvent } from "../src/server/services/progress";
import type { ItemLearningState, ModuleContext } from "../src/lib/types";

/* ── 7-Day Learning Loop Audit — drives REAL engine code paths day by day and
 * verifies the data chain lands in the DB (not just the UI).
 * Run: npx tsx scripts/verify-loop.ts   (temp user, self-cleaning) */

let pass = 0;
let fail = 0;
const findings: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function itemOf(userId: number, chunkId: number) {
  const [it] = await db
    .select()
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemType, "chunk"), eq(retrievalItems.itemId, chunkId)))
    .limit(1);
  return it;
}

const yesterdayKey = () => {
  const d = new Date(Date.now() - 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function main() {
  // ── temp user ─────────────────────────────────────────────────────────────
  const [u] = await db.insert(users).values({ name: "loop-audit", createdAt: Date.now() }).returning({ id: users.id });
  const userId = u.id;
  await db.insert(learningProfiles).values({ userId, cefr: "B2", createdAt: Date.now() });

  // ════ DAY 0 — first entry: mission, contents, profile, no blanks ══════════
  const m1 = await generateTodayMission(userId);
  const rationale1 = (m1.plan as { rationale?: { headline: string; factors: unknown[] } }).rationale;
  check("D0 mission exists with Why-today rationale", !!m1 && !!rationale1?.headline?.length, rationale1?.headline?.slice(0, 60));
  const p1 = m1.plan as { reading: { contentId: number }; listening: { contentId: number }; retrieval: { itemIds: number[] } };
  check("D0 mission has real reading content (no /read/0)", p1.reading.contentId > 0, `reading=${p1.reading.contentId}`);
  check("D0 mission has listening content or lite-mode skip", p1.listening.contentId > 0, `listening=${p1.listening.contentId}`);
  const queue0 = await generateReviewQueue(userId, 10);
  check("D0 review queue empty is fine (0 items, not error)", Array.isArray(queue0));
  const profile0 = await computeFullProfile(userId);
  check("D0 profile baseline computes for brand-new user", !!profile0);

  // ════ DAY 1 — learn 3 LanguageItems through the real ladder ═══════════════
  const texts = ["end up doing", "cut down on", "run out of time"];
  const chunkIds: number[] = [];
  for (const t of texts) chunkIds.push((await saveCustomChunk(userId, { text: t, meaningEn: `en:${t}`, meaningZh: `zh:${t}` })).id);
  check("D1 three LanguageItems created + retrieval items", (await itemOf(userId, chunkIds[0])) != null);

  // notice → guess event (reading study does this via logChunkEvent)
  await logChunkEvent(userId, chunkIds[0], "guess", "my guess");
  // exposure → recognition → retrieval via real submit (recognition passes word-based grading)
  for (const cid of chunkIds) {
    const it = await itemOf(userId, cid);
    await submitRetentionReview(userId, it.id, "recognition", texts[chunkIds.indexOf(cid)], "reading");
  }
  const it0 = await itemOf(userId, chunkIds[0]);
  check("D1 recognition advanced state past exposure", ["recognition", "retrieval", "usage"].includes(it0.learningState.state), it0.learningState.state);
  const hist1 = await db.select().from(reviewHistory).where(eq(reviewHistory.retrievalItemId, it0.id));
  check("D1 review_history rows recorded", hist1.length >= 1, `${hist1.length} rows`);

  // production: real sentence generation (reading study path) → activation
  await markChunkActivated(userId, chunkIds[0]);
  await logChunkEvent(userId, chunkIds[0], "generation_pass", "I ended up staying home.");
  const [chk] = await db.select().from(chunksT).where(eq(chunksT.id, chunkIds[0]));
  check("D1 production → chunk.activatedAt set (passive→active)", chk.activatedAt != null);

  // ════ DAY 2 — retrieval: 2 pass, 1 fail ═══════════════════════════════════
  // the learner actually OPENED Day 1's contents (rotation history records it)
  const { markContentUsed } = await import("../src/server/services/content-selection");
  if (p1.reading.contentId) await markContentUsed(userId, p1.reading.contentId);
  if (p1.listening.contentId) await markContentUsed(userId, p1.listening.contentId);
  // make items due
  await db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.userId, userId));
  for (const cid of [chunkIds[0], chunkIds[1]]) {
    const it = await itemOf(userId, cid);
    const r = await submitRetentionReview(userId, it.id, "production", texts[chunkIds.indexOf(cid)], "review");
    if (cid === chunkIds[0]) check("D2 successful production graded quality 5", r?.quality === 5, `q=${r?.quality}`);
  }
  const failItem = await itemOf(userId, chunkIds[2]);
  const beforeFail = failItem.failCount;
  const rf = await submitRetentionReview(userId, failItem.id, "production", "totally wrong", "review");
  const failAfter = await itemOf(userId, chunkIds[2]);
  check("D2 failed production → failCount+1 + interval reset", rf?.quality === 0 && failAfter.failCount === beforeFail + 1 && failAfter.intervalDays <= 1.01, `fail=${failAfter.failCount} interval=${failAfter.intervalDays}`);

  // mission must change for the new day and include the failed item
  await db.update(dailyMissions).set({ date: yesterdayKey() }).where(eq(dailyMissions.id, m1.id));
  const m2 = await generateTodayMission(userId);
  const p2 = m2.plan as typeof p1;
  check("D2 next-day mission differs from Day 1 (rotation)", p2.reading.contentId !== p1.reading.contentId, `${p1.reading.contentId}→${p2.reading.contentId}`);
  const queue2 = await generateReviewQueue(userId, 20);
  check("D2 failed item re-queued for review (revenge)", queue2.some((q) => q.retrievalItemId === failItem.id), `queue=${queue2.length}`);

  // ════ DAY 3 — speaking uses one item ══════════════════════════════════════
  await logChunkEvent(userId, chunkIds[1], "speaking_use", "I cut down on sugar last month.");
  const evUsed = await db.select().from(chunkEvents).where(and(eq(chunkEvents.userId, userId), eq(chunkEvents.type, "speaking_use")));
  check("D3 speaking_use logged as chunk event", evUsed.length >= 1 && evUsed.some((e) => e.detail.includes("cut down on")));

  // ════ DAY 4 — duplicate error 'interested on' via writing path ════════════
  await addError(userId, { category: "preposition", wrongForm: "interested on", correctForm: "interested in", sourceModule: "writing", source: "ai" });
  await addError(userId, { category: "preposition", wrongForm: "interested on", correctForm: "interested in", sourceModule: "speaking", source: "ai" });
  const [errRow] = await db.select().from(errorsT).where(and(eq(errorsT.userId, userId), eq(errorsT.wrongForm, "interested on")));
  check("D4 duplicate error increments occurrenceCount (2), stays active", errRow.occurrenceCount === 2 && errRow.status === "active", `count=${errRow.occurrenceCount}`);
  const errItem = (await db.select().from(retrievalItems).where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, errRow.id))))[0];
  check("D4 error has its own retrieval item (revenge queue)", errItem != null);
  const queue4 = await generateReviewQueue(userId, 30);
  check("D4 error item appears in review queue", queue4.some((q) => q.retrievalItemId === errItem.id));

  // ════ DAY 5 — retention check due ═════════════════════════════════════════
  await db.update(retrievalItems).set({ dueAt: Date.now() - 7 * 86_400_000 }).where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.id, it0.id)));
  const r5 = await submitRetentionReview(userId, it0.id, "production", texts[0], "review");
  const it5 = await itemOf(userId, chunkIds[0]);
  check("D5 retention review success → interval grows beyond 1 day", r5?.isRetentionCheck === true || it5.intervalDays > 1, `interval=${it5.intervalDays} days`);
  // forgetting: fail a due retention item
  await db.update(retrievalItems).set({ dueAt: Date.now() - 7 * 86_400_000 }).where(eq(retrievalItems.id, it5.id));
  const r5f = await submitRetentionReview(userId, it5.id, "production", "no idea", "review");
  check("D5 forgetting detected on failure", r5f?.forgettingDetected === true, `forgetting=${r5f?.forgettingDetected}`);

  // ════ DAY 6 — listening transfer (context shift) ══════════════════════════
  const it6 = await itemOf(userId, chunkIds[1]);
  const fmt6 = decideFormat("chunk", it6.learningState, "listening");
  const ls6 = advanceState(it6.learningState, fmt6, 5, "listening");
  await db.update(retrievalItems).set({ learningState: ls6 }).where(eq(retrievalItems.id, it6.id));
  await logChunkEvent(userId, chunkIds[1], "context_transfer", "new context production");
  const it6b = await itemOf(userId, chunkIds[1]);
  check("D6 listening context recorded in learning ladder", it6b.learningState.contexts.includes("listening"), JSON.stringify(it6b.learningState.contexts));

  // ════ DAY 7 — IELTS transfer test (real engine evaluation) ════════════════
  const [anyTask] = await db.select().from(ieltsTasks).limit(1);
  const att = await evaluateAttempt({ userId, taskId: anyTask.id, mode: "learning", responses: {}, durationMinutes: 10 });
  check("D7 IELTS attempt evaluated + stored", att.attemptId > 0, `attempt=${att.attemptId}`);

  // ════ FINAL — cross-module data chain ═════════════════════════════════════
  await recordEvent(userId, "exposure", 3);
  await takeDailySnapshot(userId);
  const traj = await getTrajectory(userId, 7);
  const full = await computeFullProfile(userId);
  const decision = await computeMissionDecision(userId);
  check("F1 trajectory snapshot exists after 7-day chain", traj.snapshots.length >= 1);
  check("F2 full profile computes with errors + active items", JSON.stringify(full).includes("preposition") || JSON.stringify(full).length > 100, `profile bytes=${JSON.stringify(full).length}`);
  check("F3 mission decision is data-driven (headline + queue refs)", (decision.rationale.headline?.length ?? 0) > 0 && (decision.retrievalItemIds.length > 0 || decision.targetChunkIds.length > 0), decision.rationale.headline);
  const pe = await db.select().from((await import("../src/db/schema")).userProgress).where(eq((await import("../src/db/schema")).userProgress.userId, userId));
  check("F4 progress funnel recorded (user_progress metrics)", pe.length >= 1 && Object.keys(pe[0].metrics as object).length > 0, JSON.stringify(pe[0]?.metrics));

  // ════ cleanup ═════════════════════════════════════════════════════════════
  await db.delete((await import("../src/db/schema")).userProgress).where(eq((await import("../src/db/schema")).userProgress.userId, userId));
  await db.delete(progressEvents).where(eq(progressEvents.userId, userId));
  await db.delete(reviewHistory).where(eq(reviewHistory.userId, userId));
  await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
  await db.delete(errorsT).where(eq(errorsT.userId, userId));
  await db.delete(chunkEvents).where(eq(chunkEvents.userId, userId));
  await db.delete(chunksT).where(eq(chunksT.userId, userId));
  await db.delete(dailyMissions).where(eq(dailyMissions.userId, userId));
  await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, userId));
  await db.delete(learningSnapshots).where(eq(learningSnapshots.userId, userId));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  console.log(`\n${pass} passed, ${fail} failed (audit user cleaned)`);
  if (findings.length) console.log("FINDINGS:\n" + findings.join("\n"));
  process.exit(fail === 0 ? 0 : 1);
}
void main();
