import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";
import { confirmIeltscbImport } from "@/server/services/ieltscb-import";

/** POST /api/import/reading/ieltscb/confirm — write the imported report
 *  (task + attempt + registry + error routing). Re-derives everything from
 *  the URL server-side: the client never posts canonical data (it could be
 *  tampered with); duplicate detection decides imported/attempt-added/updated. */

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = await readJsonBody<{ url?: unknown }>(req);
  const url = typeof body?.url === "string" ? body.url : "";
  if (!url.trim()) return badRequest("url required");
  if (url.length > 2000) return badRequest("url too long");

  const result = await confirmIeltscbImport(userId, url);
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    action: result.action,
    taskId: result.taskId,
    attemptId: result.attemptId,
    warnings: result.warnings,
    reportUrl: result.attemptId ? `/ielts/report/${result.attemptId}` : null,
  });
}
