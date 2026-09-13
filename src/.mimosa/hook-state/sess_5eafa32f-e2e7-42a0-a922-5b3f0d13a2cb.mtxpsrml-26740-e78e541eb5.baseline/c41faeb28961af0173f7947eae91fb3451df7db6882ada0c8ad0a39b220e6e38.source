import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT, retrievalItems } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { paraphraseBank, writingTasks } from "@/lib/banks";
import { isLiveConfigured } from "@/lib/ai";
import { WritingLab } from "./lab";

export default async function WritingPage() {
  const cu = await requireUser();
  const userId = cu.user.id;

  // Targeted Writing: pick chunks due for writing activation from the engine
  // eslint-disable-next-line react-hooks/purity -- force-dynamic server component
  const dueThreshold = Date.now() + 2 * 86_400_000;
  const dueItems = await db
    .select({ itemId: retrievalItems.itemId, learningState: retrievalItems.learningState })
    .from(retrievalItems)
    .where(
      and(
        eq(retrievalItems.userId, userId),
        eq(retrievalItems.itemType, "chunk"),
        lte(retrievalItems.dueAt, dueThreshold),
      ),
    )
    .limit(8);

  const myChunkRows = await db.select().from(chunksT).where(eq(chunksT.userId, userId));
  const selectable = myChunkRows
    .filter((c) => dueItems.some((d) => d.itemId === c.id))
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      text: c.text,
      meaningZh: c.meaningZh,
      strength: c.retrievalStrength,
    }));

  return (
    <WritingLab
      aiLive={isLiveConfigured()}
      tasks={writingTasks.map((t) => ({ id: t.id, taskType: t.taskType, prompt: t.prompt, hint: t.hint }))}
      paraphrases={paraphraseBank.map((p) => ({ id: p.id, source: p.source, sourceZh: p.sourceZh }))}
      targetChunks={selectable}
    />
  );
}
