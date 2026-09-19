import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { errors as errorsT } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { WrongPracticeView } from "./view";

export const dynamic = "force-dynamic";

/* ── Wrong→Practice (V15.1) — one real mistake becomes a two-stage retrieval
 *    session: recall in a fresh context, then use it in another. Grading and
 *    scheduling belong to the existing engines; this page only frames WHY. */

export default async function PracticePage({ params }: { params: Promise<{ errorId: string }> }) {
  const cu = await requireUser();
  const { errorId } = await params;
  const id = Number(errorId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // user-scoped lookup: exam isolation is automatic (an IELTS user can only
  // ever address their own — IELTS — errors)
  const [err] = await db
    .select()
    .from(errorsT)
    .where(and(eq(errorsT.id, id), eq(errorsT.userId, cu.user.id)))
    .limit(1);
  if (!err) notFound();

  return <WrongPracticeView errorId={err.id} wrongForm={err.wrongForm} category={err.category} />;
}
