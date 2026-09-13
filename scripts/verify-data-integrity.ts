/**
 * Phase-14 data integrity audit — read-only assertions over the real DB.
 * Exit 1 on hard violations (impossible values, orphans, dangling refs);
 * advisory findings are reported but don't fail (they need cause analysis,
 * never blind repair).
 *
 *   npm run test:data
 */
import { db } from "@/db";
import { chunks, retrievalItems, errors, contents, reviewHistory, dailyMissions, chunkEvents } from "@/db/schema";
import { isNotNull, and, sql } from "drizzle-orm";

const LADDER = ["exposure", "understanding", "recognition", "retrieval", "usage", "transfer", "retention"];

let hard = 0;
const advisory: string[] = [];
function fail(msg: string) { hard++; console.log(`  ✗ FAIL ${msg}`); }
function ok(msg: string) { console.log(`  ✓ ${msg}`); }

(async () => {
  console.log("── Language items ──");
  const [orphanChunks, userChunks, dupChunks, badStrength] = await Promise.all([
    db.select({ id: chunks.id, src: chunks.sourceContentId }).from(chunks)
      .where(and(isNotNull(chunks.userId), isNotNull(chunks.sourceContentId))),
    db.select().from(chunks).where(isNotNull(chunks.userId)),
    db.select({ text: chunks.text, userId: chunks.userId, c: sql<number>`count(*)` })
      .from(chunks).where(isNotNull(chunks.userId)).groupBy(chunks.text, chunks.userId),
    db.select().from(chunks).where(sql`${chunks.retrievalStrength} < 0 OR ${chunks.retrievalStrength} > 100`),
  ]);
  const contentIds = new Set((await db.select({ id: contents.id }).from(contents)).map((r) => r.id));
  const dangling = orphanChunks.filter((c) => c.src != null && !contentIds.has(c.src));
  dangling.length ? fail(`${dangling.length} user chunks reference deleted contents: ${dangling.slice(0, 5).map((d) => d.id).join(",")}`) : ok("no chunks reference missing contents");
  badStrength.length ? fail(`${badStrength.length} chunks with strength <0 or >100`) : ok("all chunk strengths within 0–100");
  const dups = dupChunks.filter((d) => Number(d.c) > 1);
  dups.length ? advisory.push(`${dups.length} duplicate (userId,text) chunk groups — e.g. "${dups[0].text}" ×${dups[0].c}`) : ok("no duplicate user chunks");

  console.log("── Retrieval engine state ──");
  const rItems = await db.select().from(retrievalItems);
  const badState = rItems.filter((r) => !LADDER.includes(r.learningState.state));
  badState.length ? fail(`${badState.length} retrieval items with off-ladder states: ${[...new Set(badState.map((b) => b.learningState.state))].join(",")}`) : ok("all learning states on the 7-state ladder");
  const badSchedule = rItems.filter((r) => r.lastRetentionCheckAt != null && r.dueAt < r.lastRetentionCheckAt);
  badSchedule.length ? fail(`${badSchedule.length} retrieval items due BEFORE their last retention check (impossible schedule)`) : ok("no impossible dueAt < lastRetentionCheckAt");
  const danglingItemRefs = rItems.filter((r) => r.itemType === "chunk" && !userChunks.some((c) => c.id === r.itemId));
  const errorRows = await db.select({ id: errors.id, userId: errors.userId }).from(errors);
  const danglingErrorRefs = rItems.filter((r) => r.itemType === "error" && !errorRows.some((e) => e.id === r.itemId));
  danglingItemRefs.length ? fail(`${danglingItemRefs.length} chunk retrieval items point to nonexistent chunks`) : ok("all chunk retrieval items resolve");
  danglingErrorRefs.length ? advisory.push(`${danglingErrorRefs.length} error retrieval items point to deleted error rows (revenge queue skips them)`) : ok("all error retrieval items resolve");
  const badRetention = rItems.filter((r) => r.retentionScore < 0 || r.retentionScore > 100 || r.retentionCheckInterval < 0);
  badRetention.length ? fail(`${badRetention.length} retrieval items with invalid retention score/interval`) : ok("retention scores/intervals valid");
  const futureChecks = rItems.filter((r) => r.lastRetentionCheckAt != null && r.lastRetentionCheckAt > Date.now() + 3600_000);
  futureChecks.length ? fail(`${futureChecks.length} retention checks timestamped in the future`) : ok("no future-dated retention checks");

  console.log("── Events & history ──");
  const [evRows, rhRows] = await Promise.all([
    db.select({ id: chunkEvents.id, chunkId: chunkEvents.chunkId }).from(chunkEvents),
    db.select({ id: reviewHistory.id, quality: reviewHistory.quality, retrievalItemId: reviewHistory.retrievalItemId }).from(reviewHistory),
  ]);
  const userChunkIds = new Set(userChunks.map((c) => c.id));
  const orphanEvents = evRows.filter((e) => !userChunkIds.has(e.chunkId));
  orphanEvents.length ? advisory.push(`${orphanEvents.length} chunk_events reference corpus/deleted chunks (historical evidence, kept)`) : ok("all chunk_events resolve to user chunks");
  const rItemIds = new Set(rItems.map((r) => r.id));
  const orphanHistory = rhRows.filter((r) => !rItemIds.has(r.retrievalItemId));
  orphanHistory.length ? advisory.push(`${orphanHistory.length} review_history rows point to deleted retrieval items (historical, kept)`) : ok("all review_history rows resolve");
  rhRows.filter((r) => r.quality != null && ![0, 3, 5].includes(r.quality)).length
    ? fail("review history contains qualities outside {0,3,5}")
    : ok("review history qualities valid");

  console.log("── Missions ──");
  const missions = await db.select().from(dailyMissions);
  const staleRefs: number[] = [];
  for (const m of missions) {
    const plan = m.plan as { reading?: { contentId?: number }; listening?: { contentId?: number } } | null;
    for (const seg of [plan?.reading, plan?.listening]) {
      if (seg?.contentId && !contentIds.has(seg.contentId)) staleRefs.push(m.id);
    }
  }
  staleRefs.length ? fail(`${staleRefs.length} missions reference deleted contents: ${staleRefs.slice(0, 5).join(",")}`) : ok(`all ${missions.length} missions reference live contents`);

  console.log("");
  if (advisory.length) {
    console.log(`Advisory (cause analysis, no auto-repair):`);
    for (const a of advisory) console.log(`  ⚠ ${a}`);
  }
  console.log(hard === 0 ? `DATA INTEGRITY OK — ${advisory.length} advisory` : `DATA INTEGRITY FAILED — ${hard} hard violations`);
  process.exit(hard === 0 ? 0 : 1);
})();
