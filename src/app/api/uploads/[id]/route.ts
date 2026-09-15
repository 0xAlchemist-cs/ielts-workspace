import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { importedResources } from "@/db/schema";
import { readUpload } from "@/server/services/import-resource";

/** GET /api/uploads/[id] — stream an imported media file for playback.
 * The id resolves through the DB to a uuid storage key; the key is
 * re-validated (uuid + vetted extension, fixed directory, basename-only),
 * so neither the id nor anything in the row can escape data/uploads. */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0 || numericId > 1e9) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const [row] = await db
    .select({ storageKey: importedResources.storageKey })
    .from(importedResources)
    .where(eq(importedResources.id, numericId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const file = await readUpload(row.storageKey);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.buf), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.buf.length),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
