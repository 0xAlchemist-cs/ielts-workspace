/* ── Versioned database migrations runner (step-10) ──────────────────────────
 * The safe replacement for `db:push --force` against a live database:
 *
 *   node scripts/db-migrate.mjs [--db <path>] [--yes-production]
 *
 * Behavior:
 *  1. REFUSES the production database (data/app.db) unless --yes-production
 *     is passed explicitly — the check runs before anything is opened.
 *  2. Takes a consistent pre-migration snapshot (VACUUM INTO) next to the
 *     target — restore = stop the app, copy the snapshot over the db.
 *  3. Applies drizzle/ migrations in order via the drizzle migrator
 *     (journal table __drizzle_migrations tracks what ran; re-running is a
 *     no-op). The 0000 baseline is idempotent (IF NOT EXISTS), so existing
 *     databases adopt the migration history without rebuilding anything.
 *  4. Post-verifies PRAGMA integrity_check and reports table counts.
 *
 * Dev workflow for schema changes: edit src/db/schema.ts →
 * `npx drizzle-kit generate` → review the SQL → rehearse on a copy
 * (docs/migrations.md) → `node scripts/db-migrate.mjs --db data/app.db
 * --yes-production` when the rehearsal is green. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const target = path.resolve(opt("--db") ?? path.join(ROOT, "data", "app.db"));
const PRODUCTION_DB = path.join(ROOT, "data", "app.db");

// ── 1. production guard: runs before ANY database is opened ────────────────
const isProduction = path.resolve(target) === path.resolve(PRODUCTION_DB);
if (isProduction && !flag("--yes-production")) {
  console.error(
    `[db-migrate] REFUSING to run against the production database (${target}).\n` +
    `             Rehearse on a copy first (docs/migrations.md), then re-run with\n` +
    `             --yes-production to acknowledge. Nothing was opened or changed.`,
  );
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
if (!fs.existsSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"))) {
  console.error(`[db-migrate] no migrations found in ${MIGRATIONS_DIR} — run drizzle-kit generate first.`);
  process.exit(1);
}
if (!fs.existsSync(target)) {
  // fresh install path: create the file so VACUUM INTO and migrate work
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

// ── 2. consistent pre-migration snapshot (restore point) ───────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapshot = `${target}.pre-migrate-${stamp}.snapshot`;
{
  const snap = new Database(target);
  try {
    snap.exec(`vacuum into '${snapshot.replace(/'/g, "''")}'`);
  } finally {
    snap.close();
  }
  console.log(`[db-migrate] snapshot written: ${path.basename(snapshot)}`);
}

// ── 3. apply migrations (journal-deduplicated; re-runs are no-ops) ────────
const sqlite = new Database(target);
try {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log("[db-migrate] migrations applied (or already up to date)");

  // ── 4. post-verification ────────────────────────────────────────────────
  const integrity = sqlite.pragma("integrity_check");
  const ok = Array.isArray(integrity)
    ? integrity.length === 1 && integrity[0].integrity_check === "ok"
    : true;
  if (!ok) {
    console.error("[db-migrate] integrity_check FAILED — restore the snapshot above.");
    process.exit(1);
  }
  const tables = sqlite
    .prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .get();
  const journal = sqlite.prepare("SELECT count(*) n FROM __drizzle_migrations").get();
  console.log(
    `[db-migrate] integrity ok — ${tables.n} tables, ${journal.n} migration(s) recorded.`,
  );
} catch (e) {
  console.error(`[db-migrate] FAILED: ${e.message}`);
  console.error(`[db-migrate] restore with the snapshot: ${path.basename(snapshot)}`);
  process.exit(1);
} finally {
  sqlite.close();
}
