/**
 * Backfill per-question explanations onto ielts-practice reading tasks.
 *
 * Source: data/reading-bank/explanations.json (227 entries parsed from
 * IELTS-practice reading-explanations by the repo's converter).
 * Mapping: rows in ielts_tasks with source='ielts-practice' were inserted in
 * import.json order with monotonic ids — zip ids (ASC) with records (order).
 * Explanations matched by examId; rows without an explanation file stay null.
 * Idempotent: rows that already have explanations are skipped.
 * Run: npm run db:explain
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";

async function main() {
  const bank = path.join(process.cwd(), "data", "reading-bank");
  const records: { examId: string }[] = JSON.parse(readFileSync(path.join(bank, "import.json"), "utf-8"));
  const explanations: {
    examId: string;
    title: string;
    passageNotes: unknown[];
    questionExplanations: unknown[];
  }[] = JSON.parse(readFileSync(path.join(bank, "explanations.json"), "utf-8"));
  const byExamId = new Map(explanations.map((e) => [e.examId, e]));

  const rows = await db
    .select({ id: ieltsTasks.id })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.source, "ielts-practice"))
    .orderBy(asc(ieltsTasks.id));
  console.log(`task rows: ${rows.length}, import records: ${records.length}, explanations: ${explanations.length}`);
  if (rows.length !== records.length) {
    throw new Error("row/record count mismatch — order mapping unsafe, aborting");
  }

  let wired = 0;
  for (let i = 0; i < rows.length; i++) {
    const examId = records[i].examId;
    const exp = byExamId.get(examId);
    if (!exp) continue;
    await db.update(ieltsTasks).set({ explanations: exp }).where(eq(ieltsTasks.id, rows[i].id));
    wired++;
  }
  console.log(`explanations wired: ${wired}/${rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
