/** V15.2 Review Queue Unification verification — every source lands in the
 *  ONE canonical queue (generateReviewQueue) with merged reasons, one entry
 *  per item, priority + format rotation intact, and the mission batch drawn
 *  from the same queue. Run: npm run test:review-unified */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  chunks as chunksT, errors as errorsT, learningProfiles, retrievalItems,
  users, wrongPracticeLog, dailyMissions,
} from "../src/db/schema";
import { addError } from "../src/server/services/bank";
import { generateReviewQueue } from "../src/server/services/retention";
import { ensureRetrievalItem } from "../src/server/services/retrieval";
import { generateTodayMission } from "../src/server/services/mission";
import { getActiveExam, setActiveExam } from "../src/server/current-user";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

const DAY = 86_400_000;
const LS = (over: Partial<import("../src/lib/types").ItemLearningState> = {}): import("../src/lib/types").ItemLearningState => ({
  state: "retrieval", achievedAt: {}, contexts: [], productionHits: 0,
  productionMisses: 0, contextualHits: 0, contextualMisses: 0, ...over,
});

async function seedChunk(uid: number, text: string): Promise<{ chunkId: number; itemId: number }> {
  const [c] = await db.insert(chunksT).values({
    userId: uid, text, meaningEn: `meaning of ${text}`, meaningZh: "因此", examples: [],
  }).returning();
  await ensureRetrievalItem(uid, "chunk", c.id);
  const [item] = await db.select()
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "chunk"), eq(retrievalItems.itemId, c.id)))
    .limit(1);
  return { chunkId: c.id, itemId: item.id };
}

