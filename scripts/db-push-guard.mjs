/* ── db:push guard (step-10) ─────────────────────────────────────────────────
 * `drizzle-kit push --force` is a schema-overwrite tool: fine for a throwaway
 * database (CI starts from nothing), destructive against a database with real
 * learning history. This guard blocks push when the configured target already
 * exists and points at the production path — versioned migrations
 * (scripts/db-migrate.mjs) are the only sanctioned way to evolve it.
 * Fresh environments (no data/app.db yet) pass through untouched, so CI's
 * bootstrap keeps working. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(ROOT, "data", "app.db");

if (fs.existsSync(target)) {
  console.error(
    `[db:push] REFUSING: ${target} already exists.\n` +
    `          db:push --force is only for throwaway/fresh databases.\n` +
    `          To evolve an existing database use versioned migrations:\n` +
    `            npx drizzle-kit generate   # after editing src/db/schema.ts\n` +
    `            node scripts/db-migrate.mjs --db <copy>   # rehearse\n` +
    `            node scripts/db-migrate.mjs --db data/app.db --yes-production\n` +
    `          (delete the file first if you REALLY want a fresh push)`,
  );
  process.exit(1);
}
process.exit(0);
