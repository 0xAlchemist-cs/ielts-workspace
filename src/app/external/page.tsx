import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { externalSessions } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
import { getTodaysExpression } from "@/server/services/todays-expression";
import { buildLearningMemory } from "@/server/services/learning-memory";
import { personalizeSpeakingTask, speakingTaskFor } from "@/lib/ai/prompts/speaking-tasks";
import { examConfig } from "@/lib/exam-profiles";
import { EXTERNAL_COACHES } from "@/lib/external-coaches";
import { ExternalCoachView } from "./view";

export default async function ExternalPage() {
  const cu = await requireUser();
  const mission = await getOrCreateTodayMission(cu.user.id);

  const sessions = await db
    .select()
    .from(externalSessions)
    .where(eq(externalSessions.userId, cu.user.id))
    .orderBy(desc(externalSessions.createdAt))
    .limit(10);

  // V9: today's speaking task — IELTS profiles only, built from the CEFR
  // level and the learner's current weak expression; V11: learning memory
  // biases the question type (recognise-but-not-produce → reason questions)
  let speaking: { level: string; focusEn: string; focusZh: string; prompt: string; weakExpression: string | null } | null = null;
  if (examConfig(cu.user.examProfile).hasSpeakingCoach) {
    const [expr, memory] = await Promise.all([
      getTodaysExpression(cu.user.id),
      buildLearningMemory(cu.user.id),
    ]);
    const task = speakingTaskFor(cu.profile.cefr);
    const preferTag = memory.patterns.some((p) => p.patternId === "recognise_not_produce") ? "reason" : undefined;
    speaking = {
      level: cu.profile.cefr,
      focusEn: task.focusEn,
      focusZh: task.focusZh,
      prompt: personalizeSpeakingTask(task, expr?.title ?? null, preferTag),
      weakExpression: expr?.title ?? null,
    };
  }

  return (
    <ExternalCoachView
      coaches={EXTERNAL_COACHES}
      missionId={mission.id}
      speaking={speaking}
      sessions={sessions.map((s) => ({
        id: s.id,
        skill: s.skill,
        durationMinutes: s.durationMinutes,
        difficulty: s.difficulty,
        selfAssessment: s.selfAssessment,
        struggledWith: s.struggledWith,
        createdAt: s.createdAt,
      }))}
    />
  );
}