async function main() {
  const originalExam = await getActiveExam();
  await setActiveExam("ielts");
  let uid: number | null = null;
  try {
    const [u] = await db.insert(users).values({ name: "__ru_verify__", examProfile: "ielts" }).returning();
    uid = u.id;
    await db.insert(learningProfiles).values({ userId: uid, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });

    /* seed one item per source, plus one item carrying THREE signals at once */
    const overdue = await seedChunk(uid, "as a result");
    await db.update(retrievalItems).set({ dueAt: Date.now() - 3 * DAY }).where(eq(retrievalItems.id, overdue.itemId));

    const weak = await seedChunk(uid, "take up");
    await db.update(retrievalItems).set({ dueAt: Date.now() - DAY, failCount: 3, successCount: 1 }).where(eq(retrievalItems.id, weak.itemId));

    const err = await addError(uid, { category: "vocabulary", wrongForm: "farming", correctForm: "agriculture", explanation: "Q2", sourceModule: "ieltscb_reading" });
    const [errItem] = await db.select().from(retrievalItems)
      .where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, err.id))).limit(1);

    const forgetting = await seedChunk(uid, "play a crucial role");
    await db.update(retrievalItems).set({
      dueAt: Date.now(), successCount: 2, failCount: 1, lastQuality: 0,
      retentionScore: 40, forgettingDetected: 1, learningState: LS({ state: "retrieval" }),
    }).where(eq(retrievalItems.id, forgetting.itemId));

    const retention = await seedChunk(uid, "there is no denying");
    await db.update(retrievalItems).set({
      dueAt: Date.now() + 2 * DAY, successCount: 3, intervalDays: 10,
      lastRetentionCheckAt: Date.now() - 35 * DAY, retentionCheckInterval: 30,
      learningState: LS({ state: "retention" }),
    }).where(eq(retrievalItems.id, retention.itemId));

    /* P1-3 regression: a retention item whose check is NOT yet due (checked
       yesterday, 30-day interval → due in 29 days) must stay OUT of today's
       queue. dueAt is also pushed far out so the 1-day almost-due grace can't
       pull it in — this isolates the future-timestamp-treated-as-truthy bug. */
    const notYetDue = await seedChunk(uid, "bear in mind that");
    await db.update(retrievalItems).set({
      dueAt: Date.now() + 25 * DAY, successCount: 3, intervalDays: 30,
      lastRetentionCheckAt: Date.now() - DAY, retentionCheckInterval: 30,
      learningState: LS({ state: "retention" }),
    }).where(eq(retrievalItems.id, notYetDue.itemId));

    // the error ALSO carries a wrong-practice failure → overdue + recurring_error + wrong_practice
    await db.update(retrievalItems).set({ dueAt: Date.now() - DAY, failCount: 2 }).where(eq(retrievalItems.id, errItem.id));
    await db.insert(wrongPracticeLog).values({
      userId: uid, sessionId: "11111111-2222-3333-4444-555555555555", errorId: err.id,
      source: "IELTSCB report", sourceQuestion: "Q2", practiceType: "retrieval", result: "incorrect", quality: 0,
      createdAt: Date.now() - DAY,
    });

    /* ── the ONE queue ──────────────────────────────────────────────────── */
    const queue = await generateReviewQueue(uid, 20);

    const byItem = new Map(queue.map((q) => [q.retrievalItemId, q]));
    check("① overdue → unified queue", byItem.has(overdue.itemId) && (byItem.get(overdue.itemId)!.reasons.includes("overdue")));
    check("② weak retrieval → unified queue", byItem.has(weak.itemId) && byItem.get(weak.itemId)!.reasons.includes("weak_retrieval"));
    check("③ recurring error → unified queue (Error Revenge = a category, not an engine)", byItem.has(errItem.id) && byItem.get(errItem.id)!.reasons.includes("recurring_error"));
    check("④ forgetting → unified queue", byItem.has(forgetting.itemId) && byItem.get(forgetting.itemId)!.reasons.includes("forgettingDetected"));
    check("⑤ retention → unified queue", byItem.has(retention.itemId) && byItem.get(retention.itemId)!.reasons.includes("retention_check"));
    check("⑤b not-yet-due retention check stays OUT of today's queue", !byItem.has(notYetDue.itemId),
      byItem.has(notYetDue.itemId) ? `leaked with reasons=${JSON.stringify(byItem.get(notYetDue.itemId)!.reasons)}` : "");
    check("⑥ wrong-practice failure → unified queue as a reason (no second queue)", byItem.get(errItem.id)!.reasons.includes("wrong_practice"));

    /* ── one item, many reasons; never many entries ────────────────────── */
    const errEntries = queue.filter((q) => q.retrievalItemId === errItem.id);
    check("⑦ multi-signal item appears exactly ONCE (no duplicate tasks)", errEntries.length === 1, `got ${errEntries.length}`);
    check("⑧ all its reasons preserved on that single entry",
      ["overdue", "recurring_error", "wrong_practice"].every((r) => errEntries[0].reasons.includes(r)),
      JSON.stringify(errEntries[0]?.reasons));

    /* ── priority + format rotation intact ─────────────────────────────── */
    const priorities = queue.map((q) => q.priority);
    check("⑨ priority computed & ordered (desc, 0-100)", priorities.every((p) => p >= 0 && p <= 100) &&
      priorities.every((p, i) => i === 0 || priorities[i - 1] >= p));
    const modes = new Set(queue.map((q) => q.mode));
    check("⑩ format engine still decides variety (multiple formats present)", modes.size >= 2, [...modes].join(","));
    check("⑪ retention fields survive on entries (interval check metadata)", byItem.get(retention.itemId)!.mode === "retention_check" || byItem.get(retention.itemId)!.reasons.includes("retention_check"));

    /* ── Error Bank + planner + session consume the same queue ─────────── */
    const [errRow] = await db.select().from(errorsT).where(eq(errorsT.id, err.id));
    check("⑫ Error Bank intact (row untouched, wired to its queue item)", errRow.wrongForm === "farming" && byItem.has(errItem.id));

    await db.delete(dailyMissions).where(eq(dailyMissions.userId, uid));
    const mission = await generateTodayMission(uid);
    const canonicalIds = new Set(queue.map((q) => q.retrievalItemId));
    const missionIds = (mission.plan as { retrieval: { itemIds: number[] } }).retrieval.itemIds;
    check("⑬ planner/mission batch drawn from the canonical queue", missionIds.length > 0 && missionIds.every((id) => canonicalIds.has(id)),
      `mission=${missionIds.length} canonical=${canonicalIds.size}`);
    check("⑭ session contract: retrieval step pending when the queue has work",
      (mission.plan as { retrieval: { status: string } }).retrieval.status === "pending");

    /* ── no duplicate task creation over repeated reads ─────────────────── */
    const again = await generateReviewQueue(uid, 20);
    check("⑮ re-reading the queue creates nothing (stable ids, no side effects)",
      again.length === queue.length && again.every((q, i) => q.retrievalItemId === queue[i].retrievalItemId));

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    if (uid != null) {
      await db.delete(wrongPracticeLog).where(eq(wrongPracticeLog.userId, uid));
      await db.delete(dailyMissions).where(eq(dailyMissions.userId, uid));
      await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
      await db.delete(chunksT).where(eq(chunksT.userId, uid));
      await db.delete(errorsT).where(eq(errorsT.userId, uid));
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
      console.log("  (review-unified verify user cleaned up)");
    }
    await setActiveExam(originalExam);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
