/* ── Test-isolation contract (step-13 follow-up) ─────────────────────────────
 * Automated gates must NEVER write the production database.
 *
 * Contract:
 *  T1 the guard: IELTS_ENFORCE_TEST_ISOLATION without IELTS_DB_PATH makes
 *     ANY import of src/db throw — a gate that loses its isolation setting
 *     refuses to run instead of silently landing on data/app.db;
 *  T2 gates run through scripts/with-test-db.mjs leave the production
 *     business state untouched (normalize:exam, the first verify:all step,
 *     used to write app_config.activeExam straight into production);
 *  T3 the gate snapshot is WAL-consistent (VACUUM INTO includes frames a
 *     plain file copy would miss);
 *  T4 a representative gate batch (normalize + suites + migrations) leaves
 *     a full business snapshot of production identical (full verify:all
 *     runs as the final pre-push rehearsal);
 *  T5 every wrapper run rebuilds the snapshot — legacy suites' temp users
 *     never accumulate across runs.
 *
 * Run: npx tsx scripts/verify-test-isolation.ts   */

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROD = path.join(ROOT, "data", "app.db");
const GATE = path.join(ROOT, "data", "test-fixtures", "gate.db");
const FIX = path.join(ROOT, "data", "test-fixtures");

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

/** Read-only business snapshot of the production database: every user row,
 *  every config row, per-table row counts, and a content hash of the
 *  learning-history tables. Byte-level changes that carry no business
 *  meaning (WAL housekeeping) do not affect this. */
function businessSnapshot(): string {
  const d = new Database(PROD, { readonly: true });
  try {
    const parts: string[] = [];
    for (const t of ["users", "app_config", "contents", "chunks", "vocabularies", "retrieval_items",
      "review_history", "chunk_events", "writing_attempts", "speaking_attempts", "daily_missions",
      "user_progress", "errors", "learning_profiles"]) {
      const rows = d.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();
      parts.push(`${t}:${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`);
    }
    return parts.join("|");
  } finally {
    d.close();
  }
}

const runWrapper = (args: string[]) =>
  execFileSync("node", [path.join(ROOT, "scripts", "with-test-db.mjs"), ...args], {
    cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });

async function main() {
  /* ── T1 · the guard refuses an unspecified database ──
   * The probe is a FILE (scripts/db-guard-probe.ts) so no nested shell
   * quoting is involved; exit 3 = the guard threw at import time. */
  const winShell = process.platform === "win32";
  let guardRefused = false;
  let guardMsg = "";
  try {
    execFileSync("npx", ["tsx", "scripts/db-guard-probe.ts"], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: winShell,
      env: { ...process.env, IELTS_ENFORCE_TEST_ISOLATION: "1", IELTS_DB_PATH: "" },
    });
  } catch (e) {
    guardRefused = true;
    guardMsg = String((e as { stderr?: string }).stderr ?? "");
  }
  check("T1: enforce-without-path makes any src/db import throw", guardRefused);
  check("T1: refusal message names the isolation contract", guardMsg.includes("test isolation") && guardMsg.includes("IELTS_DB_PATH"));

  // and the guard never fires for the application itself (no flag → normal)
  const appMode = spawnSync("npx", ["tsx", "scripts/db-guard-probe.ts"], {
    cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: winShell,
  });
  check("T1: without the flag the app path is untouched (no throw)", appMode.status === 0);

  /* ── T2 · a gated normalize:exam does not touch production config ── */
  const beforeCfg = businessSnapshot();
  fs.rmSync(GATE, { force: true });
  runWrapper(["npm", "run", "normalize:exam"]);
  const afterCfg = businessSnapshot();
  check("T2: gated normalize:exam leaves the production business snapshot identical",
    beforeCfg === afterCfg, "snapshot differs");
  const gateDb = new Database(GATE, { readonly: true });
  const gateExam = gateDb.prepare("SELECT value FROM app_config WHERE key='activeExam'").get() as { value: string } | undefined;
  gateDb.close();
  check("T2: the normalize ran (and wrote) on the gate snapshot, not production",
    gateExam != null, `gate activeExam=${gateExam?.value}`);

  /* ── T3 · the snapshot is WAL-consistent ── */
  {
    const demo = path.join(FIX, "wal-probe.db");
    for (const p of [demo, `${demo}-wal`, `${demo}-shm`]) fs.rmSync(p, { force: true });
    const w = new Database(demo);
    w.pragma("journal_mode = WAL");
    w.exec("create table probe(x); insert into probe values (7)"); // sits in -wal
    const snap = path.join(FIX, "wal-probe-snap.db");
    fs.rmSync(snap, { force: true });
    const r = new Database(demo, { readonly: true });
    r.prepare("vacuum into ?").run(snap);
    r.close();
    const s = new Database(snap, { readonly: true });
    const n = (s.prepare("SELECT count(*) n FROM probe").get() as { n: number }).n;
    s.close();
    w.close();
    for (const p of [demo, `${demo}-wal`, `${demo}-shm`, snap]) fs.rmSync(p, { force: true });
    check("T3: VACUUM INTO snapshot includes un-checkpointed WAL data", n === 1, `rows=${n}`);
  }

  /* ── T4 · a representative gate batch leaves production identical ── */
  const beforeBatch = businessSnapshot();
  runWrapper(["npm", "run", "test:pm"]);
  runWrapper(["npm", "run", "test:db-migrations"]);
  const afterBatch = businessSnapshot();
  check("T4: gated suites (pm + db-migrations) leave the production business snapshot identical",
    beforeBatch === afterBatch);

  /* ── T5 · wrapper runs rebuild the snapshot (no temp-user accumulation) ── */
  runWrapper(["npm", "run", "test:pm"]);
  const g1 = new Database(GATE, { readonly: true });
  const temp1 = (g1.prepare("SELECT count(*) n FROM users WHERE name LIKE '%verify%' OR name LIKE '%wp%'").get() as { n: number }).n;
  g1.close();
  runWrapper(["npm", "run", "test:pm"]);
  const g2 = new Database(GATE, { readonly: true });
  const temp2 = (g2.prepare("SELECT count(*) n FROM users WHERE name LIKE '%verify%' OR name LIKE '%wp%'").get() as { n: number }).n;
  g2.close();
  check("T5: each wrapper run starts from a fresh snapshot (temp users don't accumulate)",
    temp1 === temp2, `run1=${temp1} run2=${temp2}`);

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
