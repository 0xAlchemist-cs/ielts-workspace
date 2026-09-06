import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { externalSessions } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
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

  return (
    <ExternalCoachView
      coaches={EXTERNAL_COACHES}
      missionId={mission.id}
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
