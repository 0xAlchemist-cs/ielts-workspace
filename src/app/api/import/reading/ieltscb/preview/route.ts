import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { badRequest, readJsonBody } from "@/lib/request";
import { buildIeltscbPreview } from "@/server/services/ieltscb-import";

/** POST /api/import/reading/ieltscb/preview — fetch + adapt an IELTSCB
 *  report URL. Deterministic parser only (no AI); writes nothing. */

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = await readJsonBody<{ url?: unknown }>(req);
  const url = typeof body?.url === "string" ? body.url : "";
  if (!url.trim()) return badRequest("url required");
  if (url.length > 2000) return badRequest("url too long");

  const result = await buildIeltscbPreview(url, { userId });
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 400 });
  }
  const { preview } = result;
  return NextResponse.json({
    ok: true,
    title: preview.title,
    breadcrumb: preview.breadcrumb,
    summary: preview.summary,
    passages: preview.passages.length,
    groups: preview.questionGroups.length,
    questions: preview.questions.length,
    answerCount: preview.questions.filter((q) => q.isCorrect != null).length,
    answersComplete: preview.questions.every((q) => q.isCorrect != null),
    explanations: preview.questions.filter((q) => q.explanation).length,
    evidenceCount: preview.questions.filter((q) => q.evidence.length > 0).length,
    synonyms: preview.synonyms.length,
    coreWords: preview.coreWords.length,
    imageGroups: preview.questionGroups.filter((g) => g.imageUrl).length,
    warnings: preview.warnings,
    diagnostics: preview.diagnostics,
    existing: preview.existing,
    parserVersion: preview.parserVersion,
    // canonical test for the confirm step — kept out of raw (never needed twice)
    canonical: preview,
  });
}
