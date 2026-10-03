/* ── IELTSCB import service — preview (no writes) and confirm (task +
 *    attempt + registry + error routing). The imported report becomes
 *    ordinary ielts_tasks/ielts_attempts rows, so every existing consumer
 *    (readiness, memory, error bank, priority engine) works unchanged. */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ieltscbImports, ieltsAttempts, ieltsTasks } from "@/db/schema";
import { fetchIeltscbReport } from "@/lib/ieltscb/client";
import { adaptIeltscbReport, buildImportDiagnostics, buildPassageDisplay } from "@/lib/ieltscb/adapter";
import { parseIeltscbReportUrl, type IeltscbReportParams } from "@/lib/ieltscb/url";
import { htmlAnswerIsCorrect, parseIeltscbHtmlReport } from "@/lib/ieltscb/html-report";
import { IELTSCB_PARSER_VERSION, type CanonicalQuestion, type CanonicalReadingTest, type IeltscbImportPreview, type IeltscbReportData } from "@/lib/ieltscb/types";
import { addError } from "./bank";

/* Official Cambridge Academic Reading raw→band table (40-question scale).
 * A single passage is scaled to 40 — an honest per-passage band ESTIMATE,
 * noted in attempt metadata; full-test bands need all three passages. */
const AC_READING_BANDS: { min: number; band: number }[] = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 }, { min: 33, band: 7.5 },
  { min: 30, band: 7 }, { min: 27, band: 6.5 }, { min: 23, band: 6 }, { min: 19, band: 5.5 },
  { min: 15, band: 5 }, { min: 13, band: 4.5 }, { min: 10, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 2 },
];

function passageBand(correct: number, total: number): number {
  const scaled = Math.round((correct / Math.max(1, total)) * 40);
  for (const row of AC_READING_BANDS) if (scaled >= row.min) return row.band;
  return 2;
}

export type IeltscbPreviewResult =
  | { ok: true; preview: IeltscbImportPreview; raw: unknown }
  | { ok: false; code: string; message: string };

/** Fetch + adapt + duplicate-check. Never writes. `rawOverride` bypasses the
 *  network for server-side tests/scripts only — the API routes never pass it. */
export async function buildIeltscbPreview(url: string, opts?: { raw?: unknown; userId?: number }): Promise<IeltscbPreviewResult> {
  const parsed = parseIeltscbReportUrl(url);
  if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message };
  const params = parsed.params;

  let data: IeltscbReportData;
  let fetchMeta: { ok: boolean; httpStatus?: number; code?: string } | null = null;
  let importDurationMs: number | null = null;
  if (opts?.raw !== undefined) {
    data = opts.raw as IeltscbReportData;
  } else {
    const t0 = Date.now();
    const fetched = await fetchIeltscbReport(params);
    importDurationMs = Date.now() - t0;
    if (!fetched.ok) {
      return { ok: false, code: fetched.code, message: fetched.message };
    }
    fetchMeta = { ok: true, httpStatus: 200 };
    data = fetched.data;
  }

  const { test } = adaptIeltscbReport(data, params, url.trim());
  if (!test.questions.length) {
    return { ok: false, code: "MISSING_QUESTIONS", message: "The report contains no questions." };
  }
  if (!test.passage.paragraphs.length) {
    return { ok: false, code: "MISSING_PASSAGE", message: "The report contains no passage." };
  }

  // V14.1 §2: response hash (raw body) + per-stage diagnostics — no credentials
  // exist to leak (the client sends none by design)
  const responseHash = createHash("sha256").update(JSON.stringify(data ?? {})).digest("hex");
  const diagnostics = buildImportDiagnostics(test, fetchMeta, { responseHash, importDurationMs });

  const existing = await findExistingImport(params, opts?.userId);
  const preview: IeltscbImportPreview = {
    ...test,
    existing: existing
      ? {
          taskId: existing.taskId,
          importRowId: existing.id,
          importedAt: existing.createdAt,
          sameReport: existing.tid === params.tid,
          attemptId: existing.attemptId,
        }
      : null,
    parserVersion: IELTSCB_PARSER_VERSION,
    diagnostics,
  };
  return { ok: true, preview, raw: data };
}

/** Duplicate detection is PER USER: imports are personal learning history —
 *  one user's import of a passage must never collide with another's. */
