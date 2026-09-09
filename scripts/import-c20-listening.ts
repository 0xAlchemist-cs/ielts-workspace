/** Import the c20 listening bank (completion parts 1 & 4; P2/P3 are MCQ without
 *  available options text).  Creates BOTH the contents rows (verbatim transcript
 *  + CDN-downloaded audio) and the ielts_tasks rows (cloze questions + gold answers).
 *  Run: npm run db:listening:c20 — idempotent by source. */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { contents, ieltsTasks } from "../src/db/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "listening-bank-c20";

interface C20Question {
  number: number;
  question: string;
  answer: string;
  acceptable: string[];
}
interface C20Record {
  book: string;
  test: number;
  part: number;
  transcript: string;
  questions: C20Question[];
}

function minutesOf(text: string): number {
  return Math.max(3, Math.round(text.split(/\s+/).filter(Boolean).length / 180));
}

async function main() {
  const [existing] = await db
    .select({ id: ieltsTasks.id })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.source, SOURCE))
    .limit(1);
  if (existing) {
    console.log(`c20 bank already imported (task ${existing.id}) — nothing to do`);
    return;
  }

  const records: C20Record[] = JSON.parse(
    readFileSync(join(process.cwd(), "data", "listening-bank", "c20-import.json"), "utf-8"),
  );

  let contentsAdded = 0;
  let tasksAdded = 0;
  for (const rec of records) {
    const audioUrl = `/audio/cambridge/${rec.book}-test${rec.test}-part${rec.part}.mp3`;
    const title = `Cambridge ${rec.test + 20} · Test ${rec.test} · Part ${rec.part} — Listening Part ${rec.part}`;

    const [dupe] = await db
      .select({ id: contents.id })
      .from(contents)
      .where(eq(contents.title, title))
      .limit(1);
    if (!dupe) {
      await db.insert(contents).values({
        type: "listening",
        title,
        topic: "cambridge listening",
        cefr: "B1",
        difficulty: 3,
        vocabDensity: 0.4,
        grammarComplexity: 3,
        ieltsRelevance: 5,
        summaryEn: `Real Cambridge ${rec.test + 20} listening transcript (part ${rec.part}). Audio available.`,
        body: rec.transcript,
        audioUrl,
        minutes: minutesOf(rec.transcript),
      });
      contentsAdded++;
    }

    const questions = rec.questions.map((q) => ({
      question: q.question,
      answer: q.answer,
      ...(q.acceptable.length ? { acceptable: q.acceptable } : {}),
      subSkill: "completion",
    }));
    await db.insert(ieltsTasks).values({
      taskType: "listening_section",
      skill: "listening",
      difficulty: rec.part === 4 ? 4 : 3,
      topic: "cambridge listening",
      prompt: `剑桥雅思${rec.test + 20} · Test ${rec.test} · Part ${rec.part}. Listen and complete the blanks. (Answers: case-insensitive; slash variants accepted.)`,
      content: rec.transcript,
      questions,
      audioUrl,
      timeLimitMinutes: 8,
      source: SOURCE,
    });
    tasksAdded++;
  }
  console.log(`c20 bank imported: ${tasksAdded} tasks, ${contentsAdded} contents (${SOURCE})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
