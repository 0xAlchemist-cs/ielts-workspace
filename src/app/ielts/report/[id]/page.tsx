import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { errors as errorsT, ieltsAttempts, ieltsTasks } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { IeltsReportView } from "./view";

export const dynamic = "force-dynamic";

/* ── External reading report — an imported IELTSCB attempt with official
 *    explanations, evidence and synonym mapping. The learner answers on the
 *    external site; this page is where the misses become visible.
 *    V14.1: attempt history across re-tests of the same passage (same task,
 *    different tid) + cross-attempt 掌握/持续错误 analysis. Question rows are
 *    static source data; attempts are user behaviour and never overwritten. */

interface ExplanationPayload {
  examId?: string;
  title?: string;
  officialGuide?: string | null;
  synonyms?: { questionNumber: number | null; questionWord: string; passageWords: string }[];
  coreWords?: { text: string; note: string | null }[];
  passageDisplay?: { label: string | null; sentences: { text: string; tags: string[] }[] }[];
  questionExplanations?: {
    questionNumber: number;
    answer: string | null;
    guide: string | null;
    evidenceEn: string | null;
    evidenceZh: string | null;
    reasoning: string | null;
    paraphrase: string | null;
    paraphrases: { questionWord: string; passageWords: string }[];
    evidence: { paragraphLabel: string; sentenceId: string | null; text: string }[];
  }[];
}

interface AttemptProgressRow {
  attemptId: number;
  createdAt: number;
  correct: number;
  incorrect: number;
  score: number | null;
  durationSeconds: number | null;
  perQuestion: Record<number, boolean>; // question number → correct?
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const cu = await requireUser();
  const userId = cu.user.id;
  const { id } = await params;
  const attemptId = Number(id);
  if (!Number.isInteger(attemptId) || attemptId <= 0) notFound();

  const [attempt] = await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== userId) notFound();

  const [task] = await db.select().from(ieltsTasks).where(eq(ieltsTasks.id, attempt.taskId)).limit(1);
  if (!task || task.source !== "ieltscb") notFound();

  const responses = (attempt.responses ?? {}) as {
    taskSkill?: string;
    source?: string;
    external?: { url?: string; rightNumText?: string | null; durationSeconds?: number | null; bandBasis?: string };
    answers?: Record<string, string>;
  };
  if (responses.source !== "ieltscb") notFound();

  const questions = (task.questions ?? []) as {
    question: string;
    answer: string;
    options?: string[];
    subSkill: string;
    acceptable?: string[];
  }[];
  const subSkills = (attempt.subSkillResults ?? []) as { skill: string; correct: boolean; note: string }[];
  const explanations = (task.explanations ?? null) as ExplanationPayload | null;

  /* ── attempt history: same test (task), every imported session ─────────── */
  const history = await db
    .select()
    .from(ieltsAttempts)
    .where(and(eq(ieltsAttempts.userId, userId), eq(ieltsAttempts.taskId, task.id)))
    .orderBy(asc(ieltsAttempts.createdAt));

  const attemptsProgress: AttemptProgressRow[] = history.map((a) => {
    const subs = (a.subSkillResults ?? []) as { correct: boolean }[];
    const perQuestion: Record<number, boolean> = {};
    subs.forEach((s, i) => {
      perQuestion[i + 1] = !!s.correct;
    });
    const ext = ((a.responses ?? {}) as { external?: { durationSeconds?: number | null } }).external ?? {};
    return {
      attemptId: a.id,
      createdAt: a.createdAt,
      correct: subs.filter((s) => s.correct).length,
      incorrect: subs.filter((s) => !s.correct).length,
      score: a.score,
      durationSeconds: ext.durationSeconds ?? null,
      perQuestion,
    };
  });

  // cross-attempt analysis (needs ≥2 attempts): 持续错误 = wrong in every
  // attempt that graded it; 已掌握 = wrong earlier + correct in the latest
  const persistentWrong: number[] = [];
  const mastered: number[] = [];
  if (attemptsProgress.length >= 2) {
    const latest = attemptsProgress[attemptsProgress.length - 1];
    for (let n = 1; n <= questions.length; n++) {
      const wrongIn = attemptsProgress.filter((ap) => ap.perQuestion[n] === false);
      const rightIn = attemptsProgress.filter((ap) => ap.perQuestion[n] === true);
      const seenCount = attemptsProgress.filter((ap) => n in ap.perQuestion).length;
      if (seenCount >= 2 && wrongIn.length >= 1 && rightIn.length === 0) persistentWrong.push(n);
      if (latest.perQuestion[n] === true && wrongIn.length >= 1) mastered.push(n);
    }
  }

  /* review candidates: which synonym pairs from this import are already in
     the Error Bank (→ the existing review queue picks them up). V15.1: also
     carry the error id so each wrong question can deep-link into practice. */
  const bankedRows = await db
    .select({ id: errorsT.id, w: errorsT.wrongForm })
    .from(errorsT)
    .where(and(eq(errorsT.userId, userId), eq(errorsT.sourceModule, "ieltscb_reading")));
  const banked = new Set(bankedRows.map((r) => r.w));
  const practiceByWrongForm = new Map(bankedRows.map((r) => [r.w, r.id]));

  return (
    <IeltsReportView
      attemptId={attempt.id}
      title={task.prompt.match(/"([^"]+)"/)?.[1] ?? "Reading report"}
      sourceUrl={responses.external?.url ?? null}
      createdAt={attempt.createdAt}
      score={attempt.score}
      band={attempt.band}
      bandBasis={responses.external?.bandBasis ?? null}
      durationSeconds={responses.external?.durationSeconds ?? null}
      rightNumText={responses.external?.rightNumText ?? null}
      totalQuestions={questions.length}
      officialGuide={explanations?.officialGuide ?? null}
      passageDisplay={explanations?.passageDisplay ?? []}
      attemptHistory={attemptsProgress}
      persistentWrong={persistentWrong}
      mastered={mastered}
      bankedWrongForms={banked}
      practiceByWrongForm={Object.fromEntries(practiceByWrongForm)}
      questions={questions.map((q, i) => ({
        number: i + 1,
        type: q.subSkill,
        questionText: q.question,
        options: q.options ?? [],
        correctAnswer: q.answer,
        acceptedAnswers: q.acceptable ?? [],
        userAnswer: responses.answers?.[String(i)] ?? "",
        isCorrect: subSkills[i]?.correct ?? null,
        explanation: explanations?.questionExplanations?.find((e) => e.questionNumber === i + 1) ?? null,
      }))}
      synonyms={explanations?.synonyms ?? []}
      coreWords={explanations?.coreWords ?? []}
    />
  );
}
