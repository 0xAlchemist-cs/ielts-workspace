/* ── Test-isolation gate wrapper (step-13 follow-up) ────────────────────────
 * The single sanctioned way to run automated gates:
 *
 *   node scripts/with-test-db.mjs <command...>
 *   e.g. node scripts/with-test-db.mjs npm run verify:all
 *
 * What it does:
 *  1. Refreshes data/test-fixtures/gate.db as a WAL-CONSISTENT snapshot of
 *     the default database via VACUUM INTO on a read-only connection (a
 *     plain file copy can miss frames still sitting in the -wal file).
 *     The source is only ever read — its bytes are untouched.
 *  2. Runs the command with IELTS_DB_PATH=<gate.db> and
 *     IELTS_ENFORCE_TEST_ISOLATION=1. The guard in src/db/index.ts then
 *     refuses to open the default (production) path if anything in the
 *     gate ever loses the IELTS_DB_PATH setting — isolation cannot fail
 *     silently.
 *
 * Every run rebuilds the snapshot, so temp users left by legacy suites
 * never accumulate and never touch the production database. */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "app.db");
const GATE = path.join(ROOT, "data", "test-fixtures", "gate.db");

if (process.argv.length <= 2) {
  console.error("usage: node scripts/with-test-db.mjs <command...>");
  process.exit(1);
}

fs.mkdirSync(path.dirname(GATE), { recursive: true });
for (const p of [GATE, `${GATE}-wal`, `${GATE}-shm`]) {
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}
if (fs.existsSync(SOURCE)) {
  const src = new Database(SOURCE, { readonly: true });
  try {
    src.prepare("vacuum into ?").run(GATE);
  } finally {
    src.close();
  }
  console.log(`[with-test-db] consistent snapshot: ${path.relative(ROOT, GATE)}`);
} else {
  // fresh environments (CI bootstrap) may not have the source yet — the
  // gates create what they need on an empty gate database
  console.log("[with-test-db] no default database present — gate starts empty");
}

const env = {
  ...process.env,
  IELTS_DB_PATH: GATE,
  IELTS_ENFORCE_TEST_ISOLATION: "1",
};
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(result.status ?? 1);
