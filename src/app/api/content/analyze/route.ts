import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { analyzeContent } from "@/server/services/content-analysis";
import { badRequest, readJsonBody, stringField } from "@/lib/request";

const MAX_TEXT_CHARS = 20_000;

/** POST /api/content/analyze — analyze raw English text */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = await readJsonBody<{ text?: unknown }>(req);
  const text = stringField(body, "text", MAX_TEXT_CHARS);
  if (!text) return badRequest(`text required (string, ≤ ${MAX_TEXT_CHARS} chars)`);
  if (text.split(/\s+/).length < 30) {
    return badRequest("text too short (need ≥30 words)");
  }

  const analysis = await analyzeContent(text);
  return NextResponse.json(analysis);
}
