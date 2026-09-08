/**
 * Import meaning-level grammar contrast patterns (from the up-guide 语法篇
 * harvest, 2026-09-07) into grammar_patterns for the single real user,
 * mirroring import-writing-patterns.ts: insert + ensureRetrievalItem.
 *
 * Source: data/writing-patterns/meaning-patterns.json.
 * Idempotent by (userId, pattern).
 * Run: npm run db:meaning-patterns
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { grammarPatterns, users } from "../src/db/schema";
import { ensureRetrievalItem } from "../src/server/services/retrieval";

interface PatternRecord {
  pattern: string;
  meaningZh: string;
  examples: string[];
  source: string;
}

async function main() {
  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const real = allUsers.find((u) => !u.name.startsWith("__pm_verify__") && u.name !== "loop-audit");
  if (!real) throw new Error("no real user found");
  const userId = real.id;
  console.log(`importing meaning patterns for user ${userId} (${real.name})`);

  const file = path.join(process.cwd(), "data", "writing-patterns", "meaning-patterns.json");
  const records: PatternRecord[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`meaning patterns to import: ${records.length}`);

  let inserted = 0;
  for (const r of records) {
    const pattern = `${r.pattern} — ${r.source}`;
    const existing = await db
      .select({ id: grammarPatterns.id })
      .from(grammarPatterns)
      .where(and(eq(grammarPatterns.userId, userId), eq(grammarPatterns.pattern, pattern)))
      .limit(1);
    if (existing.length) continue;
    const [row] = await db
      .insert(grammarPatterns)
      .values({
        userId,
        pattern,
        meaning: r.pattern,
        meaningZh: r.meaningZh,
        examples: r.examples,
        kind: "sentence_pattern",
      })
      .returning({ id: grammarPatterns.id });
    await ensureRetrievalItem(userId, "sentence_pattern", row.id);
    inserted++;
  }
  console.log(`meaning patterns inserted: ${inserted}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
