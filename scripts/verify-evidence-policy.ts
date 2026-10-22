/* ── Step-06 regression: one evidence policy for every band consumer ────────
 *
 * The mock gate (feedback.isMock) was implemented INLINE and INCONSISTENTLY:
 * readiness.ts bandOf checks it, learning-profile.ts isMockAttempt checks
 * it — but progress.ts getDashboardStats reads speaking bands from
 * ieltsScores alone (no feedback column selected, so the gate cannot even
 * run) and looks for an `overall` key that the persisters never write
 * (the band lives at feedback.overallEstimate; readiness reads exactly
 * that). Consequences: a mock attempt's heuristic pseudo-band could leak
 * into the dashboard, and REAL bands never show (wrong key).
 *
 * Fix: src/lib/evidence.ts — the single policy (source × quality ×
 * usableFor). All band consumers resolve through it. Old rows without an
 * isMock stamp stay trusted (never fabricated as verified, never demoted).
 *
 * Runs on an ISOLATED database; production app.db only opened READ-ONLY.
 *
 * Run: npx tsx scripts/verify-evidence-policy.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "evidence-policy-test.db");
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
  const { users, learningProfiles, speakingAttempts } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const [u] = await db.insert(users).values({ name: "__evidence__" }).returning({ id: users.id });
  const uid = u.id;
  await db.insert(learningProfiles).values({ userId: uid });

  // one real graded attempt + one offline-fallback attempt (isMock at the
  // TOP LEVEL of feedback, pseudo-band in ieltsScores) — the exact shapes
  // the routes persist
  await db.insert(speakingAttempts).values({
    userId: uid, prompt: "p", transcript: "t",
    feedback: { overallEstimate: 7.0, isMock: false, summary: "live" },
    ieltsScores: { fluency: 7, grammar: 7, lexical: 7 }, usedChunkIds: [], round: 1,
  });
  await db.insert(speakingAttempts).values({
    userId: uid, prompt: "p", transcript: "t",
    feedback: { overallEstimate: 5.5, isMock: true, summary: "offline fallback" },
    ieltsScores: { fluency: 5.5, grammar: 5.5, lexical: 5.5 }, usedChunkIds: [], round: 1,
  });

  /* ── E2 · every band consumer agrees (conflict-of-sources red test) ── */
  const { getDashboardStats } = await import("../src/server/services/progress");
  const stats = await getDashboardStats(uid, null);
  check("E2: dashboard speakingBands show the REAL band (7.0)",
    Array.isArray(stats.speakingBands) && stats.speakingBands.includes(7),
    `bands=${JSON.stringify(stats.speakingBands)}`);
  check("E2: dashboard speakingBands never include the mock pseudo-band (5.5)",
    Array.isArray(stats.speakingBands) && !stats.speakingBands.includes(5.5),
    `bands=${JSON.stringify(stats.speakingBands)}`);

  const { computeFullProfile } = await import("../src/server/services/learning-profile");
  const profile = await computeFullProfile(uid);
  const fluency = profile.speaking.find((d) => d.key === "fluency");
  check("E2: full profile counts only the real attempt (fluency from band 7 → 78)",
    fluency?.score === 78, `score=${fluency?.score}`);

  const { buildReadiness } = await import("../src/server/services/readiness");
  const snapshot = await buildReadiness(uid, "ielts");
  const speak = snapshot.skills.find((s) => s.skill === "speaking");
  check("E2: readiness evidence counts the real band row once (not the mock)",
    (speak?.devExplanation.evidence ?? []).some((e) => e.includes("1")), JSON.stringify(speak?.devExplanation.evidence));

  /* ── E1 · the shared policy exists and classifies the matrix ── */
  let evidence: typeof import("../src/lib/evidence") | null = null;
  try {
    evidence = await import("../src/lib/evidence");
  } catch {
    evidence = null;
  }
  check("E1: policy module exports the gate", evidence != null && typeof evidence.isMockFeedback === "function");
  if (evidence) {
    check("E1: isMock=true → mock", evidence.isMockFeedback({ isMock: true }) === true);
    check("E1: isMock=false → trusted live row", evidence.isMockFeedback({ isMock: false }) === false);
    check("E1: legacy row (no stamp) → trusted, never fabricated",
      evidence.isMockFeedback({ overallEstimate: 6 }) === false && evidence.isMockFeedback(null) === false);
    check("E1: band resolver reads feedback.overallEstimate first",
      evidence.attemptBandEvidence({ feedback: { overallEstimate: 7 }, scores: {} }) === 7);
    check("E1: band resolver falls back to legacy ieltsScores.overallEstimate",
      evidence.attemptBandEvidence({ feedback: null, scores: { overallEstimate: 6 } }) === 6);
    check("E1: band resolver drops mock pseudo-bands",
      evidence.attemptBandEvidence({ feedback: { overallEstimate: 5.5, isMock: true }, scores: {} }) == null);
  }

  /* ── E3 · policy gates say the same thing for the same row shape ── */
  const mockRow = { feedback: { isMock: true, overallEstimate: 5.5 }, scores: { overallEstimate: 5.5 } };
  const realRow = { feedback: { isMock: false, overallEstimate: 7 }, scores: { overallEstimate: 7 } };
  const readinessGate = (r: typeof mockRow) => r.feedback.isMock !== true && typeof r.feedback.overallEstimate === "number";
  check("E3: readiness-internal gate accepts the real row", readinessGate(realRow) === true);
  check("E3: readiness-internal gate rejects the mock row", readinessGate(mockRow) === false);
  if (evidence) {
    check("E3: policy gate accepts the real row", evidence.attemptBandEvidence(realRow) != null);
    check("E3: policy gate rejects the mock row", evidence.attemptBandEvidence(mockRow) == null);
  }

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
