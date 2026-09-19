import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";
import { startWrongPractice } from "@/server/services/wrong-practice";

/** POST /api/wrong-practice/start {errorId} — begin a two-stage practice
 *  session for one Error-Bank row. Returns WHY + two fresh contexts; the
 *  correct form is never sent to the client before grading. */

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ errorId?: unknown }>(req);
  const errorId = body?.errorId;
  if (typeof errorId !== "number" || !Number.isInteger(errorId) || errorId <= 0) {
    return badRequest("errorId (positive int) required");
  }
  const started = await startWrongPractice(userId, errorId);
  if (!started.ok) return NextResponse.json({ error: started.code, message: started.message }, { status: 404 });
  return NextResponse.json(started);
}
