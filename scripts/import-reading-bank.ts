/**
 * Import the converted IELTS-practice reading bank into ielts_tasks.
 *
 * Source data: data/reading-bank/import.json (234 passages, ~3.1k questions),
 * produced by the converter at D:/雅思/ielts-repos/IELTS-practice/convert.py.
 * Markdown mirror of every passage lives in data/reading-bank/md/.
 *
 * Idempotent: skips entirely if rows with source "ielts-practice" already exist.
 * Run: npm run db:reading
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";

interface BankQuestion {
  question: string;
  options?: string[];
  answer: string;
  subSkill: string;
}

interface BankRecord {
  examId: string;
  title: string;
  category: string;
  difficulty: number;
  topic: string;
  prompt: string;
  content: string;
  questions: BankQuestion[];
  estimatedBand: number;
  timeLimitMinutes: number;
}

const SOURCE = "ielts-practice";

async function main() {
  const marker = await db
    .select({ n: sql<number>`count(*)` })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.source, SOURCE));
  if ((marker[0]?.n ?? 0) > 0) {
    console.log(`Reading bank already imported (${marker[0].n} rows) — skipping.`);
    return;
  }

  const file = path.join(process.cwd(), "data", "reading-bank", "import.json");
  const records: BankRecord[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`Loaded ${records.length} passages from import.json`);

  let inserted = 0;
  const BATCH = 25;
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    await db.insert(ieltsTasks).values(
      slice.map((r) => ({
        taskType: "reading_passage" as const,
        skill: "reading" as const,
        difficulty: r.difficulty,
        topic: r.topic,
        prompt: r.prompt,
        content: r.content,
        questions: r.questions,
        targetChunkIds: [] as number[],
        estimatedBand: r.estimatedBand,
        timeLimitMinutes: r.timeLimitMinutes,
        source: SOURCE,
      }))
    );
    inserted += slice.length;
    console.log(`  ${inserted}/${records.length}`);
  }

  console.log(`Done: inserted ${inserted} reading passages into ielts_tasks (source "${SOURCE}").`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
