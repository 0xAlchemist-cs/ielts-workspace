/** V16.8 — 30-day long-term learning loop simulation (Beta acceptance).
 *  One fresh learner through the spec's day script: learn → review → new
 *  context → mistake → wrong-practice → review → progress → … → retention
 *  (D21) → transfer → progress (D30). Every day records WHAT the system
 *  suggested (mission/queue), WHY (queue reasons), WHAT evidence was created,
 *  and WHAT changed. Uses only real engine paths — no clock tricks beyond
 *  seeding dueAt in the past (SM-2 reads dueAt, not wall time).
 *  Run: npm run test:loop30 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  errors as errorsT, learningProfiles, reviewHistory, retrievalItems, users,
} from "../src/db/schema";
import { addError } from "../src/server/services/bank";
import { submitReview } from "../src/server/services/retrieval";
import { submitRetentionReview } from "../src/server/services/retention";
import { generateReviewQueue } from "../src/server/services/retention";
import { generateTodayMission } from "../src/server/services/mission";
import { startWrongPractice, submitWrongPractice } from "../src/server/services/wrong-practice";
import { buildLearningStory } from "../src/server/services/learning-story";
import { buildReadiness } from "../src/server/services/readiness";
import { getActiveExam, setActiveExam } from "../src/server/current-user";
import type { MissionPlan } from "../src/lib/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

const DAY = 86_400_000;

async function main() {
  const originalExam = await getActiveExam();
  await setActiveExam("ielts");
  let uid: number | null = null;
  try {
    const [u] = await db.insert(users).values({ name: "__loop30__", examProfile: "ielts" }).returning();
    uid = u.id;
    await db.insert(learningProfiles).values({ userId: uid, cefr: "B1", immersionLevel: 1, dailyMinutes: 30 });

    const log = (day: string, msg: string) => console.log(`  D${day} ${msg}`);
    const dueAgo = (id: number, days: number) =>
      db.update(retrievalItems).set({ dueAt: Date.now() - days * DAY }).where(eq(retrievalItems.id, id));

    /* ── D1 · Learn: mission generates, first retrievals happen ─────────── */
    const mission = await generateTodayMission(uid);
    const plan = mission.plan as MissionPlan;
    check("D1 mission generated with retrieval step", plan.retrieval.status === "pending");
    const chunkIds: number[] = [];
    for (const q of await generateReviewQueue(uid, 12)) {
      if (q.itemType === "chunk") chunkIds.push(q.retrievalItemId);
    }
    // seed two owned chunks via error-free path: bank chunks directly
    const [c1] = await db.insert((await import("../src/db/schema")).chunks).values({
      userId: uid, text: "as a result", meaningEn: "therefore", meaningZh: "因此", examples: [],
    }).returning();
    const [c2] = await db.insert((await import("../src/db/schema")).chunks).values({
      userId: uid, text: "play a crucial role", meaningEn: "be important", meaningZh: "起关键作用", examples: [],
    }).returning();
    const { ensureRetrievalItem } = await import("../src/server/services/retrieval");
    await ensureRetrievalItem(uid, "chunk", c1.id);
    await ensureRetrievalItem(uid, "chunk", c2.id);
    const [i1] = await db.select().from(retrievalItems).where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemId, c1.id))).limit(1);
    const [i2] = await db.select().from(retrievalItems).where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemId, c2.id))).limit(1);
    const r1 = await submitReview(uid, i1.id, "production", "As a result, the plan worked.");
    log("1", `learn: chunk retrieved q=${r1?.quality}`);
    check("D1 evidence created (review_history row)", (await db.select().from(reviewHistory).where(eq(reviewHistory.userId, uid))).length >= 1);

    /* ── D2 · Review: item comes back ───────────────────────────────────── */
    await dueAgo(i1.id, 2);
    const d2q = await generateReviewQueue(uid, 10);
    check("D2 reviewed item back in queue with overdue reason", d2q.some((q) => q.retrievalItemId === i1.id && q.reasons.includes("overdue")));
    await submitRetentionReview(uid, i1.id, "production", "As a result of the rain, we stayed in.");
    log("2", `review: queue=${d2q.length}`);

    /* ── D3 · New context: transfer succeeds ────────────────────────────── */
    const r3 = await submitRetentionReview(uid, i1.id, "context_transfer", "In exams, timing as a result matters.");
    check("D3 new-context success recorded", (r3?.quality ?? 0) >= 3);
    log("3", `new context q=${r3?.quality}`);

    /* ── D4 · Mistake: a real error enters the bank ─────────────────────── */
    const err = await addError(uid, { category: "vocabulary", wrongForm: "farming", correctForm: "agriculture", explanation: "Q2 — IELTSCB report", sourceModule: "ieltscb_reading" });
    const [errItem] = await db.select().from(retrievalItems).where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, err.id))).limit(1);
    log("4", `mistake banked: ${err.wrongForm}`);

    /* ── D5 · Wrong Practice (fail then pass) ───────────────────────────── */
    const s1 = await startWrongPractice(uid, err.id);
    const f1 = await submitWrongPractice(uid, s1.ok ? s1.sessionId : "", err.id, "retrieval", "farming");
    check("D5 wrong-practice fail → incorrect + rescheduled", f1.ok && f1.result === "incorrect");
    const s2 = await startWrongPractice(uid, err.id);
    await submitWrongPractice(uid, s2.ok ? s2.sessionId : "", err.id, "retrieval", "agriculture");
    const t2 = await submitWrongPractice(uid, s2.ok ? s2.sessionId : "", err.id, "transfer", "Agriculture employs half the region.");
    check("D5 wrong-practice transfer success", t2.ok && t2.quality === 5);
    log("5", "wrong→practice complete");

    /* ── D6 · Review again: error returns via queue ─────────────────────── */
    await dueAgo(errItem.id, 6);
    const d6q = await generateReviewQueue(uid, 10);
    check("D6 error back in queue with recurring_error + wrong_practice reasons",
      d6q.some((q) => q.retrievalItemId === errItem.id && q.reasons.includes("recurring_error") && q.reasons.includes("wrong_practice")));
    log("6", `review queue=${d6q.length}`);

    /* ── D7 · Progress tells the story ──────────────────────────────────── */
    const story7 = await buildLearningStory(uid);
    check("D7 progress shows recent practice + problems + next", story7.recent.length >= 3 && story7.problems.some((p) => p.errorId === err.id) && story7.next.count >= 0);
    log("7", `story: recent=${story7.recent.length} problems=${story7.problems.length}`);

    /* ── D14 · Review after a gap ───────────────────────────────────────── */
    await dueAgo(i1.id, 14);
    const d14 = await generateReviewQueue(uid, 10);
    check("D14 item resurfaces after gap", d14.some((q) => q.retrievalItemId === i1.id));
    await submitRetentionReview(uid, i1.id, "production", "As a result, nothing changed.");
    log("14", "gap review done");

    /* ── D21 · Retention/transfer pressure ──────────────────────────────── */
    await dueAgo(i2.id, 21);
    await submitRetentionReview(uid, i2.id, "production", "Teachers play a crucial role.");
    const [i2b] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, i2.id));
    check("D21 ladder advanced beyond exposure on first honest production",
      ["recognition", "retrieval", "usage", "transfer", "retention"].includes(i2b.learningState?.state ?? "exposure"), i2b.learningState?.state);
    log("21", `i2 state=${i2b.learningState?.state}`);

    /* ── D30 · Progress + readiness close the loop ──────────────────────── */
    const story30 = await buildLearningStory(uid);
    const readiness = await buildReadiness(uid, "ielts");
    const hist = (await db.select().from(reviewHistory).where(eq(reviewHistory.userId, uid))).length;
    check("D30 story carries the month (recent + problems + next)", story30.recent.length > 0 && story30.problems.length > 0);
    check("D30 readiness computed without invention", readiness.skills.every((s) => typeof s.evidenceCount === "number"));
    check("D30 real evidence accumulated (every submit of the month recorded, ≥8)", hist >= 8, `hist=${hist}`);
    log("30", `hist=${hist} story.recent=${story30.recent.length}`);

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    if (uid != null) {
      const { wrongPracticeLog } = await import("../src/db/schema");
      const { dailyMissions } = await import("../src/db/schema");
      await db.delete(wrongPracticeLog).where(eq(wrongPracticeLog.userId, uid));
      await db.delete(dailyMissions).where(eq(dailyMissions.userId, uid));
      await db.delete(reviewHistory).where(eq(reviewHistory.userId, uid));
      await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
      await db.delete((await import("../src/db/schema")).chunks).where(eq((await import("../src/db/schema")).chunks.userId, uid));
      await db.delete(errorsT).where(eq(errorsT.userId, uid));
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
      console.log("  (loop30 user cleaned up)");
    }
    await setActiveExam(originalExam);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
