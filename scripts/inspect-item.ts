/**
 * Phase-13 observability tool — trace WHY the system believes what it believes
 * about one learner + one language item.
 *
 *   npm run inspect:item                       (real user, most-recent chunk)
 *   npm run inspect:item -- --user 8 --item 42
 *
 * Prints: evidence ledger (chunk_events), learning ladder state, strengths,
 * retention fields, linked errors, module contexts, and the next scheduled
 * review action. Read-only.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, chunks, chunkEvents, retrievalItems, errors, reviewHistory } from "@/db/schema";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

(async () => {
  // resolve user: explicit id, else the single real (non-stub) account
  let userId = arg("user") ? Number(arg("user")) : undefined;
  if (userId == null) {
    const all = await db.select().from(users);
    const real = all.find((u) => !u.name.startsWith("__") && u.name !== "loop-audit");
    if (!real) { console.error("no real user found — pass --user <id>"); process.exit(1); }
    userId = real.id;
  }

  // resolve item: explicit chunk id, else user's most recently created chunk
  let chunkId = arg("item") ? Number(arg("item")) : undefined;
  if (chunkId == null) {
    const [latest] = await db.select().from(chunks)
      .where(eq(chunks.userId, userId)).orderBy(desc(chunks.createdAt)).limit(1);
    if (!latest) { console.error(`user ${userId} has no chunks — pass --item <chunkId>`); process.exit(1); }
    chunkId = latest.id;
  }

  const [chunk] = await db.select().from(chunks).where(and(eq(chunks.id, chunkId), eq(chunks.userId, userId)));
  if (!chunk) { console.error(`chunk ${chunkId} not owned by user ${userId}`); process.exit(1); }

  const [events, rItems] = await Promise.all([
    db.select().from(chunkEvents).where(and(eq(chunkEvents.userId, userId), eq(chunkEvents.chunkId, chunkId))).orderBy(chunkEvents.createdAt),
    db.select().from(retrievalItems).where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemId, chunkId), eq(retrievalItems.itemType, "chunk"))),
  ]);
  const rItem = rItems[0];
  const rHistory = rItem
    ? await db.select().from(reviewHistory).where(eq(reviewHistory.retrievalItemId, rItem.id)).orderBy(desc(reviewHistory.createdAt)).limit(20)
    : [];
  // linked errors whose correctForm starts with the chunk's first word (heuristic association)
  const firstWord = chunk.text.toLowerCase().split(" ")[0];
  const linkedErrors = chunk.text.length > 3
    ? (await db.select().from(errors).where(eq(errors.userId, userId)))
        .filter((e) => e.correctForm.toLowerCase().includes(firstWord))
    : [];

  console.log(`═══ Item ${chunk.id}: "${chunk.text}" (user ${userId}) ═══`);
  console.log(`pattern: ${chunk.pattern || "—"} | register: ${chunk.register}`);
  console.log(`retrievalStrength: ${chunk.retrievalStrength} | activatedAt: ${chunk.activatedAt ? new Date(chunk.activatedAt).toISOString().slice(0, 10) : "not yet (passive)"} | lastReview: ${chunk.lastReviewAt ? new Date(chunk.lastReviewAt).toISOString().slice(0, 10) : "—"}`);

  if (rItem) {
    const ls = rItem.learningState;
    console.log(`\n── Learning ladder state ──`);
    const achieved = ls.achievedAt as Record<string, number> | undefined;
    console.log(`state: ${ls.state} | achievedAt: ${achieved?.[ls.state] ? new Date(achieved[ls.state]).toISOString().slice(0, 10) : "—"}`);
    console.log(`contexts: ${JSON.stringify(ls.contexts ?? [])}`);
    console.log(`production hits/misses: ${ls.productionHits ?? 0}/${ls.productionMisses ?? 0} | contextual: ${ls.contextualHits ?? 0}/${ls.contextualMisses ?? 0}`);
    console.log(`failCount: ${rItem.failCount} | successCount: ${rItem.successCount} | interval: ${rItem.intervalDays}d | ease: ${rItem.easeFactor}`);
    console.log(`retentionScore: ${rItem.retentionScore} | checkInterval: ${rItem.retentionCheckInterval}d | forgettingDetected: ${!!rItem.forgettingDetected} | lastCheck: ${rItem.lastRetentionCheckAt ? new Date(rItem.lastRetentionCheckAt).toISOString().slice(0, 10) : "—"}`);
    console.log(`\n── NEXT SCHEDULED ACTION ──`);
    const overdue = rItem.dueAt <= Date.now();
    console.log(overdue
      ? `DUE NOW (${Math.round((Date.now() - rItem.dueAt) / 86400000)}d overdue) → review queue eligible`
      : `scheduled ${new Date(rItem.dueAt).toISOString().slice(0, 10)}`);
  } else {
    console.log(`\nno retrieval item registered (engine will not schedule it yet)`);
  }

  if (linkedErrors.length) {
    console.log(`\n── Linked errors ──`);
    for (const e of linkedErrors) console.log(`  #${e.id} "${e.wrongForm}" → "${e.correctForm}" (${e.category}, ×${e.occurrenceCount}, ${e.status})`);
  }

  console.log(`\n── Evidence ledger (${events.length} events) ──`);
  for (const ev of events) {
    console.log(`  ${new Date(ev.createdAt).toISOString().slice(0, 16)}  ${ev.type.padEnd(14)} ${ev.detail.slice(0, 80)}`);
  }
  if (rHistory.length) {
    console.log(`\n── Review history (latest ${rHistory.length}) ──`);
    for (const r of rHistory) {
      console.log(`  ${new Date(r.createdAt).toISOString().slice(0, 16)}  ${r.mode.padEnd(16)} ${r.correct ? "✓" : "✗"} q=${r.quality}`);
    }
  }
  process.exit(0);
})();
