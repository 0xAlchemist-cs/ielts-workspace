import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";
import { and, eq } from "drizzle-orm";
import { contentFingerprint } from "../src/server/services/content-selection";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ── IELTS Writing Task 1 chart question bank ────────────────────────────────
 * Source: hai2131/IELTS-essays-task-1 via MikeWu597/IELTS_Writing_Task1_Band9_Answers
 * (1516 rows → 281 unique questions). Each task carries the chart description
 * inside the prompt (no external images) and the band-9 sample + per-criterion
 * scores in `explanations`. Idempotent: skips already-imported prompts.
 * Run: npx tsx scripts/import-task1-bank.ts */

interface Row {
  topic: string;
  subject: string;
  image_description?: string;
  content: string;
  overall_band_score: number;
  task_response_score: number;
  coherence_cohesion_score: number;
  lexical_resource_score: number;
  grammatical_range_accuracy_score: number;
}

const TOPIC_SLUG: Record<string, string> = {
  "Line Graph": "line graph",
  "Bar Chart": "bar chart",
  "Pie Chart": "pie chart",
  Table: "table",
  Map: "map",
  "Process Diagram": "process diagram",
  "Multiple Graphs": "multiple charts",
};

async function main() {
  const raw = readFileSync(join(process.cwd(), "data", "task1-bank.jsonl"), "utf-8");
  const rows = raw
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row);

  // dedupe by normalized prompt head — ~5 sample essays share one question
  const seen = new Set<string>();
  const unique: Row[] = [];
  for (const r of rows) {
    const key = r.subject.trim().toLowerCase().slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  console.log(`rows=${rows.length} unique questions=${unique.length}`);

  const existing = await db
    .select({ prompt: ieltsTasks.prompt })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.source, "t1-bank-2026"));
  const existingKeys = new Set(existing.map((e) => e.prompt.trim().toLowerCase().slice(0, 120)));

  let imported = 0;
  let skipped = 0;
  for (const r of unique) {
    const key = r.subject.trim().toLowerCase().slice(0, 120);
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const prompt =
      r.subject.trim() +
      (r.image_description ? `\n\n[Chart 图表描述] ${r.image_description.trim()}` : "");
    await db.insert(ieltsTasks).values({
      taskType: "writing_task1",
      skill: "writing",
      difficulty: 3,
      topic: TOPIC_SLUG[r.topic] ?? "chart",
      prompt: prompt.slice(0, 4000),
      targetChunkIds: [],
      estimatedBand: 6.5,
      timeLimitMinutes: 20,
      source: "t1-bank-2026",
      explanations: {
        sampleEssay: r.content,
        overall: r.overall_band_score,
        scores: {
          taskResponse: r.task_response_score,
          coherence: r.coherence_cohesion_score,
          lexical: r.lexical_resource_score,
          grammar: r.grammatical_range_accuracy_score,
        },
        imageDescription: r.image_description ?? "",
      },
    });
    imported++;
    existingKeys.add(key);
  }
  console.log(`imported=${imported} skipped(already present)=${skipped}`);

  const total = await db
    .select({ id: ieltsTasks.id })
    .from(ieltsTasks)
    .where(and(eq(ieltsTasks.skill, "writing"), eq(ieltsTasks.taskType, "writing_task1")));
  console.log("task1 pool now:", total.length);
  process.exit(0);
}
void main();
