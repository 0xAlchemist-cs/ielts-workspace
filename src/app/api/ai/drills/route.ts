import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { errors as errorsT } from "@/db/schema";
import { getProvider } from "@/lib/ai";
import { mockDrills } from "@/lib/ai/mock-drills";
import { recordEvent } from "@/server/services/progress";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";

/** Parallel drills — new-context fill-ins targeting one Error-Bank row.
 * POST {errorId}            → DrillSet (live provider, mock frames offline)
 * POST {errorId, record:{correct:n}} → honest funnel write: each drill
 *      answered from memory is a real retrieval success. */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ errorId?: unknown; record?: unknown }>(req);
  const errorId = body?.errorId;
  if (typeof errorId !== "number" || !Number.isInteger(errorId) || errorId <= 0) {
    return badRequest("errorId (positive int) required");
  }
  const [err] = await db
    .select()
    .from(errorsT)
    .where(and(eq(errorsT.id, errorId), eq(errorsT.userId, userId)))
    .limit(1);
  if (!err) return NextResponse.json({ error: "error not found" }, { status: 404 });

  if (body?.record !== undefined) {
    const rec = body.record as { correct?: unknown };
    const correct = typeof rec?.correct === "number" && Number.isInteger(rec.correct) ? Math.min(Math.max(rec.correct, 0), 3) : NaN;
    if (Number.isNaN(correct)) return badRequest("record.correct (int 0-3) required");
    if (correct > 0) await recordEvent(userId, "retrieved", correct);
    return NextResponse.json({ ok: true, recorded: correct });
  }

  const provider = await getProvider();
  const input = {
    wrongForm: err.wrongForm,
    correctForm: err.correctForm,
    category: err.category,
    explanation: err.explanation ?? undefined,
  };
  const set = provider.drills ? await provider.drills(input) : mockDrills(input);
  return NextResponse.json(set);
}
