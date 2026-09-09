/**
 * Import 124 real Cambridge writing tests (khoazandev/IELTS_WEB harvest,
 * 2026-09-08 scout round) into ielts_tasks.
 * - Task 2: all 124 (full essay prompts)
 * - Task 1: only image-free ones (108/124 reference missing chart images)
 * Idempotent by (taskType, prompt). Run: npm run db:cambridgewriting
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";

interface RawTask {
  taskType: "TASK_1" | "TASK_2";
  prompt: string;
  imageUrl?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  const file = path.join(process.cwd(), "data", "writing-bank", "cambridge-writing-124.json");
  const data = JSON.parse(readFileSync(file, "utf-8")) as { tests: { sections: { writingTasks: RawTask[] }[] }[] };

  const existing = new Set<string>();
  for (const t of ["writing_task1", "writing_task2"]) {
    const rows = await db.select({ p: ieltsTasks.prompt }).from(ieltsTasks).where(eq(ieltsTasks.taskType, t));
    rows.forEach((r) => existing.add(norm(r.p)));
  }

  let t1 = 0;
  let t2 = 0;
  for (const test of data.tests) {
    for (const task of test.sections.flatMap((s) => s.writingTasks ?? [])) {
      const prompt = task.prompt.replace(/^Task [12]:\s*/i, "").trim();
      if (!prompt || prompt.length < 40) continue;
      if (existing.has(norm(prompt))) continue;
      const isT1 = task.taskType === "TASK_1";
      if (isT1 && task.imageUrl) continue; // chart image missing in the repo
      await db.insert(ieltsTasks).values({
        taskType: isT1 ? "writing_task1" : "writing_task2",
        skill: "writing",
        difficulty: 3,
        topic: "writing",
        prompt,
        timeLimitMinutes: isT1 ? 20 : 40,
        source: "writing-cambridge-124",
      });
      existing.add(norm(prompt));
      if (isT1) t1++;
      else t2++;
    }
  }
  console.log(`inserted: task1 ${t1}, task2 ${t2}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
