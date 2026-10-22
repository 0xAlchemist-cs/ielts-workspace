/* ── Step-07 regression: verified metrics vs proxy estimates ────────────────
 *
 * Old metric semantics (all PROXY, all presented as facts):
 *   transfer_rate = share of chunks with retrievalStrength >= 50
 *                  (strength is a state+hits composite — high strength is
 *                  NOT cross-context success)
 *   retention     = share of chunks with retrievalStrength >= 60
 *                  (same proxy; a chunk reaching the retention STATE has
 *                  never been verified across a real interval)
 *   estimateIeltsReadiness maps 0-100 scores linearly to a 4-8 band and
 *                  takeDailySnapshot averaged it into estimatedIelts even
 *                  with ZERO real production samples — a mock-only day
 *                  rendered a number that reads like a calibrated band.
 *
 * New contract:
 *   transfer is VERIFIED only by a cross-context production event
 *   (chunkEvents: speaking_use / ielts_use — written when a chunk is
 *   actually produced in speech/writing);
 *   retention is VERIFIED only by a successful retention check across a
 *   real interval (reviewHistory: mode=retention_check, correct);
 *   no verified evidence → score null ("developing"), never 0-as-failure
 *   and never a proxy value dressed as fact; estimatedIelts requires at
 *   least one real graded production sample and stays explicitly an
 *   estimate; historical snapshots are never rewritten.
 *
 * Runs on an ISOLATED database; production app.db only opened READ-ONLY.
 *
 * Run: npx tsx scripts/verify-metric-semantics.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "metric-semantics-test.db");
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
  const { users, learningProfiles, chunks, chunkEvents, retrievalItems, reviewHistory, speakingAttempts, writingAttempts, learningSnapshots } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { todayKey } = await import("../src/lib/text");
  const { computeFullProfile } = await import("../src/server/services/learning-profile");
  const { takeDailySnapshot } = await import("../src/server/services/trajectory");

  const mkChunkItem = async (userId: number, text: string, strength: number, state: string) => {
    const [c] = await db.insert(chunks).values({
      userId, text, meaningEn: `en:${text}`, meaningZh: `zh:${text}`, pattern: "p",
      examples: [`Example ${text}.`], retrievalStrength: strength,
    }).returning({ id: chunks.id });
    const [it] = await db.insert(retrievalItems).values({
      userId, itemType: "chunk", itemId: c.id, dueAt: Date.now(),
      learningState: {
        state: state as never, achievedAt: {}, contexts: [],
        productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
      },
    }).returning({ id: retrievalItems.id });
    return { chunkId: c.id, itemId: it.id };
  };

  /* ── M1 · high strength, ZERO cross-context events → transfer null ── */
  const [u1] = await db.insert(users).values({ name: "__metrics_proxy__" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u1.id });
  await mkChunkItem(u1.id, "strong but untransferred", 85, "retention");
  await mkChunkItem(u1.id, "also strong, no events", 70, "usage");
  const p1 = await computeFullProfile(u1.id);
  const t1 = p1.overall.find((d) => d.key === "transfer_rate");
  check("M1: no cross-context success events → transfer_rate null (not 100)",
    t1?.score == null, `score=${t1?.score}`);
  const r1 = p1.overall.find((d) => d.key === "retention");
  check("M1: no successful retention check → retention null (not 100)",
    r1?.score == null, `score=${r1?.score}`);

  /* ── M2 · verified transfer & retention via REAL evidence ── */
  const [u2] = await db.insert(users).values({ name: "__metrics_verified__" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u2.id });
  const cA = await mkChunkItem(u2.id, "transferred one", 80, "usage");
  const cB = await mkChunkItem(u2.id, "verified retained", 90, "retention");
  const cC = await mkChunkItem(u2.id, "plain third", 40, "exposure");
  // cross-context production event for cA (speaking context)
  await db.insert(chunkEvents).values({ userId: u2.id, chunkId: cA.chunkId, type: "speaking_use", detail: "used in speaking" });
  // successful retention check across an interval for cB's retrieval item
  await db.insert(reviewHistory).values({
    retrievalItemId: cB.itemId, userId: u2.id, mode: "retention_check",
    prompt: "chunk", expected: "verified retained", userResponse: "verified retained",
    correct: 1, quality: 5, createdAt: Date.now() - 30 * 86_400_000,
  });
  const p2 = await computeFullProfile(u2.id);
  const t2 = p2.overall.find((d) => d.key === "transfer_rate");
  check("M2: verified transfer counts only event-backed chunks (1/3 → 33)",
    t2?.score === 33, `score=${t2?.score}`);
  const r2 = p2.overall.find((d) => d.key === "retention");
  check("M2: verified retention counts only check-backed chunks (1/3 → 33)",
    r2?.score === 33, `score=${r2?.score}`);
  check("M2: evidence text names the verification basis",
    (t2?.evidence ?? "").includes("speaking_use") || (t2?.evidence ?? "").includes("ielts_use") || (t2?.evidence ?? "").includes("context"),
    t2?.evidence ?? "");

  /* ── M3 · mock-only day → estimatedIelts null, not a fake band ── */
  const [u3] = await db.insert(users).values({ name: "__metrics_mock__" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u3.id });
  await db.insert(speakingAttempts).values({
    userId: u3.id, prompt: "p", transcript: "t",
    feedback: { overallEstimate: 6.5, isMock: true }, ieltsScores: { fluency: 6.5 },
    usedChunkIds: [], round: 1,
  });
  await db.insert(writingAttempts).values({
    userId: u3.id, taskType: "task2", prompt: "p", text: "t",
    feedback: { overallEstimate: 6.0, isMock: true }, ieltsScores: { lexical: 6.0 },
    usedChunkIds: [],
  });
  const s3 = await takeDailySnapshot(u3.id);
  check("M3: mock-only production samples → snapshot.estimatedIelts null",
    s3.estimatedIelts == null, `got ${s3.estimatedIelts}`);

  /* ── M4 · one real graded sample → estimate present ── */
  const [u4] = await db.insert(users).values({ name: "__metrics_real__" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u4.id });
  await db.insert(speakingAttempts).values({
    userId: u4.id, prompt: "p", transcript: "t",
    feedback: { overallEstimate: 7.0, isMock: false }, ieltsScores: { fluency: 7.0 },
    usedChunkIds: [], round: 1,
  });
  const s4 = await takeDailySnapshot(u4.id);
  check("M4: a real graded sample yields an estimate (explicitly an estimate)",
    typeof s4.estimatedIelts === "number" && s4.estimatedIelts > 0, `got ${s4.estimatedIelts}`);

  /* ── M5 · historical snapshots are never rewritten ── */
  const oldDate = "2020-01-0";
  for (const day of [1, 2]) {
    await db.insert(learningSnapshots).values({
      userId: u4.id, date: `${oldDate}${day}`,
      snapshot: { date: `${oldDate}${day}`, overall: 50, reading: 50, listening: 50, speaking: 50, writing: 50, retrievalAccuracy: 50, transferRate: 50, activeChunks: 1, activeVocab: 1, recurringErrors: 0, studyMinutes: 0, meaningfulEvents: 0, estimatedIelts: 6.25, bottleneck: "legacy" } as never,
    });
  }
  await takeDailySnapshot(u4.id);
  const olds = await db.select().from(learningSnapshots).where(eq(learningSnapshots.userId, u4.id));
  const untouched = olds.filter((o) => o.date.startsWith("2020-01"));
  check("M5: pre-existing snapshot rows untouched (values preserved)",
    untouched.length === 2 && untouched.every((o) => (o.snapshot as { estimatedIelts: number }).estimatedIelts === 6.25));
  check("M5: today's row is separate from historical rows",
    olds.some((o) => o.date === todayKey()), `dates=${olds.map((o) => o.date).join(",")}`);

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
