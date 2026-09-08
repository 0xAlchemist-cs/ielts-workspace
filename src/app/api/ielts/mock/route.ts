import { NextResponse } from "next/server";
import { db } from "@/db";
import { ieltsAttempts } from "@/db/schema";
import { gradeMockReading } from "@/server/services/mock-paper";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";

/** Mock-exam support: grade Reading (answers never left the server) and
 * persist the finished paper as one exam attempt. */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ phase?: unknown; taskIds?: unknown; responses?: unknown; report?: unknown }>(req);
  const phase = body?.phase;

  if (phase === "grade") {
    const taskIds = body?.taskIds;
    if (
      !Array.isArray(taskIds) ||
      taskIds.length < 1 ||
      taskIds.length > 4 ||
      !taskIds.every((t) => typeof t === "number" && Number.isInteger(t) && t > 0)
    ) {
      return badRequest("taskIds (1–4 positive ints) required");
    }
    const raw = body?.responses;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return badRequest("responses object required");
    const responses: Record<string, string | string[]> = {};
    let count = 0;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (count > 60) break;
      if (!/^\d{1,3}$/.test(k)) continue;
      if (typeof v === "string") responses[k] = v.slice(0, 500);
      else if (Array.isArray(v) && v.every((x) => typeof x === "string")) responses[k] = v.map((x) => x.slice(0, 200)).slice(0, 5);
      count++;
    }
    const result = await gradeMockReading(taskIds, responses);
    return NextResponse.json(result);
  }

  if (phase === "save") {
    const report = body?.report;
    if (!report || typeof report !== "object") return badRequest("report object required");
    const r = report as {
      taskIds?: unknown;
      reading?: unknown;
      writing?: unknown;
      durationMinutes?: unknown;
      dateKey?: unknown;
    };
    if (!Array.isArray(r.taskIds) || !r.taskIds.every((t) => typeof t === "number")) {
      return badRequest("report.taskIds required");
    }
    const reading = r.reading as { raw?: number; total?: number; band?: number; perQuestion?: unknown } | undefined;
    const writing = r.writing as { task1?: { band?: number | null }; task2?: { band?: number | null } } | undefined;
    const duration = typeof r.durationMinutes === "number" ? Math.min(Math.max(Math.round(r.durationMinutes), 0), 600) : 0;
    const bands = [reading?.band, writing?.task1?.band, writing?.task2?.band].filter((b): b is number => typeof b === "number" && b > 0);
    const overallBand = bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2 : null;
    const [row] = await db
      .insert(ieltsAttempts)
      .values({
        userId,
        taskId: r.taskIds[0] as number,
        mode: "exam",
        responses: { type: "mock_paper", dateKey: r.dateKey ?? null, taskIds: r.taskIds, reading: reading ?? null, writing: writing ?? null },
        score: reading && reading.total ? (reading.raw ?? 0) / reading.total : null,
        band: overallBand,
        durationMinutes: duration,
      })
      .returning({ id: ieltsAttempts.id });
    return NextResponse.json({ attemptId: row.id, overallBand });
  }

  return badRequest("phase must be 'grade' or 'save'");
}
