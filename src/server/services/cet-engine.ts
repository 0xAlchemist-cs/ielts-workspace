import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cetAttempts, cetTasks } from "@/db/schema";
import { addError } from "@/server/services/bank";
import { recordEvent } from "@/server/services/progress";
import type { CetSection } from "@/db/schema";

/* ── V12.2 CET written-test task engine — one shared engine, two configs ────
 * Sections per the official syllabus: 写作|听力|阅读|翻译 (weights 15/35/35/15).
 * Practice results are raw counts — NEVER converted to official CET scores. */

const DAY = 86_400_000;

export interface CetQuestion {
  question: string;
  options: string[];
  answer: string;
}

export interface CetTaskRow {
  id: number;
  examProfile: "cet4" | "cet6";
  section: CetSection;
  taskType: string;
  difficulty: number;
  topic: string;
  prompt: string;
  content: string | null;
  questions: CetQuestion[] | null;
  referenceAnswer: string | null;
  source: string;
  audioUrl: string | null;
  durationMinutes: number;
}

export async function loadCetTasks(
  exam: "cet4" | "cet6",
  section?: CetSection,
): Promise<CetTaskRow[]> {
  const rows = await db
    .select()
    .from(cetTasks)
    .where(
      section
        ? and(eq(cetTasks.examProfile, exam), eq(cetTasks.section, section))
        : eq(cetTasks.examProfile, exam),
    )
    .orderBy(cetTasks.id)
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    examProfile: r.examProfile,
    section: r.section,
    taskType: r.taskType,
    difficulty: r.difficulty,
    topic: r.topic,
    prompt: r.prompt,
    content: r.content,
    questions: r.questions ?? null,
    referenceAnswer: r.referenceAnswer,
    source: r.source,
    audioUrl: r.audioUrl,
    durationMinutes: r.durationMinutes,
  }));
}

export interface CetGradeResult {
  correctCount: number;
  total: number;
  /** raw correct/total — the ONLY score language; no official conversion */
  line: { en: string; zh: string };
  wrongItems: { question: string; yourAnswer: string; answer: string }[];
}

/** Grade an objective (reading/listening) attempt. */
export function gradeObjective(
  task: CetTaskRow,
  responses: Record<string, string>,
): CetGradeResult {
  const qs = task.questions ?? [];
  let correct = 0;
  const wrongItems: CetGradeResult["wrongItems"] = [];
  for (let i = 0; i < qs.length; i++) {
    const given = responses[String(i)] ?? "";
    if (given === qs[i].answer) correct++;
    else wrongItems.push({ question: qs[i].question, yourAnswer: given || "(blank)", answer: qs[i].answer });
  }
  return {
    correctCount: correct,
    total: qs.length,
    line: { en: `${correct}/${qs.length} correct — practice performance`, zh: `${correct}/${qs.length} 答对 —— 练习表现（非官方分数）` },
    wrongItems,
  };
}

/** Persist an attempt + feed shared Learning Memory / Error Bank.
 * Errors bank only genuinely-wrong objective items (with exam context). */
export async function submitCetAttempt(input: {
  userId: number;
  taskId: number;
  mode: "learning" | "exam";
  responses: Record<string, string>;
  /** translation/writing free-text answer */
  freeText?: string;
}): Promise<CetGradeResult | { submitted: true; note: { en: string; zh: string } }> {
  const [task] = await db.select().from(cetTasks).where(eq(cetTasks.id, input.taskId)).limit(1);
  if (!task) throw new Error("task not found");

  const isObjective = task.section === "reading" || task.section === "listening";

  await db.insert(cetAttempts).values({
    userId: input.userId,
    taskId: task.id,
    section: task.section,
    mode: input.mode,
    responses: input.responses,
    freeText: input.freeText ?? null,
    correctCount: isObjective ? gradeObjectiveRow(task, input.responses).correctCount : null,
    totalCount: isObjective ? (task.questions ?? []).length : null,
  });
  await recordEvent(input.userId, isObjective ? "understood" : "used");

  if (isObjective) {
    const graded = gradeObjectiveRow(task, input.responses);
    // bank genuinely-wrong items as errors with exam context (max 3 per attempt)
    for (const w of graded.wrongItems.slice(0, 3)) {
      await addError(input.userId, {
        category: "vocabulary",
        wrongForm: w.yourAnswer.slice(0, 120),
        correctForm: w.answer.slice(0, 120),
        explanation: `CET ${task.examProfile === "cet4" ? "四级" : "六级"} ${task.section} — ${w.question.slice(0, 120)}`,
        sourceModule: `cet_${task.section}`,
      });
    }
    return {
      correctCount: graded.correctCount,
      total: graded.total,
      line: graded.line,
      wrongItems: graded.wrongItems,
    };
  }

  // writing/translation: free text recorded for AI review; honest note
  return {
    submitted: true,
    note: {
      en: "Your answer is saved — review it against the reference, then retry with the gaps in mind.",
      zh: "你的作答已保存——对照参考译文检查，然后带着差距重试。",
    },
  };
}

function gradeObjectiveRow(
  task: typeof cetTasks.$inferSelect,
  responses: Record<string, string>,
): CetGradeResult {
  const qs = (task.questions ?? []) as CetQuestion[];
  let correct = 0;
  const wrongItems: CetGradeResult["wrongItems"] = [];
  for (let i = 0; i < qs.length; i++) {
    const given = responses[String(i)] ?? "";
    if (given === qs[i].answer) correct++;
    else wrongItems.push({ question: qs[i].question, yourAnswer: given || "(blank)", answer: qs[i].answer });
  }
  return {
    correctCount: correct,
    total: qs.length,
    line: { en: `${correct}/${qs.length} correct — practice performance`, zh: `${correct}/${qs.length} 答对 —— 练习表现（非官方分数）` },
    wrongItems,
  };
}
