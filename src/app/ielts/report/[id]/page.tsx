import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ieltsAttempts, ieltsTasks } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { IeltsReportView } from "./view";

export const dynamic = "force-dynamic";

/* ── External reading report — an imported IELTSCB attempt with official
 *    explanations, evidence and synonym mapping. The learner answers on the
 *    external site; this page is where the misses become visible. */

interface ExplanationPayload {
  examId?: string;
  title?: string;
  officialGuide?: string | null;
  synonyms?: { questionNumber: number | null; questionWord: string; passageWords: string }[];
  coreWords?: { text: string; note: string | null }[];
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

  return (
    <IeltsReportView
      attemptId={attempt.id}
      title={task.prompt.match(/"([^"]+)"/)?.[1] ?? "Reading report"}
      breadcrumb={responses.external?.rightNumText ?? null}
      sourceUrl={responses.external?.url ?? null}
      createdAt={attempt.createdAt}
      score={attempt.score}
      band={attempt.band}
      bandBasis={responses.external?.bandBasis ?? null}
      durationSeconds={responses.external?.durationSeconds ?? null}
      rightNumText={responses.external?.rightNumText ?? null}
      passageText={task.content ?? ""}
      officialGuide={explanations?.officialGuide ?? null}
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