async function findExistingImport(params: IeltscbReportParams, userId?: number) {
  const scope = userId != null ? [eq(ieltscbImports.userId, userId)] : [];
  // exact report (same tid) first, then any import of the same test material
  const [sameReport] = await db
    .select()
    .from(ieltscbImports)
    .where(
      and(
        ...scope,
        eq(ieltscbImports.chaptersId, params.chaptersId),
        eq(ieltscbImports.paperId, params.paperId),
        eq(ieltscbImports.pType, params.pType),
        eq(ieltscbImports.tid, params.tid),
      ),
    )
    .limit(1);
  if (sameReport) return sameReport;
  const [sameTest] = await db
    .select()
    .from(ieltscbImports)
    .where(
      and(
        ...scope,
        eq(ieltscbImports.chaptersId, params.chaptersId),
        eq(ieltscbImports.paperId, params.paperId),
        eq(ieltscbImports.pType, params.pType),
      ),
    )
    .limit(1);
  return sameTest ?? null;
}

export type IeltscbConfirmResult =
  | {
      ok: true;
      action: "imported" | "attempt-added" | "updated";
      taskId: number;
      attemptId: number | null;
      warnings: unknown[];
    }
  | { ok: false; code: string; message: string };

/** Confirm writes the canonical data into the existing engine tables.
 *  - new material → ielts_tasks row (source "ieltscb") + attempt + registry
 *  - same material re-tested (new tid) → NEW attempt on the existing task
 *    (this is the growth story: same passage, new performance)
 *  - exact same report (same tid) → update official material only; user
 *    attempt history is never overwritten (per spec §23) */
export async function confirmIeltscbImport(
  userId: number,
  url: string,
  opts?: { raw?: unknown },
): Promise<IeltscbConfirmResult> {
  const previewRes = await buildIeltscbPreview(url, { raw: opts?.raw, userId });
  if (!previewRes.ok) return previewRes;
  const test = previewRes.preview;
  const raw = previewRes.raw;
  const params = test.externalKey;
  const rawHash = createHash("sha256").update(JSON.stringify(raw ?? {})).digest("hex");

  const existing = await findExistingImport(params, userId);

  /* ── case: exact same report session → material update only ─────────── */
  if (existing && existing.tid === params.tid) {
    await db
      .update(ieltscbImports)
      .set({
        parserVersion: IELTSCB_PARSER_VERSION,
        rawSnapshot: raw,
        canonical: test,
        importWarnings: test.warnings,
        title: test.title,
        breadcrumb: test.breadcrumb,
        rawHash,
        updatedAt: Date.now(),
      })
      .where(eq(ieltscbImports.id, existing.id));
    await updateTaskMaterial(existing.taskId, test);
    return {
      ok: true,
      action: "updated",
      taskId: existing.taskId,
      attemptId: existing.attemptId,
      warnings: test.warnings,
    };
  }

  /* ── ensure the task row exists (new material → create) ──────────────── */
  let taskId: number;
  let createdTaskId: number | null = null; // for compensating cleanup on failure
  if (existing) {
    taskId = existing.taskId;
    await updateTaskMaterial(taskId, test);
  } else {
    const [task] = await db
      .insert(ieltsTasks)
      .values({
        taskType: "reading_passage",
        skill: "reading",
        difficulty: 3,
        topic: "general",
        prompt: `Read the passage "${test.title}" and answer ${test.questions.length} questions. (${test.breadcrumb ?? "IELTSCB import"})`,
        content: passageTextOf(test),
        questions: questionsPayloadOf(test),
        explanations: buildExplanationsPayload(test),
        source: "ieltscb",
      })
      .returning();
    taskId = task.id;
    createdTaskId = task.id;
  }

  /* ── writes from here on: on failure, undo what THIS call created so a
   *    retry starts clean (multi-row insert without a wrapping transaction) */
  let attemptId: number | null = null;
  try {
    attemptId = await writeAttemptAndRegistry(userId, test, raw, rawHash, params, existing, taskId);
  } catch (e) {
    if (createdTaskId != null) {
      await db.delete(ieltsAttempts).where(eq(ieltsAttempts.taskId, createdTaskId));
      await db.delete(ieltscbImports).where(eq(ieltscbImports.taskId, createdTaskId));
      await db.delete(ieltsTasks).where(eq(ieltsTasks.id, createdTaskId));
    }
    throw e;
  }

  return {
    ok: true,
    action: existing ? "attempt-added" : "imported",
    taskId,
    attemptId,
    warnings: test.warnings,
  };
}

