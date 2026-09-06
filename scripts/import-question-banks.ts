/**
 * Import speaking + writing question banks into ielts_tasks.
 *
 * Sources:
 *   data/speaking-bank/speaking.json  — 2025 1-4月 口语题库
 *     part1: 55 topics / 303 questions; part2: 85 cue cards; part3: 85 topics / 421 questions
 *   data/writing-bank/writing.json    — 2020 全年 Task 2 真题 (37) + 2025 1-4月预测 (63)
 *
 * Sources written: "speaking-bank-2025" | "writing-past-2020" | "writing-predict-2025".
 * Idempotent: each source is skipped if rows already exist.
 * Run: npm run db:questions
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";

interface Part1 { topic: string; questions: string[] }
interface Part2 { titleZh: string; cue: string; hints: string[] }
interface Part3 { titleZh?: string; topic?: string; questions: string[] }
interface Speaking { part1: Part1[]; part2: Part2[]; part3: Part3[] }
interface Writing { past2020: { date: string; prompt: string }[]; predict2025: string[] }

const BAND: Record<number, number> = { 2: 5.5, 3: 6, 4: 6.5 };

type TaskInsert = typeof ieltsTasks.$inferInsert;

function topicFromCue(cue: string): string {
  const stripped = cue.replace(/^Describe\s+(a|an|your|the)?\s*/i, "");
  return (stripped.split(/\s+/).slice(0, 3).join(" ") || "general").toLowerCase();
}

async function alreadyImported(source: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.source, source));
  return row?.n ?? 0;
}

async function insertTasks(tasks: TaskInsert[], label: string): Promise<number> {
  const BATCH = 50;
  for (let i = 0; i < tasks.length; i += BATCH) {
    await db.insert(ieltsTasks).values(tasks.slice(i, i + BATCH));
  }
  console.log(`${label}: inserted ${tasks.length}`);
  return tasks.length;
}

