import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { submitRetentionReview } from "@/server/services/retention";
import { badRequest, readJsonBody, stringField } from "@/lib/request";
import type { ReviewMode } from "@/lib/types";

const REVIEW_MODES: readonly ReviewMode[] = [
  "recognition",
  "cued_recall",
  "production",
  "cloze",
  "context_transfer",
  "audio_retrieval",
  "retention_check",
];

const MAX_RESPONSE_CHARS = 2_000;

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{
    retrievalItemId?: unknown;
    mode?: unknown;
    response?: unknown;
  }>(req);

  const itemId = body?.retrievalItemId;
  if (typeof itemId !== "number" || !Number.isInteger(itemId) || itemId <= 0) {
    return badRequest("retrievalItemId and mode required (itemId: positive integer)");
  }
  const mode = body?.mode;
  if (typeof mode !== "string" || !REVIEW_MODES.includes(mode as ReviewMode)) {
    return badRequest(`mode required (one of: ${REVIEW_MODES.join(", ")})`);
  }
  let response = "";
  if (body?.response !== undefined) {
    response = stringField(body, "response", MAX_RESPONSE_CHARS) ?? "";
    if (!response && typeof body.response === "string" && body.response.trim()) {
      return badRequest(`response required (string, ≤ ${MAX_RESPONSE_CHARS} chars)`);
    }
  }

  const result = await submitRetentionReview(userId, itemId, mode as ReviewMode, response);
  if (!result) return NextResponse.json({ error: "item not found" }, { status: 404 });
  return NextResponse.json(result);
}
