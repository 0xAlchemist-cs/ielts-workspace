import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { selectAdaptiveTask, evaluateAttempt, getBandGaps, seedIeltsTasks } from "@/server/services/ielts-engine";
import { badRequest, readJsonBody } from "@/lib/request";
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

  const body = await readJsonBody<{
    taskId?: unknown;
    mode?: unknown;
    responses?: unknown;
    durationMinutes?: unknown;
  }>(req);

  const taskId = body?.taskId;
  if (typeof taskId !== "number" || !Number.isInteger(taskId) || taskId <= 0) {
    return badRequest("taskId required (positive integer)");
  }

  let responses: Record<string, unknown> = {};
  if (body?.responses !== undefined) {
    if (typeof body.responses !== "object" || body.responses === null || Array.isArray(body.responses)) {
      return badRequest("responses required (object keyed by question id)");
    }
    if (JSON.stringify(body.responses).length > 20_000) {
      return badRequest("responses too large (≤ 20000 chars)");
    }
    responses = body.responses as Record<string, unknown>;
  }

  const durationMinutes =
    typeof body?.durationMinutes === "number" && Number.isFinite(body.durationMinutes)
      ? Math.min(Math.max(Math.round(body.durationMinutes), 0), 600)
      : 0;

  try {
    const result = await evaluateAttempt({
      userId,
      taskId,
      mode: (body?.mode === "exam" ? "exam" : "learning") as IeltsMode,
      responses,
      durationMinutes,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = (err as Error).message || "evaluation failed";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
