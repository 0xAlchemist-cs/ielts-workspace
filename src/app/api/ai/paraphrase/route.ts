import { NextResponse } from "next/server";
import { getProvider } from "@/lib/ai";
import { paraphraseBank } from "@/lib/banks";
import { getUserIdOrNull } from "@/server/current-user";
import { readJsonBody, stringField, badRequest } from "@/lib/request";

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ source?: unknown; userParaphrase?: unknown }>(req);
  const source = stringField(body, "source", 5000);
  const userParaphrase = stringField(body, "userParaphrase", 5000) ?? "";
  if (!source) return badRequest(body == null ? "invalid JSON body" : "source required (string, ≤ 5000 chars)");

  const bankItem = paraphraseBank.find((p) => p.source === source);
  const feedback = await getProvider().paraphrase({
    source,
    userParaphrase,
    models: bankItem?.models,
  });

  return NextResponse.json({
    feedback,
    keyMoves: bankItem?.keyMoves ?? [],
    sourceZh: bankItem?.sourceZh ?? null,
  });
}
