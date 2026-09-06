/**
 * One-off: insert a single reading exam added after the main bank import
 * (p1-medium-161 from hwttop5/ielts-reading-past-papers, the only exam the
 * fork has that IELTS-practice lacks).
 * Reads data/reading-bank/import.json, inserts the record if a task with the
 * same prompt does not exist yet. Explanations: none available for this exam.
 * Run: npx tsx scripts/import-single-exam.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";

interface BankQuestion { question: string; options?: string[]; answer: string; subSkill: string }
interface BankRecord {
  examId: string; title: string; category: string; difficulty: number; topic: string;
  prompt: string; content: string; questions: BankQuestion[]; estimatedBand: number; timeLimitMinutes: number;
}

const TARGET = "p1-medium-161";

async function main() {
  const file = path.join(process.cwd(), "data", "reading-bank", "import.json");
  const records: BankRecord[] = JSON.parse(readFileSync(file, "utf-8"));
  const rec = records.find((r) => r.examId === TARGET);
  if (!rec) throw new Error(`${TARGET} not in import.json`);

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.prompt, rec.prompt));
  if ((row?.n ?? 0) > 0) {
    console.log(`${TARGET} already imported — skipping`);
    return;
  }
  await db.insert(ieltsTasks).values({
    taskType: "reading_passage" as const,
    skill: "reading" as const,
    difficulty: rec.difficulty,
    topic: rec.topic,
    prompt: rec.prompt,
    content: rec.content,
    questions: rec.questions,
    targetChunkIds: [] as number[],
    estimatedBand: rec.estimatedBand,
    timeLimitMinutes: rec.timeLimitMinutes,
    source: "ielts-practice",
  });
  console.log(`inserted ${TARGET}: "${rec.title}" with ${rec.questions.length} questions`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
