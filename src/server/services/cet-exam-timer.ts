import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cetExamSessions } from "@/db/schema";

/* ── V12.2.1 CET Exam-Mode section timer — server-clock truth ───────────────
 * The DB holds examStartTime / per-section start-end / timedOut / submittedAt;
 * the client renders a countdown derived from the server's remaining
 * milliseconds. Refresh, back/forward, remount, or tab-switch cannot reset or
 * add time — the server recomputes from immutable timestamps. Official
 * durations (min): CET-4 30/25/40/30 (125), CET-6 30/30/40/30 (130). */

const SECTION_ORDER = ["writing", "listening", "reading", "translation"] as const;
type Section = (typeof SECTION_ORDER)[number];

export const EXAM_SECTION_MINUTES: Record<"cet4" | "cet6", Record<Section, number>> = {
  cet4: { writing: 30, listening: 25, reading: 40, translation: 30 },
  cet6: { writing: 30, listening: 30, reading: 40, translation: 30 },
};

/** Test mode: seconds replace minutes so suites/E2E never wait real time. */
export const TEST_SECTION_SECONDS: Record<"cet4" | "cet6", Record<Section, number>> = {
  cet4: { writing: 30, listening: 20, reading: 20, translation: 20 },
  cet6: { writing: 30, listening: 20, reading: 20, translation: 20 },
};

export interface ExamSectionState {
  section: Section;
  /** ms remaining on the server clock (0 when exhausted) */
  remainingMs: number;
  /** true once the wall clock passed the end (client must lock+advance) */
  exhausted: boolean;
  startedAt: number;
}

export interface ExamSessionState {
  sessionId: number;
  exam: "cet4" | "cet6";
  currentSection: Section;
  examStartTime: number;
  sections: Record<string, ExamSectionState | { section: Section; startedAt: null; remainingMs: null }>;
  timedOut: string[];
  submitted: boolean;
  testMode: boolean;
}

export async function startExamSession(
  userId: number,
  exam: "cet4" | "cet6",
  testMode: boolean,
): Promise<ExamSessionState> {
  // one live session per user — resume rather than restart (refresh-safe)
  const existing = await getLiveExamSession(userId, exam);
  if (existing) return existing;
  await db.insert(cetExamSessions).values({
    userId,
    exam,
    testMode: testMode ? 1 : 0,
    currentSection: "writing",
    examStartTime: Date.now(),
  });
  return (await getLiveExamSession(userId, exam))!;
}

export async function getLiveExamSession(
  userId: number,
  exam: "cet4" | "cet6",
): Promise<ExamSessionState | null> {
  const rows = await db
    .select()
    .from(cetExamSessions)
    .where(and(eq(cetExamSessions.userId, userId), isNull(cetExamSessions.submittedAt)))
    .limit(1);
  const row = rows.find((r) => r.exam === exam);
  if (!row) return null;
  return toState(row);
}

export async function advanceSection(
  userId: number,
  sessionId: number,
  fromSection: Section,
  timedOut: boolean,
  responses: Record<string, string>,
  freeText?: string,
): Promise<ExamSessionState | null> {
  const rows = await db.select().from(cetExamSessions).where(eq(cetExamSessions.id, sessionId)).limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId || row.submittedAt) return null;
  if (row.currentSection !== fromSection) return toState(row); // idempotent guard

  const now = Date.now();
  const answers = { ...(row.answers as Record<string, unknown>) };
  answers[fromSection] = { responses, freeText: freeText ?? null, sectionEndTime: now, timedOut };

  const idx = SECTION_ORDER.indexOf(fromSection);
  const next = idx < SECTION_ORDER.length - 1 ? SECTION_ORDER[idx + 1] : null;
  const timeouts = [...(row.timedOut as string[])];
  if (timedOut && !timeouts.includes(fromSection)) timeouts.push(fromSection);

  await db
    .update(cetExamSessions)
    .set({
      currentSection: next ?? fromSection,
      sectionStartTime: next ? now : row.sectionStartTime,
      submittedAt: next ? null : now,
      answers,
      timedOut: timeouts,
    })
    .where(eq(cetExamSessions.id, sessionId));
  // submitted sessions leave the "live" query — read the final row directly
  const [updated] = await db.select().from(cetExamSessions).where(eq(cetExamSessions.id, sessionId)).limit(1);
  return toState(updated);
}

async function finalState(sessionId: number, exam: "cet4" | "cet6"): Promise<ExamSessionState> {
  const rows = await db.select().from(cetExamSessions).where(eq(cetExamSessions.id, sessionId)).limit(1);
  return toState(rows[0])!;
}

type Row = typeof cetExamSessions.$inferSelect;

function toState(row: Row): ExamSessionState {
  const exam = row.exam;
  const table = row.testMode ? TEST_SECTION_SECONDS : EXAM_SECTION_MINUTES;
  const unit = row.testMode ? 1000 : 60_000;
  const now = Date.now();
  const sections: ExamSessionState["sections"] = {};
  const answers = row.answers as Record<string, unknown>;
  for (const s of SECTION_ORDER) {
    if (s === row.currentSection && !row.submittedAt) {
      const start = row.sectionStartTime ?? row.examStartTime;
      const remaining = Math.max(0, start + table[exam][s] * unit - now);
      sections[s] = { section: s, remainingMs: remaining, exhausted: remaining === 0, startedAt: start };
    } else if (answers[s]) {
      sections[s] = { section: s, startedAt: null, remainingMs: null };
    }
  }
  return {
    sessionId: row.id,
    exam,
    currentSection: row.currentSection as Section,
    examStartTime: row.examStartTime,
    sections,
    timedOut: row.timedOut as string[],
    submitted: row.submittedAt != null,
    testMode: !!row.testMode,
  };
}
