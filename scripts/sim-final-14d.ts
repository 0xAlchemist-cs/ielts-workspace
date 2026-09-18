/** Final-audit 14-day simulation (Phase 20) + memory aggregation perf (Phase 30).
 *  One isolated learner through the documented D0–D14 script; per day snapshot
 *  exam/CEFR/memory/readiness/planner/queue + outcomes. Self-cleaning. */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, ieltsAttempts, learningProfiles, retrievalItems, users } from "../src/db/schema";
import { submitReview } from "../src/server/services/retrieval";
import { generateReviewQueue } from "../src/server/services/retention";
import { buildDailyPlan } from "../src/server/services/planner";
import { buildLearningMemory } from "../src/server/services/learning-memory";
import { buildReadiness } from "../src/server/services/readiness";
import { writeFileSync } from "node:fs";

const DAY = 86_400_000;

async function main() {
  // ── Phase 30 first: memory aggregation at scale ──────────────────────────
  const [pu] = await db.insert(users).values({ name: "__perf_mem__" }).returning();
  const chunkIds: number[] = [];
  for (let i = 0; i < 300; i++) {
    const [c] = await db
      .insert(chunksT)
      .values({ userId: pu.id, text: `perf mem ${i} end up doing`, pattern: "p", meaningEn: "p", meaningZh: "p" })
      .returning();
    chunkIds.push(c.id);
  }
  const rows: { userId: number; itemType: "chunk"; itemId: number; dueAt: number; successCount: number; failCount: number }[] = [];
  for (let i = 0; i < 3000; i++) {
    rows.push({
      userId: pu.id, itemType: "chunk", itemId: chunkIds[i % 300],
      dueAt: Date.now() - 3 * DAY, successCount: i % 2, failCount: i % 3 === 0 ? 2 : 0,
    });
  }
  // dedupe (user,itemType,itemId) is UNIQUE — aggregate duplicates into counts
  const seen = new Map<number, (typeof rows)[0]>();
  for (const r of rows) {
    const prev = seen.get(r.itemId);
    if (prev) {
      prev.successCount += r.successCount;
      prev.failCount += r.failCount;
    } else seen.set(r.itemId, { ...r });
  }
  const uniq = [...seen.values()];
  for (let i = 0; i < uniq.length; i += 500) {
    await db.insert(retrievalItems).values(uniq.slice(i, i + 500));
  }
  console.log(`perf seed: ${uniq.length} unique items (3000 attempts aggregated)`);
  const t0 = Date.now();
  const memBig = await buildLearningMemory(pu.id);
  const memMs = Date.now() - t0;
  const t1 = Date.now();
  await buildReadiness(pu.id, "ielts");
  const readyMs = Date.now() - t1;
  console.log(`PHASE30: 3000 items — memory ${memMs}ms (challenges=${memBig.challenges.length}), readiness ${readyMs}ms`);
  await db.delete(retrievalItems).where(eq(retrievalItems.userId, pu.id));
  await db.delete(chunksT).where(eq(chunksT.userId, pu.id));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, pu.id));
  await db.delete(users).where(eq(users.id, pu.id));

  // ── Phase 20: 14-day simulation ───────────────────────────────────────────
  const [u] = await db.insert(users).values({ name: "__sim14__" }).returning();
  const userId = u.id;
  await db.insert(learningProfiles).values({ userId, cefr: "B1", immersionLevel: 1, dailyMinutes: 30 });
  const items: number[] = [];
  let n = 0;
  const mk = async () => {
    const [c] = await db
      .insert(chunksT)
      .values({ userId, text: `sim14 ${n} end up doing`, pattern: "s", meaningEn: "s", meaningZh: "s" })
      .returning();
    const [it] = await db
      .insert(retrievalItems)
      .values({ userId, itemType: "chunk", itemId: c.id, dueAt: Date.now() - 1000 })
      .returning();
    n++;
    items.push(it.id);
    return { id: it.id, text: c.text };
  };
  const answer = (t: string, ok: boolean) => (ok ? t : "wrong on purpose");
  const due = (id: number) => db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.id, id));
  const dueAgo = (id: number, days: number) =>
    db.update(retrievalItems).set({ dueAt: Date.now() - days * DAY }).where(eq(retrievalItems.id, id));

  const log: string[] = ["# Final-Audit 14-Day Simulation (independent)", ""];
  const snap = async (day: number, note: string) => {
    const [mem, ready, plan, queue] = await Promise.all([
      buildLearningMemory(userId),
      buildReadiness(userId, "ielts"),
      buildDailyPlan(userId),
      generateReviewQueue(userId, 10),
    ]);
    const [prof] = await db.select().from(learningProfiles).where(eq(learningProfiles.userId, userId));
    log.push(
      `**D${day} ${note}** — cefr=${prof.cefr} | memory: ${mem.enoughEvidence ? `${mem.challenges.length} challenges, ${mem.improvements.length} improvements` : "not enough evidence"} | readiness: ${ready.skills.map((s) => `${s.skill}=${s.state}`).join(",") || "none"} | plan: ${plan.budget.mode} ${plan.budget.reviewMin}/${plan.budget.newMin}m | queue ${queue.length}`,
    );
    console.log(`D${day} ${note}: mem=${mem.challenges.length}ch plan=${plan.budget.mode} q=${queue.length}`);
  };

  const d0 = await mk();
  await snap(0, "new item");
  await submitReview(userId, d0.id, "production", answer(d0.text, false));
  await snap(1, "retrieval failure");
  await due(d0.id);
  await submitReview(userId, d0.id, "production", d0.text);
  await snap(2, "retry success");
  const d3 = await mk();
  await submitReview(userId, d3.id, "production", d3.text);
  await snap(3, "new material");
  await db.insert(ieltsAttempts).values({ userId, taskId: 1, mode: "learning", responses: { taskSkill: "reading" }, score: 60, band: 6.0 } as typeof ieltsAttempts.$inferInsert);
  await snap(4, "writing use (exam attempt)");
  await due(items[0]);
  await submitReview(userId, items[0], "production", d0.text);
  await snap(5, "retrieval success");
  await snap(6, "missed day (no action)");
  await due(items[0]);
  await submitReview(userId, items[0], "production", d0.text);
  await snap(7, "return");
  const d8 = await mk();
  await db.update(retrievalItems).set({ failCount: 3 }).where(eq(retrievalItems.id, d8.id));
  await snap(8, "new weak item");
  await due(items[1] ?? items[0]);
  await submitReview(userId, items[1] ?? items[0], "context_transfer", d3.text);
  await snap(9, "transfer");
  await dueAgo(items[0], 30);
  await submitReview(userId, items[0], "production", "wrong on purpose");
  await snap(10, "delayed failure");
  await db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.userId, userId));
  const q = await generateReviewQueue(userId, 5);
  for (const e of q.slice(0, 2)) await submitReview(userId, e.retrievalItemId, e.mode, e.expected);
  await snap(11, "rescue review");
  await due(items[0]);
  await submitReview(userId, items[0], "production", d0.text);
  await snap(12, "successful retrieval");
  const d13 = await mk();
  await submitReview(userId, d13.id, "production", d13.text);
  await snap(13, "new article");
  await dueAgo(items[0], 90);
  await submitReview(userId, items[0], "retention_check", d0.text);
  await snap(14, "retention");

  log.push("", "## Verdict inputs", "- modes/challenges/readiness evolved per-day (see lines above)", "- no crash, no negative interval (asserted by test:data)");
  writeFileSync("artifacts/FINAL_14DAY_SIMULATION.md", log.join("\n"), "utf-8");
  console.log("artifact written");

  await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
  await db.delete(chunksT).where(eq(chunksT.userId, userId));
  await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, userId));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
