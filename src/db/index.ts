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
