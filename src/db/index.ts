import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
// IELTS_DB_PATH reroutes the singleton to an isolated database so test/CI
// gates can run on copies without ever touching the production app.db.
// Default (unset) behavior is unchanged.
const DB_PATH = process.env.IELTS_DB_PATH
  ? path.resolve(process.env.IELTS_DB_PATH)
  : path.join(DATA_DIR, "app.db");

// Test-isolation guard (step-13 follow-up): when a gate wrapper declares
// IELTS_ENFORCE_TEST_ISOLATION, an unspecified IELTS_DB_PATH means the run
// would silently land on the PRODUCTION database — refuse instead. The
// application itself never sets the flag, so normal runs are unaffected.
if (process.env.IELTS_ENFORCE_TEST_ISOLATION && !process.env.IELTS_DB_PATH) {
  throw new Error(
    "[db] test isolation enforced but IELTS_DB_PATH is not set — this gate " +
    "would run against the default (production) database. Refusing. " +
    "Run gates through scripts/with-test-db.mjs or set IELTS_DB_PATH explicitly.",
  );
}

if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Singleton across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { __ieltsSqlite?: Database.Database };

function openDb(): Database.Database {
  const db = globalForDb.__ieltsSqlite ?? new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  globalForDb.__ieltsSqlite = db;
  return db;
}

export const sqlite = openDb();
export const db = drizzle(sqlite, { schema });
export { schema };