async function main() {
  const root = path.join(process.cwd(), "data");
  const speaking: Speaking = JSON.parse(readFileSync(path.join(root, "speaking-bank", "speaking.json"), "utf-8"));
  const writing: Writing = JSON.parse(readFileSync(path.join(root, "writing-bank", "writing.json"), "utf-8"));

  // ── Speaking ───────────────────────────────────────────────────────────────
  if ((await alreadyImported("speaking-bank-2025")) > 0) {
    console.log("speaking-bank-2025 already imported — skipping");
  } else {
    const tasks: TaskInsert[] = [];
    for (const p of speaking.part1) {
      const qs = p.questions.slice(0, 12).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part1", skill: "speaking", difficulty: 2, topic: p.topic.toLowerCase(),
        prompt: `Part 1 — Topic: ${p.topic}. Answer the questions naturally, as if talking to an examiner.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[2], timeLimitMinutes: 5, source: "speaking-bank-2025",
      });
    }
    for (const p of speaking.part2) {
      const hints = p.hints.map((h) => `· ${h}`).join("\n");
      tasks.push({
        taskType: "speaking_part2", skill: "speaking", difficulty: 3, topic: topicFromCue(p.cue),
        prompt: `${p.cue}\nYou should say:\n${hints}`,
        targetChunkIds: [], estimatedBand: BAND[3], timeLimitMinutes: 2, source: "speaking-bank-2025",
      });
    }
    for (const p of speaking.part3) {
      const qs = p.questions.slice(0, 6).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part3", skill: "speaking", difficulty: 4, topic: "discussion",
        prompt: `Part 3 discussion${p.titleZh ? ` — follow-up to "${p.titleZh}"` : ""}. Develop your answers with reasons and examples.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[4], timeLimitMinutes: 4, source: "speaking-bank-2025",
      });
    }
    await insertTasks(tasks, "speaking-bank-2025");
  }

  // ── Writing 2020 past papers ───────────────────────────────────────────────
  if ((await alreadyImported("writing-past-2020")) > 0) {
    console.log("writing-past-2020 already imported — skipping");
  } else {
    const tasks: TaskInsert[] = writing.past2020.map((w) => ({
      taskType: "writing_task2" as const, skill: "writing" as const, difficulty: 4, topic: "general",
      prompt: `${w.prompt}\nWrite at least 250 words.`,
      targetChunkIds: [], estimatedBand: BAND[4], timeLimitMinutes: 40, source: "writing-past-2020",
    }));
    await insertTasks(tasks, "writing-past-2020");
  }

  // ── Writing 2022 past papers ──────────────────────────────────────────────
  if ((await alreadyImported("writing-past-2022")) > 0) {
    console.log("writing-past-2022 already imported — skipping");
  } else {
    const past2022: { date: string; categoryZh: string; prompt: string }[] = JSON.parse(
      readFileSync(path.join(root, "writing-bank", "past2022.json"), "utf-8")
    );
    const tasks: TaskInsert[] = past2022.map((w) => ({
      taskType: "writing_task2" as const, skill: "writing" as const, difficulty: 4, topic: "general",
      prompt: `${w.prompt}\nWrite at least 250 words.`,
      targetChunkIds: [], estimatedBand: BAND[4], timeLimitMinutes: 40, source: "writing-past-2022",
    }));
    await insertTasks(tasks, "writing-past-2022");
  }

  // ── Writing 2025 predictions ───────────────────────────────────────────────
  if ((await alreadyImported("writing-predict-2025")) > 0) {
    console.log("writing-predict-2025 already imported — skipping");
  } else {
    const tasks: TaskInsert[] = writing.predict2025.map((p) => ({
      taskType: "writing_task2" as const, skill: "writing" as const, difficulty: 3, topic: "general",
      prompt: `${p}\nWrite at least 250 words.`,
      targetChunkIds: [], estimatedBand: BAND[3], timeLimitMinutes: 40, source: "writing-predict-2025",
    }));
    await insertTasks(tasks, "writing-predict-2025");
  }

  // ── Cambridge 4 official speaking prompts ─────────────────────────────────
  if ((await alreadyImported("cambridge-4-speaking")) > 0) {
    console.log("cambridge-4-speaking already imported — skipping");
  } else {
    const cam: Speaking = JSON.parse(readFileSync(path.join(root, "speaking-bank", "cambridge-4-speaking.json"), "utf-8"));
    const tasks: TaskInsert[] = [];
    for (const p of cam.part1) {
      const qs = p.questions.slice(0, 10).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part1" as const, skill: "speaking" as const, difficulty: 2, topic: p.topic.toLowerCase(),
        prompt: `Part 1 — Topic: ${p.topic} (Cambridge official). Answer naturally.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[2], timeLimitMinutes: 4, source: "cambridge-4-speaking",
      });
    }
    for (const p of cam.part2) {
      const hints = p.hints.map((h) => `· ${h}`).join("\n");
      tasks.push({
        taskType: "speaking_part2" as const, skill: "speaking" as const, difficulty: 3, topic: topicFromCue(p.cue),
        prompt: `${p.cue} (Cambridge official)\nYou should say:\n${hints}`,
        targetChunkIds: [], estimatedBand: BAND[3], timeLimitMinutes: 2, source: "cambridge-4-speaking",
      });
    }
    for (const p of cam.part3) {
      const qs = p.questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part3" as const, skill: "speaking" as const, difficulty: 4, topic: "discussion",
        prompt: `Part 3 discussion — "${p.topic}" (Cambridge official). Develop your answers.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[4], timeLimitMinutes: 4, source: "cambridge-4-speaking",
      });
    }
    await insertTasks(tasks, "cambridge-4-speaking");
  }

  // ── 2026 May-Aug season speaking bank (HRU 122 topics + tutuhua cue cards) ─
  if ((await alreadyImported("speaking-2026-may-aug")) > 0) {
    console.log("speaking-2026-may-aug already imported — skipping");
  } else {
    const season: Speaking = JSON.parse(readFileSync(path.join(root, "speaking-bank", "season-2026.json"), "utf-8"));
    const tasks: TaskInsert[] = [];
    for (const p of season.part1) {
      const qs = p.questions.slice(0, 10).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part1" as const, skill: "speaking" as const, difficulty: 2, topic: p.topic.toLowerCase(),
        prompt: `Part 1 — Topic: ${p.topic} (2026 May-Aug season). Answer naturally.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[2], timeLimitMinutes: 4, source: "speaking-2026-may-aug",
      });
    }
    for (const p of season.part2) {
      const hints = p.hints.map((h) => `· ${h}`).join("\n");
      tasks.push({
        taskType: "speaking_part2" as const, skill: "speaking" as const, difficulty: 3, topic: topicFromCue(p.cue),
        prompt: `${p.cue} (2026 May-Aug season)\nYou should say:\n${hints}`,
        targetChunkIds: [], estimatedBand: BAND[3], timeLimitMinutes: 2, source: "speaking-2026-may-aug",
      });
    }
    for (const p of season.part3) {
      const qs = p.questions.slice(0, 6).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part3" as const, skill: "speaking" as const, difficulty: 4, topic: "discussion",
        prompt: `Part 3 discussion — "${p.topic}" (2026 May-Aug season). Develop your answers.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[4], timeLimitMinutes: 4, source: "speaking-2026-may-aug",
      });
    }
    await insertTasks(tasks, "speaking-2026-may-aug");
  }

  // ── 2025 Sep-Dec season speaking bank ─────────────────────────────────────
  if ((await alreadyImported("speaking-2025-sep-dec")) > 0) {
    console.log("speaking-2025-sep-dec already imported — skipping");
  } else {
    const season: Speaking = JSON.parse(readFileSync(path.join(root, "speaking-bank", "season-2025.json"), "utf-8"));
    const tasks: TaskInsert[] = [];
    for (const p of season.part1) {
      const qs = p.questions.slice(0, 10).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part1" as const, skill: "speaking" as const, difficulty: 2, topic: p.topic.toLowerCase(),
        prompt: `Part 1 — Topic: ${p.topic} (2025 Sep-Dec season). Answer naturally.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[2], timeLimitMinutes: 4, source: "speaking-2025-sep-dec",
      });
    }
    for (const p of season.part2) {
      const hints = p.hints.map((h) => `· ${h}`).join("\n");
      tasks.push({
        taskType: "speaking_part2" as const, skill: "speaking" as const, difficulty: 3, topic: topicFromCue(p.cue),
        prompt: `${p.cue} (2025 Sep-Dec season)\nYou should say:\n${hints}`,
        targetChunkIds: [], estimatedBand: BAND[3], timeLimitMinutes: 2, source: "speaking-2025-sep-dec",
      });
    }
    for (const p of season.part3) {
      const qs = p.questions.slice(0, 6).map((q, i) => `${i + 1}) ${q}`).join("\n");
      tasks.push({
        taskType: "speaking_part3" as const, skill: "speaking" as const, difficulty: 4, topic: "discussion",
        prompt: `Part 3 discussion — "${p.topic}" (2025 Sep-Dec season). Develop your answers.\n${qs}`,
        targetChunkIds: [], estimatedBand: BAND[4], timeLimitMinutes: 4, source: "speaking-2025-sep-dec",
      });
    }
    await insertTasks(tasks, "speaking-2025-sep-dec");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