/** attempt + registry writes shared by the import / re-test paths. */
async function writeAttemptAndRegistry(
  userId: number,
  test: CanonicalReadingTest,
  raw: unknown,
  rawHash: string,
  params: IeltscbReportParams,
  existing: Awaited<ReturnType<typeof findExistingImport>>,
  taskId: number,
): Promise<number | null> {

  /* ── attempt row: the external session, officially graded ────────────── */
  const graded = test.questions.filter((q) => q.isCorrect != null);
  const correctCount = graded.filter((q) => q.isCorrect === true).length;
  const total = graded.length;
  const score = total ? Math.round((correctCount / total) * 100) : null;
  const band = total ? passageBand(correctCount, total) : null;

  const subSkillResults = test.questions.map((q) => ({
    skill: q.type,
    correct: q.isCorrect === true,
    note: q.isCorrect === false ? `Expected: "${q.correctAnswer}", got: "${q.userAnswer || "(blank)"}"` : "",
  }));

  const strategyIssues: string[] = [];
  for (const q of test.questions) {
    if (q.isCorrect !== false) continue;
    if (!q.userAnswer) strategyIssues.push(`Q${q.number}: left blank — possible time management issue`);
    else if (!q.paraphrases.length) strategyIssues.push(`Q${q.number} (${q.type}): missed — see official guide`);
  }

  const durationMinutes = test.summary.durationSeconds ? Math.round(test.summary.durationSeconds / 60) : 0;

  const [attempt] = await db
    .insert(ieltsAttempts)
    .values({
      userId,
      taskId,
      mode: "exam",
      responses: {
        taskSkill: "reading",
        source: "ieltscb",
        external: {
          url: test.sourceUrl,
          tid: params.tid,
          paperId: params.paperId,
          chaptersId: params.chaptersId,
          pType: params.pType,
          classify: params.classify,
          rightNumText: test.summary.rightNumText,
          durationSeconds: test.summary.durationSeconds,
          bandBasis:
            test.summary.totalQuestions >= 40
              ? "Practice Reading Estimate — full 40-question test"
              : "passage practice reference — scaled to the 40-question Cambridge AC table; not an official IELTS band",
        },
        answers: Object.fromEntries(test.questions.map((q) => [String(q.number - 1), q.userAnswer ?? ""])),
      },
      score,
      band,
      subSkillResults,
      transferResults: [],
      strategyIssues,
      languageErrors: [],
      durationMinutes,
    })
    .returning();

  /* ── registry row (new material) or attempt-pointer update (re-test) ─── */
  if (existing) {
    await db
      .update(ieltscbImports)
      .set({
        attemptId: attempt.id,
        tid: params.tid,
        sourceUrl: test.sourceUrl,
        parserVersion: IELTSCB_PARSER_VERSION,
        rawSnapshot: raw,
        canonical: test,
        importWarnings: test.warnings,
        rawHash,
        updatedAt: Date.now(),
      })
      .where(eq(ieltscbImports.id, existing.id));
  } else {
    await db.insert(ieltscbImports).values({
      userId,
      taskId,
      attemptId: attempt.id,
      paperId: params.paperId,
      chaptersId: params.chaptersId,
      pType: params.pType,
      tid: params.tid,
      classify: params.classify,
      sourceUrl: test.sourceUrl,
      title: test.title,
      breadcrumb: test.breadcrumb,
      parserVersion: IELTSCB_PARSER_VERSION,
      rawHash,
      rawSnapshot: raw,
      canonical: test,
      importWarnings: test.warnings,
    });
  }

  /* ── wrong answers → existing Error Bank (synonym pairs are the gold) ── */
  await routeIeltscbErrors(userId, test.questions);
  return attempt.id;
}

function passageTextOf(test: CanonicalReadingTest): string {
  return [test.passage.subtitle, ...test.passage.paragraphs.map((p) => `${p.label}. ${p.text}`)]
    .filter(Boolean)
    .join("\n\n");
}

function questionsPayloadOf(test: CanonicalReadingTest) {
  return test.questions.map((q) => ({
    question: q.questionText || `Question ${q.number}`,
    answer: q.correctAnswer,
    options: q.options,
    subSkill: q.type,
    acceptable: q.acceptedAnswers,
  }));
}

/** Regenerate the task's questions/explanations from fresh canonical data —
 *  user attempt rows are separate and untouched. */
