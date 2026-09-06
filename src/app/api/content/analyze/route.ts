import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { analyzeContent } from "@/server/services/content-analysis";

/** POST /api/content/analyze — analyze raw English text */
export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json()) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  if (text.split(/\s+/).length < 30) {
    return NextResponse.json({ error: "text too short (need ≥30 words)" }, { status: 400 });
  }

  const analysis = await analyzeContent(text);
  return NextResponse.json(analysis);
}
