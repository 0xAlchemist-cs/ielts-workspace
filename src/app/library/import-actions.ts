"use server";

import { getUserIdOrNull } from "@/server/current-user";
import { deleteAllImports } from "@/server/services/import-resource";

/* Corpus-center destructive action. The client shows a deliberate
 * confirmation with real counts first; this runs only after "Delete
 * everything". Scope is strictly V6-imported material — the seeded corpus has
 * no registry rows and is structurally out of reach. */
export async function deleteAllImportsAction(): Promise<
  { ok: true; files: number; contents: number; bytesFreed: number } | { ok: false; error: string }
> {
  const userId = await getUserIdOrNull();
  if (!userId) return { ok: false, error: "no user" };
  const res = await deleteAllImports(userId);
  return { ok: true, ...res };
}
