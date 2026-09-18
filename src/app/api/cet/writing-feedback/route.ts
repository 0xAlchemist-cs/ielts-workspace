import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cetTasks } from "@/db/schema";
import { getUserIdOrNull, getActiveExam } from "@/server/current-user";
import { getProvider } from "@/lib/ai";
import { badRequest, readJsonBody } from "@/lib/request";

/** POST /api/cet/writing-feedback — AI Practice Feedback for CET
 * writing/translation (NEVER an official score; IELTS prompts never used). */

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const exam = await getActiveExam();
  if (exam !== "cet4" && exam !== "cet6") {
    return badRequest("CET practice is only available under a CET goal.");
  }
  const body = await readJsonBody<{ taskId?: unknown; answer?: unknown }>(req);
  const taskId = body?.taskId;
  if (typeof taskId !== "number" || !Number.isInteger(taskId) || taskId <= 0) {
    return badRequest("taskId required (positive integer)");
  }
  const answer = typeof body?.answer === "string" ? body.answer.slice(0, 6000) : "";
  if (answer.trim().length < 10) return badRequest("answer required (≥10 chars)");

  const [task] = await db.select().from(cetTasks).where(eq(cetTasks.id, taskId)).limit(1);
  if (!task || task.examProfile !== exam) {
    return NextResponse.json({ error: "task not found for this exam" }, { status: 404 });
  }
  if (task.section !== "writing" && task.section !== "translation") {
    return badRequest("feedback is for writing/translation sections");
  }

  const provider = getProvider();
  if (!provider.cetWritingFeedback) return badRequest("Provider cannot give CET feedback.");

  try {
    const feedback = await provider.cetWritingFeedback({
      exam,
      section: task.section,
      prompt: task.prompt,
      answer,
    });
    return NextResponse.json({ feedback });
  } catch (e) {
    return NextResponse.json(
      { error: `Feedback failed: ${(e as Error).message.slice(0, 160)}` },
      { status: 502 },
    );
  }
}
