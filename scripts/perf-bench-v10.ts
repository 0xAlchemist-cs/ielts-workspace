/** Phase-29 perf bench for the V10 planner (validation artifact, manual run).
 *  Measures generateReviewQueue + buildDailyPlan at 10/100/1k/10k items on an
 *  isolated temp learner; self-cleaning.  Run: npx tsx scripts/perf-bench-v10.ts */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, learningProfiles, retrievalItems, users } from "../src/db/schema";
import { generateReviewQueue } from "../src/server/services/retention";
import { buildDailyPlan } from "../src/server/services/planner";

async function bench(n: number) {
  const [u] = await db.insert(users).values({ name: `__perf_${n}` }).returning();
  const chunkIds: number[] = [];
  for (let i = 0; i < n; i++) {
    const [c] = await db
      .insert(chunksT)
      .values({ userId: u.id, text: `perf ${i} end up doing`, pattern: "p", meaningEn: "p", meaningZh: "p" })
      .returning();
    chunkIds.push(c.id);
  }
  const rows = Array.from({ length: n }, (_, i) => ({
    userId: u.id,
    itemType: "chunk" as const,
    itemId: chunkIds[i],
    dueAt: Date.now() - 3 * 86_400_000,
    failCount: i % 3 === 0 ? 2 : 0,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(retrievalItems).values(rows.slice(i, i + 500));
  }
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 30 });
  const t0 = Date.now();
  await generateReviewQueue(u.id, 30);
  const qMs = Date.now() - t0;
  const t1 = Date.now();
  await buildDailyPlan(u.id);
  const pMs = Date.now() - t1;
  await db.delete(retrievalItems).where(eq(retrievalItems.userId, u.id));
  await db.delete(chunksT).where(eq(chunksT.userId, u.id));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(`${n} items: queue ${qMs}ms, plan ${pMs}ms`);
}

(async () => {
  for (const n of [10, 100, 1000, 10000]) await bench(n);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
