/* ── Step-01 regression: Mock scores must NOT become ability evidence ────────
 * Service-level red/green test for the Mock → Full Profile → Priority →
 * Trajectory bypass.
 *
 * Reproduces the real failure path: live AI unavailable → FallbackProvider
 * (mockProvider) returns isMock:true with heuristic pseudo-bands → the
 * writing/speaking routes persist `feedback` (carrying isMock at its TOP
 * LEVEL) plus `ieltsScores` (sub-scores) → those bands must never enter
 * computeFullProfile / computeMissionDecision / takeDailySnapshot.
 *
 * Runs on an ISOLATED database (data/test-fixtures/mock-bypass-test.db):
 * the production app.db is only ever opened READ-ONLY (schema DDL copy).
 * Every src/ import is dynamic and happens AFTER process.env.IELTS_DB_PATH
 * is set — never add a static import of ../src here, it would eagerly open
 * the default DB.
 *
 * Run: npx tsx scripts/verify-mock-bypass.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "mock-bypass-test.db");
process.env.IELTS_DB_PATH = ISO_DB;

// Fresh isolated DB: recreate the canonical schema by copying the DDL from the
// default database (opened READ-ONLY — its bytes never change), the same
// approach make-template-db.mjs uses. No subprocess, no writes to data/app.db.
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
const bandTo100 = (band: number) => Math.round((band / 9) * 100);

async function main() {
  const { db } = await import("../src/db");
  const { users, speakingAttempts, writingAttempts } = await import("../src/db/schema");
  const { computeFullProfile } = await import("../src/server/services/learning-profile");
  const { computeMissionDecision } = await import("../src/server/services/priority-engine");
  const { takeDailySnapshot } = await import("../src/server/services/trajectory");
  const { mockProvider } = await import("../src/lib/ai/providers/mock");

  const mkUser = async (name: string) => {
    const [u] = await db.insert(users).values({ name }).returning({ id: users.id });
    return u.id;
  };
  // Persist exactly like /api/ai/writing|speaking do: feedback stays in the
  // feedback column (isMock at top level), sub-scores in ieltsScores.
  const saveWrite = async (userId: number, feedback: object, scores: object) => {
    await db.insert(writingAttempts).values({
      userId, taskType: "task2", prompt: "Some IELTS Task 2 prompt",
      text: "essay body", feedback, ieltsScores: scores, usedChunkIds: [],
    });
  };
  const saveSpeak = async (userId: number, feedback: object, scores: object) => {
    await db.insert(speakingAttempts).values({
      userId, prompt: "Describe a place", transcript: "I want to describe...",
      feedback, ieltsScores: scores, usedChunkIds: [], round: 1,
    });
  };

  const realSpeak = { fluency: 7.0, grammar: 7.0, lexical: 7.0 };
  const realSpeak2 = { fluency: 6.0, grammar: 6.0, lexical: 6.0 };
  const realWrite = { taskResponse: 6.0, coherence: 6.0, lexical: 7.0, grammar: 6.0 };
  const realWrite2 = { taskResponse: 7.0, coherence: 6.0, lexical: 7.0, grammar: 5.0 };

  /* ── Scenario A: live AI down → FallbackProvider(isMock:true) only ────── */
  const ua = await mkUser("__mock_bypass_a__");
  const mockWriteFb = await mockProvider.writing({
    prompt: "Some IELTS Task 2 prompt", text: "My essay is very like interesting and I want discuss about environment.", targetChunks: [],
  });
  const mockSpeakFb = await mockProvider.speaking({
    prompt: "Describe a place", transcript: "I very like this city because the people is friendly.",
    targetChunks: [], recentErrors: [],
  });
  check("A: mock write feedback carries isMock=true (fallback shape)", mockWriteFb.isMock === true);
  check("A: mock speak feedback carries isMock=true (fallback shape)", mockSpeakFb.isMock === true);
  check("A: mock write heuristic bands exist in ieltsScores (the bypass payload)",
    typeof mockWriteFb.ielts.taskResponse === "number");
  await saveWrite(ua, mockWriteFb as unknown as object, mockWriteFb.ielts);
  await saveSpeak(ua, mockSpeakFb as unknown as object, mockSpeakFb.ielts);

  const profA = await computeFullProfile(ua);
  // `production` is chunk-activation based (not AI-banded) — 0 with no chunks
  // is the honest no-output fact, not a mock bypass, so it is exempted.
  const aiScored = (d: { key: string }) => d.key !== "production";
  const speakNums = profA.speaking.filter((d) => typeof d.score === "number" && aiScored(d));
  const writeNums = profA.writing.filter((d) => typeof d.score === "number");
  check("A: speaking dims are null (no verified evidence), got numbers from mock",
    speakNums.length === 0, `${speakNums.map((d) => `${d.key}=${d.score}`).join(", ")}`);
  check("A: writing dims are null (no verified evidence), got numbers from mock",
    writeNums.length === 0, `${writeNums.map((d) => `${d.key}=${d.score}`).join(", ")}`);
  check("A: weakestLink.score is null (building), not a mock band", profA.weakestLink.score === null,
    `got ${profA.weakestLink.skill}/${profA.weakestLink.subSkill}=${profA.weakestLink.score}`);
  const readPara = profA.reading.find((d) => d.key === "paraphrasing");
  check("A: reading.paraphrasing is null (only writing evidence is mock)", readPara?.score == null,
    `got ${readPara?.score}`);

  const decA = await computeMissionDecision(ua);
  const weaknessA = decA.factors.find((f) => f.name === "Weakness")!;
  check("A: mission Weakness factor stays neutral (50) without verified evidence",
    weaknessA.rawScore === 50, `got ${weaknessA.rawScore}`);
  check("A: primarySkill not driven by mock bands (default listening)",
    decA.primarySkill === "listening", `got ${decA.primarySkill}`);

  const snapA = await takeDailySnapshot(ua);
  check("A: trajectory snapshot.speaking is the no-evidence baseline (0), not a mock conversion",
    snapA.speaking === 0, `got ${snapA.speaking}`);
  check("A: trajectory snapshot.writing is the no-evidence baseline (0), not a mock conversion",
    snapA.writing === 0, `got ${snapA.writing}`);

  /* ── Scenario B: real + mock mixed → only real samples count ──────────── */
  const ub = await mkUser("__mock_bypass_b__");
  // insert real first (older), mock last (newest) — newest-mock must not win
  await saveSpeak(ub, { summary: "live graded", isMock: false }, realSpeak);
  await saveSpeak(ub, { summary: "live graded 2", isMock: false }, realSpeak2);
  await saveWrite(ub, { summary: "live graded", isMock: false }, realWrite);
  await saveWrite(ub, { summary: "live graded 2", isMock: false }, realWrite2);
  await saveSpeak(ub, mockSpeakFb as unknown as object, mockSpeakFb.ielts);
  await saveSpeak(ub, mockSpeakFb as unknown as object, mockSpeakFb.ielts);
  await saveWrite(ub, mockWriteFb as unknown as object, mockWriteFb.ielts);

  const profB = await computeFullProfile(ub);
  const byKey = (dims: typeof profB.speaking, k: string) => dims.find((d) => d.key === k)?.score;
  check("B: speaking.fluency averages REAL attempts only (6.5 → 72)",
    byKey(profB.speaking, "fluency") === bandTo100(6.5), `got ${byKey(profB.speaking, "fluency")}`);
  check("B: speaking.vocabulary averages REAL lexical only (6.5 → 72)",
    byKey(profB.speaking, "vocabulary") === bandTo100(6.5), `got ${byKey(profB.speaking, "vocabulary")}`);
  check("B: writing.taskResponse averages REAL attempts only (6.5 → 72)",
    byKey(profB.writing, "task_response") === bandTo100(6.5), `got ${byKey(profB.writing, "task_response")}`);
  check("B: writing.lexical averages REAL attempts only (7.0 → 78)",
    byKey(profB.writing, "lexical") === bandTo100(7.0), `got ${byKey(profB.writing, "lexical")}`);
  check("B: reading.paraphrasing uses newest REAL writing (7.0 → 78), newest is mock",
    byKey(profB.reading, "paraphrasing") === bandTo100(7.0), `got ${byKey(profB.reading, "paraphrasing")}`);

  const snapB = await takeDailySnapshot(ub);
  // snapshot.speaking = avg of numeric speaking dims. Real-only dims:
  // fluency 72, grammar 72, vocabulary 72, naturalness 65, production 0 (no chunks)
  const expectB = Math.round((72 + 72 + 72 + 65 + 0) / 5);
  check("B: trajectory speaking score derived from REAL bands only",
    snapB.speaking === expectB, `got ${snapB.speaking}, want ${expectB}`);

  /* ── Scenario C: zero evidence → null/building, no fabricated 0 or 100 ── */
  const uc = await mkUser("__mock_bypass_c__");
  const profC = await computeFullProfile(uc);
  check("C: speaking dims null with no attempts",
    profC.speaking.every((d) => typeof d.score !== "number" || d.key === "production"));
  check("C: writing dims null with no attempts",
    profC.writing.every((d) => typeof d.score !== "number"));
  check("C: weakestLink building (null score)", profC.weakestLink.score === null);
  const decC = await computeMissionDecision(uc);
  const weaknessC = decC.factors.find((f) => f.name === "Weakness")!;
  check("C: Weakness neutral 50 with zero evidence", weaknessC.rawScore === 50, `got ${weaknessC.rawScore}`);

  /* ── Scenario D: legacy mock rows (old shape) must not count either ───── */
  const ud = await mkUser("__mock_bypass_d__");
  await saveSpeak(ud, { overallEstimate: 5.5, isMock: true },
    { fluency: 5.0, grammar: 5.0, lexical: 5.0, overallEstimate: 5.5 });
  await saveWrite(ud, { overallEstimate: 5.0, isMock: true },
    { taskResponse: 5.0, coherence: 5.0, lexical: 5.0, grammar: 5.0, overallEstimate: 5.0 });
  const profD = await computeFullProfile(ud);
  check("D: legacy mock speaking row excluded from dims",
    profD.speaking.filter((d) => typeof d.score === "number" && d.key !== "production").length === 0);
  check("D: legacy mock writing row excluded from dims",
    profD.writing.filter((d) => typeof d.score === "number").length === 0);

  /* ── Mock attempts are practice history: nothing may be deleted ───────── */
  const { eq } = await import("drizzle-orm");
  const speakA = await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, ua));
  const writeB = await db.select().from(writingAttempts).where(eq(writingAttempts.userId, ub));
  check("A: mock speaking attempt preserved as practice record", speakA.length === 1);
  check("B: all 3 writing attempts preserved (2 real + 1 mock)", writeB.length === 3);

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
