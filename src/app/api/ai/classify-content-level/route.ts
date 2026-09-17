import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contents as contentsT } from "@/db/schema";
import { getUserIdOrNull, getActiveExam } from "@/server/current-user";
import { getProvider } from "@/lib/ai";
import { isLiveConfigured } from "@/lib/ai";
import { badRequest, readJsonBody } from "@/lib/request";

/** POST /api/ai/classify-content-level — IELTS-only (V9): classify a stored
 * material's language difficulty with the AI provider and persist level +
 * evidence. Import runs this automatically when AI is live; the button in the
 * UI runs it on demand. Never fakes a result: no AI → clear error. */

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const exam = await getActiveExam();
  if (exam !== "ielts") {
    return badRequest("Difficulty analysis is part of the IELTS learning layer.");
  }
  if (!isLiveConfigured()) {
    return badRequest("No AI provider configured — add one in Settings to analyze difficulty.");
  }

  const body = await readJsonBody<{ contentId?: unknown }>(req);
  const contentId = body?.contentId;
  if (typeof contentId !== "number" || !Number.isInteger(contentId) || contentId <= 0) {
    return badRequest("contentId required (positive integer)");
  }

  const [content] = await db.select().from(contentsT).where(eq(contentsT.id, contentId)).limit(1);
  if (!content) return NextResponse.json({ error: "not found" }, { status: 404 });

  const provider = getProvider();
  if (!provider.classifyContentLevel) return badRequest("Provider cannot classify.");

  try {
    const result = await provider.classifyContentLevel({
      title: content.title,
      content: content.body,
      resourceType: content.type,
    });
    // Confidence floor: a low-confidence result (e.g. non-English text where the
    // model admits it is returning a placeholder) must never be persisted as a
    // real level — the honest answer is "unknown", previous cefr stays.
    if (result.confidence < 0.4) {
      return NextResponse.json({
        ok: true,
        level: "unknown",
        confidence: result.confidence,
        summary: result.summary,
        notPersisted: true,
      });
    }
    await db
      .update(contentsT)
      .set({
        cefr: result.level,
        cefrMeta: { confidence: result.confidence, summary: result.summary },
      })
      .where(eq(contentsT.id, contentId));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // never persist an invalid classification — leave the previous state
    return NextResponse.json({ error: `Classification failed: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
