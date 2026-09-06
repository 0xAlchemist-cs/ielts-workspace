import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { selectAdaptiveTask, evaluateAttempt, getBandGaps, seedIeltsTasks } from "@/server/services/ielts-engine";
import type { IeltsMode } from "@/lib/types";

/** GET /api/ielts/task — adaptive task selection */
export async function GET(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") === "exam" ? "exam" : "learning") as IeltsMode;

  const { task, reason, targetChunks } = await selectAdaptiveTask(userId, mode);
  return NextResponse.json({ task, reason, targetChunks, mode });
}

/** POST /api/ielts/task — submit attempt for evaluation */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json()) as {
    taskId?: number;
    mode?: string;
    responses?: unknown;
    durationMinutes?: number;
  };
  if (!body.taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const result = await evaluateAttempt({
    userId,
    taskId: body.taskId,
    mode: (body.mode === "exam" ? "exam" : "learning") as IeltsMode,
    responses: body.responses ?? {},
    durationMinutes: body.durationMinutes ?? 0,
  });

  return NextResponse.json(result);
}