async function updateTaskMaterial(taskId: number, test: CanonicalReadingTest) {
  await db
    .update(ieltsTasks)
    .set({
      prompt: `Read the passage "${test.title}" and answer ${test.questions.length} questions. (${test.breadcrumb ?? "IELTSCB import"})`,
      content: passageTextOf(test),
      questions: questionsPayloadOf(test),
      explanations: buildExplanationsPayload(test),
    })
    .where(eq(ieltsTasks.id, taskId));
}

/** explanations payload in the shape the reading bank already uses, plus the
 *  structured official fields + synonyms + evidence the report page reads.
 *  V14.1: passageDisplay carries sentence-level question tags for highlight. */
function buildExplanationsPayload(test: CanonicalReadingTest) {
  return {
    examId: `ieltscb-${test.externalKey.chaptersId}-${test.externalKey.paperId}`,
    title: test.title,
    source: "ieltscb",
    officialGuide: test.officialGuide,
    synonyms: test.synonyms,
    coreWords: test.coreWords,
    passageDisplay: buildPassageDisplay(test),
    questionExplanations: test.questions.map((q) => ({
      questionNumber: q.number,
      answer: q.explanation?.answer ?? `Answer: ${q.correctAnswer}`,
      guide: q.explanation?.officialGuide ?? null,
      evidenceEn: q.explanation?.evidenceEn ?? null,
      evidenceZh: q.explanation?.evidenceZh ?? null,
      reasoning: q.explanation?.officialReasoning ?? null,
      paraphrase: q.explanation?.officialParaphrase ?? null,
      paraphrases: q.paraphrases,
      evidence: q.evidence,
    })),
  };
}

/** Route wrong answers into the existing Error Bank: synonym-mapped misses
 *  become vocabulary paraphrase errors (the gold), others become
 *  ielts_specific notes. Capped like the engine does (3/attempt). */
export async function routeIeltscbErrors(userId: number, questions: CanonicalQuestion[]): Promise<number> {
  let routed = 0;
  for (const q of questions) {
    if (q.isCorrect !== false || routed >= 6) continue;
    for (const p of q.paraphrases.slice(0, 2)) {
      await addError(userId, {
        category: "vocabulary",
        wrongForm: p.questionWord,
        correctForm: p.passageWords,
        explanation: `Q${q.number} (${q.type}) — 官方同义替换考点: ${p.questionWord} = ${p.passageWords}`,
        sourceModule: "ieltscb_reading",
      });
      routed++;
    }
    if (!q.paraphrases.length && routed < 6) {
      await addError(userId, {
        category: "ielts_specific",
        wrongForm: `Q${q.number}: ${q.userAnswer || "(blank)"}`,
        correctForm: q.correctAnswer,
        explanation: `IELTSCB reading ${q.type} miss — official guide: ${q.explanation?.officialGuide?.slice(0, 80) ?? "n/a"}`,
        sourceModule: "ieltscb_reading",
      });
      routed++;
    }
  }
  return routed;
}

/* ── Saved-HTML import (V16.1) ─────────────────────────────────────────────
 *  Since ~Oct 2026 ieltscb renders reports from the login session and the
 *  report URL no longer carries a tid, so the server cannot fetch them. The
 *  user saves the rendered page (Ctrl+S) instead; we extract THIS attempt
 *  (answers + grading banner) and join it onto the canonical material of a
 *  previous API import of the same test (chapters_id+paper_id+p_type). */

export type IeltscbHtmlConfirmResult =
  | { ok: true; action: "attempt-added"; taskId: number; attemptId: number; reportUrl: string }
  | { ok: false; code: string; message: string };

