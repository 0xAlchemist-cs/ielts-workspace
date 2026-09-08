import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ieltsTasks } from "@/db/schema";

/* ── Full mock paper assembly — Reading (3 passages) + Writing (T1+T2) ─────
 * The paper is date-seeded: same day = same paper, so an accidental refresh
 * (with localStorage answers) never destroys an exam in progress.
 * Answers NEVER travel to the client — grading re-fetches tasks server-side. */

export interface PaperQuestion {
  no: number;
  question: string;
  subSkill: string;
  options?: string[];
  multi?: boolean;
}

export interface PaperPassage {
  taskId: number;
  label: string; // Passage 1/2/3
  title: string;
  content: string;
  questions: PaperQuestion[];
}

export interface MockPaper {
  seed: number;
  dateKey: string;
  passages: PaperPassage[];
  writing: { task1: { taskId: number; prompt: string }; task2: { taskId: number; prompt: string } };
  totalQuestions: number;
  minutes: number;
}

interface RawQuestion {
  question: string;
  answer: string;
  subSkill: string;
  options?: string[];
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function extractTitle(content: string, fallback: string): string {
  // "READING PASSAGE 1\n...\nTitle" — fall back to the prompt's quoted title
  const m = fallback.match(/"([^"]+)"/);
  return m ? m[1] : fallback.slice(0, 60);
}

export function todaySeed(): { seed: number; dateKey: string } {
  const d = new Date();
  const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const seed = Number(dateKey.replace(/-/g, ""));
  return { seed, dateKey };
}

export async function buildMockPaper(seed: number, dateKey: string): Promise<MockPaper> {
  const rng = mulberry32(seed);
  const buckets = await Promise.all(
    [
      [1, 2], // Passage 1 — easiest
      [3], // Passage 2
      [4, 5], // Passage 3 — hardest
    ].map((diffs) =>
      db
        .select({ id: ieltsTasks.id, prompt: ieltsTasks.prompt, content: ieltsTasks.content, questions: ieltsTasks.questions, difficulty: ieltsTasks.difficulty })
        .from(ieltsTasks)
        .where(and(eq(ieltsTasks.source, "ielts-practice"), inArray(ieltsTasks.difficulty, diffs)))
        .orderBy(sql`random()`)
        .limit(12),
    ),
  );
  const [t1rows, t2rows] = await Promise.all([
    db.select({ id: ieltsTasks.id, prompt: ieltsTasks.prompt }).from(ieltsTasks).where(eq(ieltsTasks.taskType, "writing_task1")).orderBy(sql`random()`).limit(6),
    db.select({ id: ieltsTasks.id, prompt: ieltsTasks.prompt }).from(ieltsTasks).where(eq(ieltsTasks.taskType, "writing_task2")).orderBy(sql`random()`).limit(6),
  ]);

  let no = 0;
  const passages: PaperPassage[] = buckets.map((rows, i) => {
    const row = pick(rng, rows);
    const qs = (row.questions as unknown as RawQuestion[]) ?? [];
    return {
      taskId: row.id,
      label: `Passage ${i + 1}`,
      title: extractTitle(row.content ?? "", row.prompt),
      content: row.content ?? "",
      questions: qs.map((q) => ({
        no: ++no,
        question: q.question,
        subSkill: q.subSkill,
        options: q.options,
        multi: /\b(two|three|TWO|THREE)\b/.test(q.question) && !!q.options,
      })),
    };
  });

  return {
    seed,
    dateKey,
    passages,
    writing: {
      task1: (() => { const r = pick(rng, t1rows); return { taskId: r.id, prompt: r.prompt }; })(),
      task2: (() => { const r = pick(rng, t2rows); return { taskId: r.id, prompt: r.prompt }; })(),
    },
    totalQuestions: no,
    minutes: 120,
  };
}

/* ── Grading ─────────────────────────────────────────────────────────────── */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** answers like "viii. A chance discovery" grade by leading roman numeral OR text */
function answerMatches(user: string, want: string): boolean {
  const u = norm(user);
  const w = norm(want);
  if (!u) return false;
  if (u === w || u.includes(w) || w.includes(u)) return true;
  const roman = (s: string) => s.match(/^(i{1,3}|iv|v|vi{0,3}|ix|x)\b/)?.[1];
  const ru = roman(u);
  const rw = roman(w);
  return !!(ru && rw && ru === rw);
}

function multiMatches(user: string[], want: string): boolean {
  // multi answers are comma-joined variants in the bank — set compare on romans/shorts
  const wants = want.split(/[,/]| or /i).map(norm).filter(Boolean);
  if (!wants.length) return false;
  return wants.every((w) => user.some((u) => answerMatches(u, w))) && user.length === wants.length;
}

export interface GradedQuestion {
  no: number;
  correct: boolean;
  yourAnswer: string;
  answer: string;
  question: string;
}

/** Academic-reading band ladder (39–40 → 9.0 …), scaled by ratio for 39-Q papers. */
export function readingBand(raw: number, total: number): number {
  const p = total ? raw / total : 0;
  const ladder: [number, number][] = [
    [0.975, 9], [0.925, 8.5], [0.875, 8], [0.825, 7.5], [0.75, 7], [0.675, 6.5],
    [0.575, 6], [0.475, 5.5], [0.375, 5], [0.35, 4.5], [0.25, 4], [0.2, 3.5],
    [0.15, 3], [0.1, 2.5],
  ];
  for (const [threshold, band] of ladder) if (p >= threshold) return band;
  return 2;
}

export async function gradeMockReading(
  taskIds: number[],
  responses: Record<string, string | string[]>,
): Promise<{ perQuestion: GradedQuestion[]; raw: number; total: number; band: number; passageScores: { label: string; raw: number; total: number }[] }> {
  const rows = await db
    .select({ id: ieltsTasks.id, questions: ieltsTasks.questions })
    .from(ieltsTasks)
    .where(inArray(ieltsTasks.id, taskIds));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const perQuestion: GradedQuestion[] = [];
  const passageScores: { label: string; raw: number; total: number }[] = [];
  let no = 0;
  let raw = 0;
  for (const id of taskIds) {
    const qs = ((byId.get(id)?.questions as unknown as RawQuestion[]) ?? []);
    let pRaw = 0;
    for (const q of qs) {
      const n = ++no;
      const resp = responses[String(n)];
      const multi = /\b(two|three|TWO|THREE)\b/.test(q.question) && !!q.options;
      const correct = multi
        ? multiMatches(Array.isArray(resp) ? resp : [String(resp ?? "")], q.answer)
        : answerMatches(String(resp ?? ""), q.answer);
      if (correct) {
        raw++;
        pRaw++;
      }
      perQuestion.push({ no: n, correct, yourAnswer: Array.isArray(resp) ? resp.join(", ") : String(resp ?? ""), answer: q.answer, question: q.question });
    }
    passageScores.push({ label: `Passage ${passageScores.length + 1}`, raw: pRaw, total: qs.length });
  }
  return { perQuestion, raw, total: no, band: readingBand(raw, no), passageScores };
}
