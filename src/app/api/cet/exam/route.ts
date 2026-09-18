import { NextResponse } from "next/server";
import { getUserIdOrNull, getActiveExam } from "@/server/current-user";
import { startExamSession, getLiveExamSession, advanceSection } from "@/server/services/cet-exam-timer";
import { badRequest, readJsonBody } from "@/lib/request";

/** CET Exam-Mode session — server-clock timing.
 * GET  /api/cet/exam            → current live session (or null)
 * POST /api/cet/exam {phase:"start"|"advance"} → session state
 * All timestamps live in the DB; refresh/remount resume the same clock. */

export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const exam = await getActiveExam();
  if (exam !== "cet4" && exam !== "cet6") return NextResponse.json({ session: null });
  const session = await getLiveExamSession(userId, exam);
  return NextResponse.json({ session });
}

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const exam = await getActiveExam();
  if (exam !== "cet4" && exam !== "cet6") {
    return badRequest("CET exam mode is only available under a CET goal.");
  }
  const body = await readJsonBody<{
    phase?: unknown;
    testMode?: unknown;
    sessionId?: unknown;
    fromSection?: unknown;
    timedOut?: unknown;
    responses?: unknown;
    freeText?: unknown;
  }>(req);

  const phase = body?.phase;
  if (phase === "start") {
    const testMode = body?.testMode === true;
    const session = await startExamSession(userId, exam, testMode);
    return NextResponse.json({ session });
  }
  if (phase === "advance") {
    const sessionId = body?.sessionId;
    const fromSection = body?.fromSection;
    const valid = ["writing", "listening", "reading", "translation"];
    if (typeof sessionId !== "number" || typeof fromSection !== "string" || !valid.includes(fromSection)) {
      return badRequest("sessionId + fromSection required");
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
    const session = await advanceSection(
      userId,
      sessionId,
      fromSection as "writing",
      body?.timedOut === true,
      responses,
      freeText,
    );
    if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });
    return NextResponse.json({ session });
  }
  return badRequest("phase must be start|advance");
}
