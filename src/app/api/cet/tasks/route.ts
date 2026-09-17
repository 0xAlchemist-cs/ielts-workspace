import { NextResponse } from "next/server";
import { getUserIdOrNull, getActiveExam } from "@/server/current-user";
import { loadCetTasks, submitCetAttempt } from "@/server/services/cet-engine";
import { badRequest, readJsonBody } from "@/lib/request";

/** GET /api/cet/tasks?section=reading — tasks for the ACTIVE exam only. */
export async function GET(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const exam = await getActiveExam();
  if (exam !== "cet4" && exam !== "cet6") {
    return badRequest("CET practice is only available under a CET goal.");
  }
  const url = new URL(req.url);
  const section = url.searchParams.get("section");
  const valid = ["writing", "listening", "reading", "translation"];
  if (section && !valid.includes(section)) return badRequest("invalid section");
  const tasks = await loadCetTasks(
    exam,
    section && valid.includes(section) ? (section as "writing" | "listening" | "reading" | "translation") : undefined,
  );
  return NextResponse.json({ exam, tasks });
}

/** POST /api/cet/tasks — submit an attempt (grading + evidence emission). */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const exam = await getActiveExam();
  if (exam !== "cet4" && exam !== "cet6") {
    return badRequest("CET practice is only available under a CET goal.");
  }
  const body = await readJsonBody<{ taskId?: unknown; mode?: unknown; responses?: unknown; freeText?: unknown }>(req);
  const taskId = body?.taskId;
  const mode = body?.mode === "exam" ? "exam" : "learning";
  if (typeof taskId !== "number" || !Number.isInteger(taskId) || taskId <= 0) {
    return badRequest("taskId required (positive integer)");
  }
  const responses =
    body?.responses && typeof body.responses === "object" && !Array.isArray(body.responses)
      ? Object.fromEntries(
          Object.entries(body.responses as Record<string, unknown>)
            .filter(([k, v]) => /^\d{1,3}$/.test(k) && typeof v === "string" && v.length <= 500)
            .map(([k, v]) => [k, v as string]),
        )
      : {};
  const freeText = typeof body?.freeText === "string" ? body.freeText.slice(0, 5000) : undefined;
  try {
    const result = await submitCetAttempt({ userId, taskId, mode, responses, freeText });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 160) }, { status: 404 });
  }
}
