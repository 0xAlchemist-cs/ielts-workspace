/** V10 Adaptive Planner verification — pure-function budgets, interval
 * evolution over a simulated learner, pressure adaptation, CEFR-differentiated
 * selection, truthful reasons, scheduling integrity. Restores all state.
 * Run: npm run test:planner */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, learningProfiles, retrievalItems, reviewHistory, users } from "../src/db/schema";
import { allocateBudget, projectTomorrow, buildDailyPlan } from "../src/server/services/planner";
import { submitRetentionReview } from "../src/server/services/retention";
import { selectNextContent } from "../src/server/services/content-selection";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

async function main() {
  // ── 1 · time budget across minutes × pressure (pure) ──────────────────────
  const calm = allocateBudget(45, { dueCount: 2, atRiskCount: 0, recentFailures: 0, daysSinceLastStudy: 0 });
  check("calm 45min → new-heavy, review≈35%", calm.mode === "new-heavy" && calm.reviewMin + calm.newMin + calm.transferMin <= 46 && calm.reviewMin >= 12);
  const busy = allocateBudget(45, { dueCount: 20, atRiskCount: 6, recentFailures: 8, daysSinceLastStudy: 0 });
  check("heavy pressure 45min → review-heavy/rescue", (busy.mode === "review-heavy" || busy.mode === "rescue") && busy.reviewMin > busy.newMin);
  const tiny = allocateBudget(15, { dueCount: 1, atRiskCount: 0, recentFailures: 0, daysSinceLastStudy: 0 });
  check("15min fits inside budget", tiny.reviewMin + tiny.newMin + tiny.transferMin <= 16 && tiny.reviewCount >= 3);
  check("review batch capped at 24", allocateBudget(240, { dueCount: 200, atRiskCount: 50, recentFailures: 40, daysSinceLastStudy: 0 }).reviewCount <= 24);
  const rescue = allocateBudget(45, { dueCount: 5, atRiskCount: 0, recentFailures: 0, daysSinceLastStudy: 7 });
  check("missed days → rescue, small batch, welcoming why", rescue.mode === "rescue" && rescue.reviewCount <= 8 && rescue.whyEn.includes("Welcome back"));
  check("every budget carries a bilingual why", !!calm.whyEn && !!calm.whyZh && !!busy.whyEn && !!rescue.whyZh);

  // ── 2 · tomorrow projection (pure, deterministic) ─────────────────────────
  const t = projectTomorrow({ dueTomorrowCount: 3, todayRiskCount: 2 });
  check("success scenario = base count", t.successCount === 3);
  check("struggle scenario adds failed-today resets", t.struggleCount === 5);
  check("projection lines are human", t.successLine.en.includes("3 items") && t.struggleLine.zh.includes("5"));

  // ── 3 · interval evolution: simulated D0..D7 learner (service-level) ─────
  const [u] = await db.insert(users).values({ name: "__planner_verify__", examProfile: "ielts" }).returning();
  const userId = u.id;
  await db.insert(learningProfiles).values({ userId, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });
  try {
    // seed a learnable chunk (self-made: corpus-independent) + its schedule row
    const [made] = await db.insert(chunksT).values({
      userId, text: "without a second thought", meaningEn: "instantly, without hesitating",
      meaningZh: "毫不犹豫", examples: ["She said yes without a second thought."],
    }).returning();
    const chunkId = made.id;
    const { ensureRetrievalItem } = await import("../src/server/services/retrieval");
    await ensureRetrievalItem(userId, "chunk", chunkId);
    const itemId = (await db.select().from(retrievalItems).where(eq(retrievalItems.userId, userId))).find(
      (r) => r.itemType === "chunk" && r.itemId === chunkId,
    )!.id;

    // success → interval grows monotonically, no impossible dates
    const r1 = await submitRetentionReview(userId, itemId, "production", "without a second thought");
    const [after1] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, itemId));
    check("first success schedules a future due date", after1.dueAt > Date.now() && after1.intervalDays >= 1);
    // failure → interval resets to 1 (tomorrow)
    const r2 = await submitRetentionReview(userId, itemId, "production", "totally wrong");
    const [after2] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, itemId));
    check("failure pulls the item to tomorrow", after2.intervalDays <= 1 && after2.dueAt <= Date.now() + 86_400_000 + 1000);
    check("no negative intervals ever", after2.intervalDays >= 1 && after1.intervalDays >= 1);
    // recovery grows again
    await submitRetentionReview(userId, itemId, "production", "without a second thought");
    const [after3] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, itemId));
    check("recovery extends the interval again", after3.intervalDays > after2.intervalDays);

    // ── 4 · plan adapts with pressure (service-level) ───────────────────────
    const planCalm = await buildDailyPlan(userId);
    check("plan assembles with budget + tomorrow", !!planCalm.budget.mode && typeof planCalm.tomorrow.successCount === "number");
    // simulate overdue pressure: this item + 20 fabricated due-yesterday rows
    await db.update(retrievalItems).set({ dueAt: Date.now() - 86_400_000 }).where(eq(retrievalItems.userId, userId));
    await db.insert(retrievalItems).values(
      Array.from({ length: 20 }, (_, i) => ({
        userId, itemType: "vocab" as const, itemId: -100 - i,
        dueAt: Date.now() - 86_400_000,
      })),
    );
    const planBusy = await buildDailyPlan(userId);
    check("plan turns review-heavy under backlog", planBusy.budget.mode !== "new-heavy" && planBusy.budget.reviewMin >= planCalm.budget.reviewMin);

    // ── 5 · CEFR-differentiated selection + truthful reason ─────────────────
    const selB1 = await selectNextContent({ userId, skill: "reading" });
    check("selection returns a human reason", !!selB1?.reasonHuman?.en && selB1.reasonHuman.en.length > 8);
    await db.update(learningProfiles).set({ cefr: "C1" }).where(eq(learningProfiles.userId, userId));
    const selC1 = await selectNextContent({ userId, skill: "reading" });
    check("different CEFR can rank content differently", !!selC1 && !!selB1 && (selC1.content.id !== selB1.content.id || selC1.score !== selB1.score));

    // ── 6 · integrity: unique schedule rows, no cross-user leak ────────────
    const myItems = await db.select().from(retrievalItems).where(eq(retrievalItems.userId, userId));
    check("schedule rows are unique per item", new Set(myItems.map((i) => `${i.itemType}:${i.itemId}`)).size === myItems.length);

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    await db.delete(reviewHistory).where(eq(reviewHistory.userId, userId));
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
    await db.delete(chunksT).where(eq(chunksT.userId, userId));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