export async function confirmIeltscbHtmlImport(userId: number, html: string): Promise<IeltscbHtmlConfirmResult> {
  const parsed = parseIeltscbHtmlReport(html);
  if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message };
  const report = parsed.report;

  /* Match the material by test key — tid deliberately ignored (HTML reports
   * carry none; every import of this test shares the material). */
  const [existing] = await db
    .select()
    .from(ieltscbImports)
    .where(
      and(
        eq(ieltscbImports.userId, userId),
        eq(ieltscbImports.chaptersId, report.params.chaptersId),
        eq(ieltscbImports.paperId, report.params.paperId),
        eq(ieltscbImports.pType, report.params.pType),
      ),
    )
    .limit(1);
  if (!existing) {
    return {
      ok: false,
      code: "MATERIAL_NOT_IMPORTED",
      message: "This passage's official material (questions/explanations) has never been imported via a live report link — a tid-capable import is needed once before saved-HTML attempts can be attached.",
    };
  }
  const canonical = existing.canonical as CanonicalReadingTest | null;
  if (!canonical || !Array.isArray(canonical.questions)) {
    return { ok: false, code: "MATERIAL_NOT_IMPORTED", message: "The stored import for this test has no canonical material." };
  }

  /* Merge: this HTML attempt's user answers/grading onto the official
   * material. correctAnswer cross-checked against the table (site truth
   * wins on mismatch — recorded as a warning, not a failure). */
  const byNumber = new Map(report.rows.map((r) => [r.number, r]));
  const warnings: string[] = [];
  const questions: CanonicalQuestion[] = canonical.questions.map((q) => {
    const row = byNumber.get(q.number);
    // no table row for this question at all → honest null (site didn't grade)
    if (!row) return { ...q, userAnswer: null, isCorrect: null };
    if (row.correctAnswer && q.correctAnswer && !htmlAnswerIsCorrect(row.correctAnswer, q.correctAnswer) && row.correctAnswer.toLowerCase() !== q.correctAnswer.toLowerCase()) {
      warnings.push(`Q${q.number}: HTML correct answer "${row.correctAnswer}" differs from imported material "${q.correctAnswer}"`);
    }
    const userAnswer = row.userAnswer || null;
    // a graded row with a blank answer = officially wrong (the site's 对/错
    // column marks blanks as errors — rightNumText counts them, so we do too)
    const isCorrect = userAnswer != null ? htmlAnswerIsCorrect(userAnswer, row.correctAnswer || q.correctAnswer) : false;
    return { ...q, userAnswer, isCorrect };
  });

  const graded = questions.filter((q) => q.isCorrect != null);
  const correctCount = graded.filter((q) => q.isCorrect === true).length;
  const total = graded.length;
  const score = total ? Math.round((correctCount / total) * 100) : null;
  const band = total ? passageBand(correctCount, total) : null;

  const subSkillResults = questions.map((q) => ({
    skill: q.type,
    correct: q.isCorrect === true,
    note: q.isCorrect === false ? `Expected: "${q.correctAnswer}", got: "${q.userAnswer || "(blank)"}"` : "",
  }));

  const strategyIssues: string[] = [];
  for (const q of questions) {
    if (q.isCorrect !== false) continue;
    if (!q.userAnswer) strategyIssues.push(`Q${q.number}: left blank — possible time management issue`);
    else if (!q.paraphrases.length) strategyIssues.push(`Q${q.number} (${q.type}): missed — see official guide`);
  }

  const durationMinutes = report.stats.durationSeconds ? Math.round(report.stats.durationSeconds / 60) : 0;

  const [attempt] = await db
    .insert(ieltsAttempts)
    .values({
      userId,
      taskId: existing.taskId,
      mode: "exam",
      responses: {
        taskSkill: "reading",
        source: "ieltscb",
        external: {
          url: report.sourceUrl ?? existing.sourceUrl,
          via: "saved-html",
          paperId: report.params.paperId,
          chaptersId: report.params.chaptersId,
          pType: report.params.pType,
          classify: report.params.classify,
          rightNumText: report.stats.rightCount != null ? `${report.stats.rightCount}/${report.stats.totalQuestions}` : null,
          durationSeconds: report.stats.durationSeconds,
          bandBasis:
            canonical.summary.totalQuestions >= 40
              ? "Practice Reading Estimate — full 40-question test"
              : "passage practice reference — scaled to the 40-question Cambridge AC table; not an official IELTS band",
          mergeWarnings: warnings,
        },
        answers: Object.fromEntries(questions.map((q) => [String(q.number - 1), q.userAnswer ?? ""])),
      },
      score,
      band,
      subSkillResults,
      transferResults: [],
      strategyIssues,
      languageErrors: [],
      durationMinutes,
    })
    .returning();

  /* Registry: newest attempt pointer only — tid/rawSnapshot/canonical keep
   * the original API import (the material source of truth). */
  await db
    .update(ieltscbImports)
    .set({ attemptId: attempt.id, updatedAt: Date.now() })
    .where(eq(ieltscbImports.id, existing.id));

  await routeIeltscbErrors(userId, questions);

  return { ok: true, action: "attempt-added", taskId: existing.taskId, attemptId: attempt.id, reportUrl: `/ielts/report/${attempt.id}` };
}
