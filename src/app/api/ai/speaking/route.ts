import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT } from "@/db/schema";
import { getProvider } from "@/lib/ai";
import { getUserIdOrNull } from "@/server/current-user";
import { addError, recentErrors } from "@/server/services/bank";
import { logChunkEvent, markChunkActivated } from "@/server/services/events";
import { saveSpeakingAction } from "@/app/actions";
import { bumpMissionSpeakingRounds } from "@/server/services/mission";
import { readJsonBody, stringField, badRequest } from "@/lib/request";
import type { ErrorCategory } from "@/lib/types";

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{
    prompt?: unknown;
    transcript?: unknown;
    requiredChunkIds?: number[];
    round?: number;
    missionSpeaking?: boolean;
    ielts?: boolean;
  }>(req);
  const prompt = stringField(body, "prompt", 2000);
  const transcript = stringField(body, "transcript", 20_000);
  if (!prompt || !transcript) {
    return badRequest(body == null ? "invalid JSON body" : "prompt and transcript required (≤ 2000 / 20000 chars)");
  }

  const chunkRows = Array.isArray(body?.requiredChunkIds) && body.requiredChunkIds.length
    ? await db
        .select()
        .from(chunksT)
        .where(and(inArray(chunksT.id, body.requiredChunkIds), eq(chunksT.userId, userId)))
    : [];
  const targetChunks = chunkRows.map((c) => c.text);
  const recent = await recentErrors(userId, 5);

  const feedback = await getProvider().speaking({
    prompt,
    transcript,
    targetChunks,
    recentErrors: recent,
  });

  // Auto-bank significant corrections (P1/P2) into the Error Bank — but never
  // register/style rephrasing suggestions: they are preferences, not mistakes.
  for (const c of feedback.corrections) {
    if ((c.priority === "P1" || c.priority === "P2") && c.kind !== "register" && c.kind !== "style") {
      await addError(userId, {
        category: (c.priority === "P2" && /preposition|collocation/i.test(c.explanation)
          ? "preposition"
          : "grammar") as ErrorCategory,
        wrongForm: c.original,
        correctForm: c.improved,
        explanation: c.explanation,
        source: "ai",
        sourceModule: "speaking",
        severity: c.priority === "P1" ? "high" : "medium",
      });
    }
  }

  const usedChunkIds = chunkRows
    .filter((c) => feedback.chunksUsed.some((u) => u.text === c.text && u.used))
    .map((c) => c.id);

  // Real output use = activation + event ledger (speaking vs IELTS context)
  const isIelts = body?.ielts === true;
  const missionSpeaking = body?.missionSpeaking === true;
  const round = typeof body?.round === "number" ? body.round : 1;
  for (const id of usedChunkIds) {
    await logChunkEvent(userId, id, isIelts ? "ielts_use" : "speaking_use", isIelts ? prompt : "");
    await markChunkActivated(userId, id);
  }

  const attemptId = await saveSpeakingAction({
    prompt,
    transcript,
    feedback,
    ieltsScores: feedback.ielts,
    usedChunkIds,
    round,
    followUp: feedback.followUp,
  });

  if (missionSpeaking) await bumpMissionSpeakingRounds(userId);

  return NextResponse.json({ feedback, attemptId, usedChunkIds });
}
