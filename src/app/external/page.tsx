import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { externalSessions } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
import { getTodaysExpression } from "@/server/services/todays-expression";
import { personalizeSpeakingTask, speakingTaskFor } from "@/lib/ai/prompts/speaking-tasks";
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
  // level and the learner's current weak expression
  let speaking: { level: string; focusEn: string; focusZh: string; prompt: string; weakExpression: string | null } | null = null;
  if (cu.user.examProfile === "ielts") {
    const expr = await getTodaysExpression(cu.user.id);
    const task = speakingTaskFor(cu.profile.cefr);
    speaking = {
      level: cu.profile.cefr,
      focusEn: task.focusEn,
      focusZh: task.focusZh,
      prompt: personalizeSpeakingTask(task, expr?.title ?? null),
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
