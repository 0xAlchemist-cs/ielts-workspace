/* ── Step-03 regression: Today/Mission review batch must be a prefix of the
 * canonical review queue ────────────────────────────────────────────────────
 *
 * The mission used to prefer decision.retrievalItemIds — the Priority
 * Engine's OWN secondary selection: a due-items query with NO orderBy
 * capped by limit(20) (so which 20 due items it even sees is arbitrary),
 * re-sorted by a weak two-key rule (overdue flag, error flag) and sliced.
 * That second path diverges from the canonical generateReviewQueue
 * (multi-factor priority, retention-check takeover, orphan filtering) in
 * both membership and order, misses pure retention-check items whose SM-2
 * dueAt is in the future, and can carry orphaned items whose source rows
 * are gone.
 *
 * Contract after the fix: Priority Engine keeps skill/urgency/length;
 * WHICH items, in WHICH order, in WHICH format is decided solely by
 * generateReviewQueue. The mission batch = canonical queue prefix, capped
 * by the planner's budget.reviewCount and the lite limit.
 *
 * Runs on an ISOLATED database; the production app.db is only opened
 * READ-ONLY for schema DDL. All src imports are dynamic, after
 * IELTS_DB_PATH is set.
 *
 * Run: npx tsx scripts/verify-canonical-queue.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "canonical-queue-test.db");
process.env.IELTS_DB_PATH = ISO_DB;

const DEFAULT_DB = path.join(ROOT, "data", "app.db");
if (!fs.existsSync(DEFAULT_DB)) {
  console.error("data/app.db not found — run `npm run db:push` first (CI does this before verify:all).");
  process.exit(1);
}
for (const p of [ISO_DB, `${ISO_DB}-wal`, `${ISO_DB}-shm`]) {
  if (fs.existsSync(p)) fs.rmSync(p);
}
const schemaSource = new Database(DEFAULT_DB, { readonly: true });
try {
  const ddl = schemaSource
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL " +
      "AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { sql: string }[];
  const iso = new Database(ISO_DB);
  try {
    iso.pragma("foreign_keys = OFF");
    for (const { sql } of ddl) iso.prepare(sql).run();
  } finally {
    iso.close();
  }
} finally {
  schemaSource.close();
}

let pass = 0;
let fail = 0;
const findings: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    findings.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const DAY = 86_400_000;

async function main() {
  const { db } = await import("../src/db");
  const { users, learningProfiles, chunks, errors, retrievalItems } = await import("../src/db/schema");
  const { and, eq, inArray } = await import("drizzle-orm");
  const { generateReviewQueue } = await import("../src/server/services/retention");
  const { computeMissionDecision } = await import("../src/server/services/priority-engine");
  const { generateTodayMission } = await import("../src/server/services/mission");

  const [u] = await db.insert(users).values({ name: "__canonical_queue__" }).returning({ id: users.id });
  const uid = u.id;
  await db.insert(learningProfiles).values({ userId: uid, dailyMinutes: 45 });

  const mkChunk = async (text: string) => {
    const [c] = await db.insert(chunks).values({
      userId: uid, text, meaningEn: `en:${text}`, meaningZh: `zh:${text}`,
      pattern: "pattern", examples: [`Example with ${text}.`],
    }).returning({ id: chunks.id });
    return c.id;
  };
  const mkChunkItem = async (opts: {
    text?: string; itemId?: number; dueOffsetDays: number; successes?: number; fails?: number;
    retention?: number; state?: string; lastCheckDaysAgo?: number; interval?: number;
  }) => {
    const itemId = opts.itemId ?? (await mkChunk(`chunk ${Math.random().toString(36).slice(2, 8)}`));
    const [it] = await db.insert(retrievalItems).values({
      userId: uid, itemType: "chunk", itemId,
      dueAt: Date.now() + opts.dueOffsetDays * DAY,
      successCount: opts.successes ?? 0, failCount: opts.fails ?? 0,
      retentionScore: opts.retention ?? 0,
      learningState: {
        state: (opts.state ?? "exposure") as never, achievedAt: {}, contexts: [],
        productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
      },
      ...(opts.lastCheckDaysAgo !== undefined
        ? { lastRetentionCheckAt: Date.now() - opts.lastCheckDaysAgo * DAY, retentionCheckInterval: opts.interval ?? 7 }
        : {}),
    }).returning({ id: retrievalItems.id });
    return it.id;
  };

  /* ── Seed 38 items. INSERTION ORDER MATTERS for the red run: the old
   * due-items query has no orderBy, so its limit(20) takes the first 20
   * rows by rowid — orphans + low-priority filler first, so the urgent
   * batch (inserted later) is invisible to the old second path. */
  // 2 orphans (retrieval item whose source chunk row does not exist)
  const orphanIds = [
    await mkChunkItem({ itemId: 900001, dueOffsetDays: -3, fails: 2 }),
    await mkChunkItem({ itemId: 900002, dueOffsetDays: -2, fails: 1 }),
  ];
  // 18 low-priority filler: overdue 1d, clean record, high retention score
  const lowIds: number[] = [];
  for (let i = 0; i < 18; i++) {
    lowIds.push(await mkChunkItem({ dueOffsetDays: -1, successes: 3, retention: 80, state: "retention" }));
  }
  // 6 urgent items: overdue 5d, 100% fail rate, zero retention (inserted LAST)
  const urgentIds: number[] = [];
  for (let i = 0; i < 6; i++) {
    urgentIds.push(await mkChunkItem({ dueOffsetDays: -5, fails: 4, retention: 0, state: "usage" }));
  }
  // 2 error-revenge items with real source rows
  const errIds: number[] = [];
  for (const w of ["interested on", "discuss about"]) {
    const [e] = await db.insert(errors).values({
      userId: uid, category: "preposition", wrongForm: w,
      correctForm: w === "interested on" ? "interested in" : "discuss",
      explanation: "fixed collocation", source: "manual", sourceModule: "review",
      occurrenceCount: 2, failedCount: 1,
    }).returning({ id: errors.id });
    const [it] = await db.insert(retrievalItems).values({
      userId: uid, itemType: "error", itemId: e.id,
      dueAt: Date.now() - 2 * DAY, failCount: 1, successCount: 0,
      learningState: {
        state: "exposure" as never, achievedAt: {}, contexts: [],
        productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
      },
    }).returning({ id: retrievalItems.id });
    errIds.push(it.id);
  }
  // 2 almost-due (within 24h), 2 pure retention-check (SM-2 not due), 4 not due
  const almostIds = [
    await mkChunkItem({ dueOffsetDays: 0.5, successes: 1 }),
    await mkChunkItem({ dueOffsetDays: 0.8, successes: 1 }),
  ];
  const retentionIds = [
    await mkChunkItem({ dueOffsetDays: 5, successes: 5, retention: 90, state: "retention", lastCheckDaysAgo: 10, interval: 7 }),
    await mkChunkItem({ dueOffsetDays: 6, successes: 5, retention: 90, state: "retention", lastCheckDaysAgo: 12, interval: 7 }),
  ];
  for (let i = 0; i < 4; i++) {
    await mkChunkItem({ dueOffsetDays: 5 + i, successes: 1, state: "exposure" });
  }

  /* ── C1 · canonical queue quality (protective: holds before AND after) ── */
  const queue = await generateReviewQueue(uid, 40);
  const qIds = queue.map((q) => q.retrievalItemId);
  check("C1: canonical queue has no duplicate ids", new Set(qIds).size === qIds.length, `${qIds.length} entries`);
  check("C1: not-due items (no retention flag) never appear",
    queue.every((q) => !q.reasons.includes("not_due")), `entries=${qIds.length}`);
  const notDueLeak = queue.filter((q) => q.retrievalItemId !== undefined &&
    !orphanIds.includes(q.retrievalItemId) && !lowIds.includes(q.retrievalItemId) &&
    !urgentIds.includes(q.retrievalItemId) && !errIds.includes(q.retrievalItemId) &&
    !almostIds.includes(q.retrievalItemId) && !retentionIds.includes(q.retrievalItemId));
  check("C1: queue only contains seeded reviewable items", notDueLeak.length === 0, `leaks=${notDueLeak.length}`);
  check("C1: orphaned items (source rows gone) are filtered out",
    !qIds.some((id) => orphanIds.includes(id)));
  check("C1: pure retention-check items surface as retention_check",
    queue.filter((q) => retentionIds.includes(q.retrievalItemId)).every((q) => q.mode === "retention_check"),
    queue.filter((q) => retentionIds.includes(q.retrievalItemId)).map((q) => q.mode).join(","));
  const first6 = new Set(qIds.slice(0, 6));
  check("C1: the truly most urgent items occupy the top of the queue",
    first6.size === 6 && urgentIds.every((id) => first6.has(id)),
    `top6=${[...first6].join(",")}`);

  /* ── C2 · mission review batch = canonical prefix (THE fix) ── */
  const mission = await generateTodayMission(uid);
  const plan = mission.plan as { lite: boolean; retrieval: { itemIds: number[] } };
  const missionIds = plan.retrieval.itemIds;
  const canonical = await generateReviewQueue(uid, 40);
  const expected = canonical.slice(0, Math.max(missionIds.length, 1)).map((q) => q.retrievalItemId);
  check("C2: mission retrieval batch is a positional prefix of the canonical queue",
    missionIds.length > 0 && missionIds.every((id, i) => id === expected[i]),
    `mission=[${missionIds.slice(0, 6).join(",")}…] canonical=[${expected.slice(0, 6).join(",")}…]`);
  check("C2: mission batch has no duplicate ids", new Set(missionIds).size === missionIds.length);
  check("C2: orphans never reach the mission batch",
    !missionIds.some((id) => orphanIds.includes(id)));
  check("C2: not-due items never reach the mission batch",
    !missionIds.some((id) => !orphanIds.includes(id) && !lowIds.includes(id) && !urgentIds.includes(id) &&
      !errIds.includes(id) && !almostIds.includes(id) && !retentionIds.includes(id)));
  check("C2: urgent items lead the mission batch (not arbitrary filler)",
    new Set(missionIds.slice(0, 6)).size === 6 && urgentIds.every((id) => missionIds.slice(0, 6).includes(id)),
    `first6=${missionIds.slice(0, 6).join(",")}`);

  /* ── C3 · lite mission: same source, capped at the lite limit ── */
  const [u2] = await db.insert(users).values({ name: "__canonical_lite__" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u2.id, dailyMinutes: 45 });
  for (let i = 0; i < 10; i++) {
    const [cRow] = await db.insert(chunks).values({
      userId: u2.id, text: `lite chunk ${i}`, meaningEn: "en", meaningZh: "zh", pattern: "p", examples: ["e"],
    }).returning({ id: chunks.id });
    await db.insert(retrievalItems).values({
      userId: u2.id, itemType: "chunk", itemId: cRow.id, dueAt: Date.now() - DAY,
      successCount: 0, failCount: 3, retentionScore: 0,
      learningState: {
        state: "exposure" as never, achievedAt: {}, contexts: [],
        productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
      },
    });
  }
  const liteMission = await generateTodayMission(u2.id, true);
  const litePlan = liteMission.plan as { lite: boolean; retrieval: { itemIds: number[] } };
  const liteCanonical = await generateReviewQueue(u2.id, 40);
  check("C3: lite mission marked lite", litePlan.lite === true);
  check("C3: lite batch capped at the lite limit (≤6)",
    litePlan.retrieval.itemIds.length <= 6, `n=${litePlan.retrieval.itemIds.length}`);
  check("C3: lite batch is still a canonical prefix",
    litePlan.retrieval.itemIds.every((id, i) => id === liteCanonical[i]?.retrievalItemId),
    `lite=[${litePlan.retrieval.itemIds.join(",")}] canon=[${liteCanonical.slice(0, 6).map((q) => q.retrievalItemId).join(",")}]`);

  /* ── C4 · decision id lists are canonical-derived (no second path) ── */
  const decision = await computeMissionDecision(uid);
  const canonIds = new Set(canonical.map((q) => q.retrievalItemId));
  check("C4: decision.retrievalItemIds all come from the canonical queue",
    decision.retrievalItemIds.every((id) => canonIds.has(id)),
    `foreign=${decision.retrievalItemIds.filter((id) => !canonIds.has(id)).join(",")}`);
  check("C4: decision.retrievalItemIds is a canonical prefix",
    decision.retrievalItemIds.every((id, i) => id === canonical[i]?.retrievalItemId),
    `decision=[${decision.retrievalItemIds.slice(0, 5).join(",")}]`);
  const decisionChunks = await db.select({ id: chunks.id }).from(chunks)
    .where(and(eq(chunks.userId, uid), inArray(chunks.id, decision.targetChunkIds)));
  check("C4: decision.targetChunkIds reference real chunk rows (no orphans)",
    decision.targetChunkIds.every((id) => decisionChunks.some((c) => c.id === id)),
    `targets=${decision.targetChunkIds.join(",")}`);

  /* ── C5 · one mission per day: regeneration is idempotent ── */
  const again = await generateTodayMission(uid);
  check("C5: regenerating today's mission does not duplicate it",
    again.id === mission.id, `${mission.id} vs ${again.id}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nFAILURES:");
    for (const f of findings) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
