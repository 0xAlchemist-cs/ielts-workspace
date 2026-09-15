import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { importFile } from "@/server/services/import-resource";

/** POST /api/import — multipart file upload (single "file" field, optional
 * "durationMs" measured client-side for media). Local-first: extraction,
 * analysis and dedupe all happen in-process. */

const MAX_BODY = 410 * 1024 * 1024; // covers the 400 MB video cap + overhead

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "couldn't read upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  const rawDuration = form.get("durationMs");
  const durationMs =
    typeof rawDuration === "string" && /^\d{1,9}$/.test(rawDuration) ? Number(rawDuration) : undefined;

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await importFile(userId, {
    fileName: file.name || "upload",
    buf,
    durationMs,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
