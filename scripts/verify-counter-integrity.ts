/* ── Step-08 regression: daily progress counts are atomic and consistent ────
 *
 * recordEvent kept TWO copies of the daily counters (userProgress.metrics
 * and dailyMissions.counters) and updated each with a read-modify-write.
 * The in-code assumption "single user, no concurrency" breaks on rapid
 * taps, retries and two open tabs: concurrent events read the same
 * baseline and one increment is silently lost, and a mid-flight failure
 * leaves the two copies divergent with no way to reconcile.
 *
 * Contract after the fix:
 *  - userProgress.metrics is the CANONICAL daily count; increments are
 *    single-statement atomic JSON updates (SQLite json_set/json_extract),
 *    so concurrent events never lose increments;
 *  - dailyMissions.counters is a rebuildable display cache of the same
 *    counts, updated atomically in the same call;
 *  - syncMissionCounters(userId) rebuilds the cache from the canonical
 *    row (recovery/verification path);
 *  - retry semantics: recordEvent counts each CALL once (documented
 *    boundary — de-duplication belongs to the business action that calls
 *    it, e.g. one call per graded submission).
 *
 * Runs on an ISOLATED database; production app.db only opened READ-ONLY.
 *
 * Run: npx tsx scripts/verify-counter-integrity.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "counter-test.db");
process.env.IELTS_DB_PATH = ISO_DB;

const DEFAULT_DB = path.join(ROOT, "data", "app.db");
if (!fs.existsSync(DEFAULT_DB)) {
  console.error("data/app.db not found — run `npm run db:push` first.");
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

async function main() {
  const { db } = await import("../src/db");
  const { users, learningProfiles, userProgress, dailyMissions } = await import("../src/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { recordEvent, getTodayFunnel } = await import("../src/server/services/progress");
  const { todayKey } = await import("../src/lib/text");

  const [u] = await db.insert(users).values({ name: "__counters__" }).returning({ id: users.id });
  const uid = u.id;
  await db.insert(learningProfiles).values({ userId: uid });
  await db.insert(dailyMissions).values({
    userId: uid, date: todayKey(), status: "pending",
    plan: {
      reading: { contentId: 0, title: "-", minutes: 0, status: "skipped" },
      listening: { contentId: 0, title: "-", minutes: 0, status: "skipped" },
      notice: { contentId: 0, chunkIds: [], savedCount: 0, status: "skipped" },
      deep: { chunkIds: [], status: "skipped" },
      retrieval: { itemIds: [], doneCount: 0, status: "skipped" },
      speaking: { prompt: "-", requiredChunkIds: [], rounds: 0, status: "skipped" },
      transfer: { cueCard: "-", part3: [], status: "skipped" },
    } as never,
  });

  /* ── C1 · concurrent different events: nothing lost ── */
  await Promise.all([
    ...Array.from({ length: 5 }, () => recordEvent(uid, "exposure")),
    ...Array.from({ length: 5 }, () => recordEvent(uid, "retrieved")),
    ...Array.from({ length: 5 }, () => recordEvent(uid, "used")),
    ...Array.from({ length: 4 }, () => recordEvent(uid, "understood")),
  ]);
  const funnel1 = await getTodayFunnel(uid);
  check("C1: 19 concurrent events across 4 types — canonical metrics all present",
    funnel1.exposure === 5 && funnel1.retrieved === 5 && funnel1.used === 5 && funnel1.understood === 4,
    JSON.stringify(funnel1));

  /* ── C2 · concurrent same event: increments not swallowed ── */
  await Promise.all(Array.from({ length: 10 }, () => recordEvent(uid, "retrieved")));
  const funnel2 = await getTodayFunnel(uid);
  check("C2: 10 concurrent same-type events — exactly +10 (was 5, now 15)",
    funnel2.retrieved === 15, `retrieved=${funnel2.retrieved}`);

  /* ── C3 · the mission cache copy agrees with the canonical row ── */
  const [mission] = await db.select().from(dailyMissions)
    .where(and(eq(dailyMissions.userId, uid), eq(dailyMissions.date, todayKey()))).limit(1);
  const [progressRow] = await db.select().from(userProgress)
    .where(and(eq(userProgress.userId, uid), eq(userProgress.date, todayKey()))).limit(1);
  check("C3: dailyMissions.counters cache mirrors userProgress.metrics",
    mission != null && progressRow != null &&
      JSON.stringify({ ...mission.counters }) === JSON.stringify({ ...progressRow.metrics }),
    `mission=${JSON.stringify(mission?.counters)} progress=${JSON.stringify(progressRow?.metrics)}`);

  /* ── C4 · retry semantics documented: each call counts once ── */
  await recordEvent(uid, "used");
  await recordEvent(uid, "used");
  const funnel4 = await getTodayFunnel(uid);
  check("C4: two sequential calls count twice (boundary documented)", funnel4.used === 7, `used=${funnel4.used}`);

  /* ── C5 · cross-day isolation: yesterday's row never touched ── */
  const yesterday = todayKey(new Date(Date.now() - 86_400_000));
  await db.insert(userProgress).values({
    userId: uid, date: yesterday, metrics: { exposure: 99, understood: 0, retrieved: 0, used: 0, retained: 0 },
  }).onConflictDoNothing();
  await recordEvent(uid, "exposure", 1);
  const [yRow] = await db.select().from(userProgress)
    .where(and(eq(userProgress.userId, uid), eq(userProgress.date, yesterday))).limit(1);
  const [tRow] = await db.select().from(userProgress)
    .where(and(eq(userProgress.userId, uid), eq(userProgress.date, todayKey()))).limit(1);
  check("C5: yesterday's metrics untouched (exposure stays 99)",
    (yRow?.metrics as Record<string, number>).exposure === 99);
  check("C5: today's metrics got the new event (exposure 6)",
    ((tRow?.metrics as Record<string, number>).exposure) === 6,
    `exposure=${(tRow?.metrics as Record<string, number>).exposure}`);

  /* ── C6 · recovery: syncMissionCounters rebuilds a corrupted cache ── */
  const { syncMissionCounters } = await import("../src/server/services/progress");
  await db.update(dailyMissions)
    .set({ counters: { exposure: 0, understood: 0, retrieved: 0, used: 0, retained: 0 } })
    .where(eq(dailyMissions.id, mission!.id));
  await syncMissionCounters(uid);
  const [repaired] = await db.select().from(dailyMissions).where(eq(dailyMissions.id, mission!.id)).limit(1);
  check("C6: syncMissionCounters rebuilds the cache from canonical metrics",
    JSON.stringify(repaired.counters) === JSON.stringify(tRow?.metrics),
    `cache=${JSON.stringify(repaired.counters)} canonical=${JSON.stringify(tRow?.metrics)}`);

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
