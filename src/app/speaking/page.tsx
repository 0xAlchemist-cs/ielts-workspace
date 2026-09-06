import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT, speakingAttempts } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
import { getUserChunks } from "@/server/services/bank";
import { genericSpeakingPrompts, shadowingSentences } from "@/lib/banks";
import { isLiveConfigured } from "@/lib/ai";
import { SpeakingLab } from "./lab";

export default async function SpeakingPage() {
  const cu = await requireUser();
  const mission = await getOrCreateTodayMission(cu.user.id);

  const requiredChunks = mission.plan.speaking.requiredChunkIds.length
    ? await db.select().from(chunksT).where(inArray(chunksT.id, mission.plan.speaking.requiredChunkIds))
    : (await getUserChunks(cu.user.id)).slice(0, 2);

  const history = await db
    .select({
      id: speakingAttempts.id,
      prompt: speakingAttempts.prompt,
      transcript: speakingAttempts.transcript,
      ieltsScores: speakingAttempts.ieltsScores,
      createdAt: speakingAttempts.createdAt,
    })
    .from(speakingAttempts)
    .where(eq(speakingAttempts.userId, cu.user.id))
    .orderBy(desc(speakingAttempts.createdAt))
    .limit(5);

  return (
    <SpeakingLab
      aiLive={isLiveConfigured()}
      missionPrompt={mission.plan.speaking.prompt}
      isMissionStepDone={mission.plan.speaking.status === "done"}
      requiredChunks={requiredChunks.map((c) => ({ id: c.id, text: c.text, meaningZh: c.meaningZh }))}
      extraPrompts={genericSpeakingPrompts}
      shadowingSentences={shadowingSentences}
      history={history.map((h) => ({
        id: h.id,
        prompt: h.prompt,
        overall: (h.ieltsScores as { fluency?: number } | null)?.fluency ?? null,
        date: h.createdAt,
      }))}
    />
  );
}
