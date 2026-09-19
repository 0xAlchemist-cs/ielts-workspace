import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";
import { submitWrongPractice } from "@/server/services/wrong-practice";

/** POST /api/wrong-practice/submit {sessionId, errorId, stage, response} —
 *  one engine-graded attempt (correct/partial/incorrect). Duplicate stages
 *  and out-of-order transfers are rejected; the original error is untouched. */

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ sessionId?: unknown; errorId?: unknown; stage?: unknown; response?: unknown }>(req);
  const { sessionId, errorId, stage, response } = {
    sessionId: body?.sessionId,
    errorId: body?.errorId,
    stage: body?.stage,
    response: body?.response,
  };
  if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 64) {
    return badRequest("sessionId (8-64 chars) required");
  }
  if (typeof errorId !== "number" || !Number.isInteger(errorId) || errorId <= 0) {
    return badRequest("errorId (positive int) required");
  }
  if (stage !== "retrieval" && stage !== "transfer") return badRequest("stage must be 'retrieval' or 'transfer'");
  if (typeof response !== "string" || !response.trim()) return badRequest("response required");
  if (response.length > 1000) return badRequest("response too long");

  const result = await submitWrongPractice(userId, sessionId, errorId, stage, response.trim());
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.code, message: result.message }, { status });
  }
  return NextResponse.json(result);
}
