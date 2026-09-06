/**
 * Import writing sentence patterns (十大句式 + Task 1 万能句式) into
 * grammar_patterns for the single real user, mirroring registerPatternAction:
 * insert + ensureRetrievalItem(userId, "sentence_pattern", id).
 *
 * Source: data/writing-patterns/patterns.json (built by parse_patterns.py).
 * User resolution: the first user whose name is not a test/audit stub.
 * Idempotent: (userId, pattern) uniqueness checked before insert.
 * Run: npm run db:patterns
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
  console.log(`importing patterns for user ${userId} (${real.name})`);

  const file = path.join(process.cwd(), "data", "writing-patterns", "patterns.json");
  const records: PatternRecord[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`patterns to import: ${records.length}`);

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
  console.log(`patterns inserted: ${inserted}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
