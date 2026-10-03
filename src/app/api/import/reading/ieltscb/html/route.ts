import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";
import { confirmIeltscbHtmlImport } from "@/server/services/ieltscb-import";

/** POST /api/import/reading/ieltscb/html — import a browser-saved report
 *  page (Ctrl+S "Webpage, HTML Only"). For reports the API can no longer
 *  fetch (login-session rendered, no tid in the URL). The server joins this
 *  attempt onto previously imported canonical material of the same test;
 *  nothing is fabricated from the HTML beyond the answer table. */

const MAX_HTML_CHARS = 8_000_000; // saved report pages run ~2.5MB

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = await readJsonBody<{ html?: unknown }>(req);
  const html = typeof body?.html === "string" ? body.html : "";
  if (!html.trim()) return badRequest("html required");
  if (html.length > MAX_HTML_CHARS) return badRequest("html too large");

  const result = await confirmIeltscbHtmlImport(userId, html);
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    action: result.action,
    taskId: result.taskId,
    attemptId: result.attemptId,
    reportUrl: result.reportUrl,
  });
}
