import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { submitRetentionReview } from "@/server/services/retention";
import type { ReviewMode } from "@/lib/types";

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = (await req.json()) as {
    retrievalItemId?: number;
    mode?: ReviewMode;
    response?: string;
  };
  if (!body.retrievalItemId || !body.mode) {
    return NextResponse.json({ error: "retrievalItemId and mode required" }, { status: 400 });
  }
  const result = await submitRetentionReview(
    userId,
    body.retrievalItemId,
    body.mode,
    body.response ?? "",
  );
  if (!result) return NextResponse.json({ error: "item not found" }, { status: 404 });
  return NextResponse.json(result);
}
