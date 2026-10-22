import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { submitRetentionReview } from "@/server/services/retention";
import { peekServedReview } from "@/server/services/served-review";
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

/** Modes embeds may submit WITHOUT a queue credential. Read/listen labs and
 *  the welcome flow serve plain production cards inside their own UIs; they
 *  carry no ladder-privileged semantics. Everything else — recognition,
 *  cued_recall, cloze, context_transfer, audio_retrieval, retention_check —
 *  must arrive exactly as the review queue served it. */
const UNCREDENTIALED_ALLOWED: readonly ReviewMode[] = ["production"];

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

  // ── Served-mode credential (step-02): privileged advancement claims —
  // context_transfer, audio_retrieval, retention_check, and the scaffolded
  // formats — must match the format the server actually served for this
  // card. Plain practice modes (production) are always acceptable: the
  // labs/welcome embeds serve those inside their own UIs, and production
  // only ever advances conservatively (→ usage), so a swapped claim gains
  // nothing. Retention/transfer escalation can never be claimed by the
  // client alone.
  const served = peekServedReview(userId, itemId);
  const privileged = !UNCREDENTIALED_ALLOWED.includes(mode as ReviewMode);
  if (privileged && served !== mode) {
    return NextResponse.json(
      {
        error: served ? "mode mismatch" : "mode not served",
        message: served
          ? `This card was served as "${served}" — submit it in that format.`
          : `"${mode}" was not served for this card — pull a fresh review queue.`,
      },
      { status: 409 },
    );
  }

  const result = await submitRetentionReview(userId, itemId, mode as ReviewMode, response);
  if (!result) return NextResponse.json({ error: "item not found" }, { status: 404 });
  return NextResponse.json(result);
}
