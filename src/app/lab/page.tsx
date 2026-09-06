import { db } from "@/db";
import { chunks as chunksT } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getUserChunks } from "@/server/services/bank";
import { shadowingSentences } from "@/lib/banks";
import { isLiveConfigured } from "@/lib/ai";
import { LabForm } from "./form";

export default async function LabPage() {
  const cu = await requireUser();
  const corpus = await db.select().from(chunksT);
  const savedTexts = new Set((await getUserChunks(cu.user.id)).map((c) => c.text));
  const corpusChunkIds: Record<string, number> = {};
  for (const c of corpus) {
    if (c.userId === null && !(c.text in corpusChunkIds)) corpusChunkIds[c.text] = c.id;
  }

  return (
    <LabForm
      aiLive={isLiveConfigured()}
      corpusChunkIds={corpusChunkIds}
      suggestions={[...shadowingSentences]}
      savedCount={savedTexts.size}
    />
  );
}
