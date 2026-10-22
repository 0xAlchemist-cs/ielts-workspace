/* ── Step-09 regression: one decision owner per daily-mission concern ───────
 *
 * Decision boundary map (as-built, locked by this suite):
 *   Priority Engine  → primarySkill (weakest-link map + diversity rotation
 *                      + plateau/acceleration notes) and overall urgency
 *                      (6 weighted factors → recommendedLength quick/
 *                      standard/deep). Never picks review items (step-03).
 *   Readiness topGap → may OVERRIDE primarySkill when an evidence-backed
 *                      exam gap exists (V12.1 product rule, unchanged) and
 *                      says so in planWhy.
 *   Planner          → time budget + reviewCount + rescue mode (memory
 *                      pressure). Rescue is a DEFAULT for hands-off days.
 *   Mission          → lite resolution (manual override > planner rescue >
 *                      dailyMinutes ≤ 20 > recommendedLength quick) and
 *                      assembly/persistence.
 *   SessionPlan      → presentation only.
 *
 * The red case: an EXPLICIT manual full request was silently overridden by
 * the planner's rescue default — the only place where a default beat an
 * explicit user intent. Fixed: manual override wins over rescue; rescue
 * keeps applying when the caller passes nothing (backward compatible).
 *
 * Runs on an ISOLATED database; production app.db only opened READ-ONLY.
 *
 * Run: npx tsx scripts/verify-decision-boundaries.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "decision-test.db");
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
const DAY = 86_400_000;

async function main() {
  const { db } = await import("../src/db");
  const { users, learningProfiles, reviewHistory, writingAttempts, dailyMissions } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { todayKey } = await import("../src/lib/text");
  const { generateTodayMission } = await import("../src/server/services/mission");
  const { computeMissionDecision } = await import("../src/server/services/priority-engine");
  const { allocateBudget, readMemoryPressure } = await import("../src/server/services/planner");

  const mkUser = async (name: string, minutes: number) => {
    const [u] = await db.insert(users).values({ name }).returning({ id: users.id });
    await db.insert(learningProfiles).values({ userId: u.id, dailyMinutes: minutes });
    return u.id;
  };

  /* ── D1 · explicit manual FULL beats the planner rescue default (red) ── */
  const rescueUser = await mkUser("__dec_rescue__", 45);
  // last study 4 days ago → planner rescue
  await db.insert(reviewHistory).values({
    retrievalItemId: 1, userId: rescueUser, mode: "production",
    prompt: "chunk", expected: "x", userResponse: "x", correct: 1, quality: 5,
    createdAt: Date.now() - 4 * DAY,
  });
  const { pressure } = await readMemoryPressure(rescueUser);
  check("D1: rescue precondition present (days since last study ≥ 3)",
    (pressure.daysSinceLastStudy ?? 0) >= 3, `days=${pressure.daysSinceLastStudy}`);
  const manualFull = await generateTodayMission(rescueUser, false);
  check("D1: explicit manual FULL is not overridden by rescue",
    (manualFull.plan as { lite?: boolean }).lite === false,
    `lite=${(manualFull.plan as { lite?: boolean }).lite}`);

  /* ── D2 · hands-off + rescue still defaults to lite (compat) ── */
  const handsOff = await mkUser("__dec_hands_off__", 45);
  await db.insert(reviewHistory).values({
    retrievalItemId: 1, userId: handsOff, mode: "production",
    prompt: "chunk", expected: "x", userResponse: "x", correct: 1, quality: 5,
    createdAt: Date.now() - 4 * DAY,
  });
  const autoRescue = await generateTodayMission(handsOff);
  check("D2: no manual input + rescue → lite default kept",
    (autoRescue.plan as { lite?: boolean }).lite === true,
    `lite=${(autoRescue.plan as { lite?: boolean }).lite}`);

  /* ── D3 · lite ladder: minutes ≤20 → lite; larger → full (defaults) ── */
  const shortUser = await mkUser("__dec_15min__", 15);
  const m15 = await generateTodayMission(shortUser);
  check("D3: 15-min learner defaults to lite", (m15.plan as { lite?: boolean }).lite === true);
  const midUser = await mkUser("__dec_30min__", 30);
  const m30 = await generateTodayMission(midUser);
  check("D3: 30-min learner defaults to full", (m30.plan as { lite?: boolean }).lite === false);
  const longUser = await mkUser("__dec_45min__", 45);
  const m45 = await generateTodayMission(longUser);
  check("D3: 45-min learner defaults to full", (m45.plan as { lite?: boolean }).lite === false);

  /* ── D4 · budget is the planner's call: minutes map to reviewCount ── */
  for (const [mins, expectAtLeast] of [[15, 3], [30, 10], [45, 20]] as const) {
    const b = allocateBudget(mins, { dueCount: 0, atRiskCount: 0, recentFailures: 0, daysSinceLastStudy: null });
    check(`D4: ${mins}-min budget caps reviewCount sanely (≥${expectAtLeast}, ≤24)`,
      b.reviewCount >= expectAtLeast && b.reviewCount <= 24, `reviewCount=${b.reviewCount}`);
  }
  const heavy = allocateBudget(45, { dueCount: 50, atRiskCount: 15, recentFailures: 10, daysSinceLastStudy: null });
  check("D4: heavy pressure → review-heavy or rescue, larger review budget",
    ["review-heavy", "rescue"].includes(heavy.mode) && heavy.reviewCount >= 20,
    `mode=${heavy.mode} reviewCount=${heavy.reviewCount}`);

  /* ── D5 · no ability evidence → engine stays neutral (locked since 01) ── */
  const fresh = await mkUser("__dec_fresh__", 45);
  const decision = await computeMissionDecision(fresh);
  check("D5: fresh learner — weakness factor neutral (50)",
    decision.factors.find((f) => f.name === "Weakness")?.rawScore === 50);
  check("D5: fresh learner — default primary listening",
    decision.primarySkill === "listening", `got ${decision.primarySkill}`);
  check("D5: decision carries an explainable headline",
    (decision.rationale.headline ?? "").length > 0);

  /* ── D6 · Readiness topGap overrides the engine's skill (V12.1, locked) ── */
  const gapUser = await mkUser("__dec_gap__", 45);
  await db.insert(learningProfiles).values({ userId: gapUser }); // second row ignored
  for (let i = 0; i < 3; i++) {
    await db.insert(writingAttempts).values({
      userId: gapUser, taskType: "task2", prompt: "p", text: "t",
      feedback: { overallEstimate: 5.0, isMock: false }, ieltsScores: { taskResponse: 5.0 },
      usedChunkIds: [],
    });
  }
  const mGap = await generateTodayMission(gapUser);
  const gapPlan = mGap.plan as {
    rationale?: { planWhy?: { en?: string } };
    reading?: { contentId?: number };
    retrieval?: { itemIds?: number[] };
  };
  const gapNote = (gapPlan.rationale?.planWhy?.en ?? "").toLowerCase();
  check("D6: writing gap evidence flips the day toward writing",
    gapNote.includes("writing") || gapNote.includes("差距") || gapNote.includes("gap"),
    `why="${gapPlan.rationale?.planWhy?.en ?? ""}"`);

  /* ── D7 · mission assembly: one row, reviewCount-capped batch ── */
  const rows = await db.select().from(dailyMissions).where(eq(dailyMissions.userId, gapUser));
  check("D7: exactly one mission per user-day", rows.length === 1 && rows[0].date === todayKey());

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
