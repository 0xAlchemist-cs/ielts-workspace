import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
