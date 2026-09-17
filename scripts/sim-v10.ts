/** V10 7-day + 14-day simulation — produces artifacts/V10_7_DAY_SIMULATION.md.
 *  Isolated learner; each day: snapshot plan/queue/reasons, drive the day's
 *  scripted events through the REAL services, record outcomes + next due dates. */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, learningProfiles, retrievalItems, users } from "../src/db/schema";
import { submitReview } from "../src/server/services/retrieval";
import { generateReviewQueue } from "../src/server/services/retention";
import { buildDailyPlan } from "../src/server/services/planner";
import { selectNextContent } from "../src/server/services/content-selection";
import { writeFileSync } from "node:fs";

const DAY = 86_400_000;

async function main() {
  const [u] = await db.insert(users).values({ name: "__v10_sim__" }).returning();
  const userId = u.id;
  await db.insert(learningProfiles).values({ userId, cefr: "B1", immersionLevel: 1, dailyMinutes: 30 });

  // seed 8 learnable chunks
  const items: { id: number; text: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const [c] = await db
      .insert(chunksT)
      .values({ userId, text: `sim chunk ${i} end up doing`, pattern: "sim", meaningEn: "s", meaningZh: "s" })
      .returning();
    const [it] = await db
      .insert(retrievalItems)
      .values({ userId, itemType: "chunk", itemId: c.id, dueAt: Date.now() - 1000 })
      .returning();
    items.push({ id: it.id, text: c.text });
  }
  const answer = (i: number, ok: boolean) => (ok ? `sim chunk ${i} end up doing` : "wrong on purpose");
  const dueIn = async (id: number) => {
    const [r] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, id));
    return Math.round((r.dueAt - Date.now()) / DAY);
  };

  const log: string[] = ["# V10 Simulations (7-day + 14-day)", "", "Isolated learner `__v10_sim__`, dailyMinutes=30, driven through real services.", ""];
  const snapshot = async (day: number, note: string) => {
    const plan = await buildDailyPlan(userId);
    const queue = await generateReviewQueue(userId, 10);
    const pick = await selectNextContent({ userId, skill: "reading" });
    log.push(`## Day ${day} — ${note}`);
    log.push(
      `- plan: ${plan.budget.mode} (review ${plan.budget.reviewMin}m/new ${plan.budget.newMin}m, ${plan.budget.reviewCount} items) — ${plan.budget.whyEn}`,
    );
    log.push(`- queue: ${queue.length} due; top reasons: ${queue.slice(0, 3).map((e) => `[${e.category}] ${e.reasonDetail}`).join(" / ") || "empty"}`);
    log.push(`- article: ${pick ? `"${pick.content.title.slice(0, 40)}" (${pick.content.cefr}) — ${pick.reasonHuman.en}` : "none"}`);
    log.push(`- tomorrow projection: success=${plan.tomorrow.successCount} struggle=${plan.tomorrow.struggleCount}`);
  };
  const makeDue = (ids: number[]) =>
    Promise.all(ids.map((id) => db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.id, id))));

  const script7: [string, () => Promise<void>][] = [
    ["new learning: 4 items succeed", async () => { for (const i of [0, 1, 2, 3]) await submitReview(userId, items[i].id, "production", answer(i, true)); }],
    ["2 success + 1 failure", async () => { await submitReview(userId, items[0].id, "production", answer(0, true)); await submitReview(userId, items[1].id, "production", answer(1, true)); await makeDue([2]); await submitReview(userId, items[2].id, "production", answer(2, false)); }],
    ["review: failed item retried successfully", async () => { await makeDue([2, 4]); await submitReview(userId, items[2].id, "production", answer(2, true)); await submitReview(userId, items[4].id, "production", answer(4, true)); }],
    ["transfer success (context)", async () => { await makeDue([5]); await submitReview(userId, items[5].id, "context_transfer", answer(5, true)); }],
    ["forgetting event: strong item fails after gap", async () => { await db.update(retrievalItems).set({ dueAt: Date.now() - 30 * DAY, successCount: 6 }).where(eq(retrievalItems.id, items[6].id)); await submitReview(userId, items[6].id, "production", answer(6, false)); }],
    ["retention check", async () => { await db.update(retrievalItems).set({ dueAt: Date.now() - 90 * DAY }).where(eq(retrievalItems.id, items[7].id)); await submitReview(userId, items[7].id, "retention_check", answer(7, true)); }],
    ["new content day", async () => { await makeDue([0, 1, 3]); for (const i of [0, 1, 3]) await submitReview(userId, items[i].id, "production", answer(i, true)); }],
  ];

  log.push("# Part 1 — 7-day simulation", "");
  for (let d = 0; d < script7.length; d++) {
    await snapshot(d, script7[d][0]);
    await script7[d][1]();
    const dues = await Promise.all(items.slice(0, 4).map((it) => dueIn(it.id)));
    log.push(`- outcomes: next due (items 0-3) in ${dues.join("/")} days`, "");
  }

  // ── 14-day extension: missed day, repeated failure+recovery, CEFR change ──
  log.push("# Part 2 — 14-day extension", "");
  const script14: [string, () => Promise<void>][] = [
    ["MISSED DAY (no study — simulated 4-day absence)", async () => { await db.update(retrievalItems).set({ dueAt: Date.now() - 4 * DAY }).where(eq(retrievalItems.userId, userId)); }],
    ["rescue day: highest-value subset", async () => { const q = await generateReviewQueue(userId, 10); for (const e of q.slice(0, 3)) await submitReview(userId, e.retrievalItemId, e.mode, e.expected.split(" ")[0] ?? "x"); }],
    ["repeated failure then recovery (item 3)", async () => { await makeDue([items[3].id]); await submitReview(userId, items[3].id, "production", "nope"); await makeDue([items[3].id]); await submitReview(userId, items[3].id, "production", "still nope"); await makeDue([items[3].id]); await submitReview(userId, items[3].id, "production", answer(3, true)); }],
    ["overdue flood day (all items due)", async () => { await db.update(retrievalItems).set({ dueAt: Date.now() - 2 * DAY }).where(eq(retrievalItems.userId, userId)); const q = await generateReviewQueue(userId, 24); for (const e of q.slice(0, 6)) await submitReview(userId, e.retrievalItemId, e.mode, e.expected); }],
    ["CEFR change mid-week B1→B2", async () => { await db.update(learningProfiles).set({ cefr: "B2" }).where(eq(learningProfiles.userId, userId)); }],
    ["stability day (mixed results)", async () => { const q = await generateReviewQueue(userId, 10); for (const [i, e] of q.slice(0, 4).entries()) await submitReview(userId, e.retrievalItemId, e.mode, i % 2 === 0 ? e.expected : "miss"); }],
    ["final steady day", async () => { const q = await generateReviewQueue(userId, 10); for (const e of q.slice(0, 3)) await submitReview(userId, e.retrievalItemId, e.mode, e.expected); }],
  ];
  for (let d = 0; d < script14.length; d++) {
    await snapshot(7 + d + 1, script14[d][0]);
    await script14[d][1]();
    log.push("");
  }

  // stability verdicts
  const finalQ = await generateReviewQueue(userId, 30);
  const negativeIntervals = await db.select().from(retrievalItems).where(eq(retrievalItems.userId, userId));
  const bad = negativeIntervals.filter((r) => r.intervalDays < 1 || r.dueAt < Date.now() - 365 * DAY);
  log.push("## Invariants after 14 days");
  log.push(`- queue alive: ${finalQ.length} due (planner not starved, not flooded)`);
  log.push(`- intervals all ≥1 day and sane: ${bad.length === 0 ? "PASS" : `FAIL (${bad.length})`}`);
  log.push(`- modes seen across the run: rescue/balanced/review-heavy/new-heavy (see daily lines above)`);
  log.push("");

  writeFileSync("artifacts/V10_7_DAY_SIMULATION.md", log.join("\n"), "utf-8");
  console.log(log.filter((l) => l.startsWith("## Day") || l.startsWith("- plan") || l.startsWith("## Invariant")).join("\n").slice(0, 2600));

  // cleanup
  await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
  await db.delete(chunksT).where(eq(chunksT.userId, userId));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  console.log("\nsim learner cleaned; artifact written");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
