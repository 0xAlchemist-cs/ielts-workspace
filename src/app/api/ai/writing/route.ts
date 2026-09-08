import { NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT, retrievalItems } from "@/db/schema";
import { getProvider } from "@/lib/ai";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { advanceState, decideFormat, holisticStrength } from "@/lib/retrieval-engine";
import { getUserIdOrNull } from "@/server/current-user";
import { saveWritingAction } from "@/app/actions";
import { addError } from "@/server/services/bank";
import { logChunkEvent, markChunkActivated } from "@/server/services/events";
import { readJsonBody, stringField, badRequest } from "@/lib/request";
import type { ErrorCategory, ItemLearningState, ModuleContext } from "@/lib/types";

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{
    prompt?: unknown;
    text?: unknown;
    taskType?: string;
    targetChunkIds?: number[];
    isRewrite?: boolean;
    originalAttemptId?: number;
  }>(req);
  const prompt = stringField(body, "prompt", 4000);
  const text = stringField(body, "text", 40_000);
  if (!prompt || !text) {
    return badRequest(body == null ? "invalid JSON body" : "prompt and text required (≤ 4000 / 40000 chars)");
  }

  // ── Resolve target chunks: either explicit IDs, or auto-select from engine ─
  const targetChunkIdsBody = Array.isArray(body?.targetChunkIds) ? body.targetChunkIds : [];
  const isRewrite = body?.isRewrite === true;
  let targetChunkIds = targetChunkIdsBody;
  if (targetChunkIds.length === 0 && !isRewrite) {
    // Retrieval Engine picks items due for writing activation
    const dueItems = await db
      .select()
      .from(retrievalItems)
      .where(
        and(
          eq(retrievalItems.userId, userId),
          eq(retrievalItems.itemType, "chunk"),
          lte(retrievalItems.dueAt, Date.now() + 86_400_000),
        ),
      )
      .limit(5);
    targetChunkIds = dueItems.map((i) => i.itemId);
  }

  const targetChunkRows = targetChunkIds.length
    ? await db.select().from(chunksT).where(eq(chunksT.userId, userId))
    : [];
  const myChunks = targetChunkRows.filter((c) => targetChunkIds.includes(c.id));
  const targetChunks = myChunks.map((c) => c.text);

  // ── AI evaluation ─────────────────────────────────────────────────────────
  const feedback = await getProvider().writing({ prompt, text, targetChunks });

  // ── LanguageItem detection & state advancement ────────────────────────────
  const usedChunkIds: number[] = [];
  const usedChunkTexts: string[] = [];
  for (const c of myChunks) {
    const used = CHUNK_DETECT[c.text] ? CHUNK_DETECT[c.text].test(text) : text.includes(c.text);
    if (used) {
      usedChunkIds.push(c.id);
      usedChunkTexts.push(c.text);
    }
  }
  feedback.usedChunkIds = usedChunkIds;
  feedback.usedChunkTexts = usedChunkTexts;
  if (feedback.acquisition) {
    feedback.acquisition.activeItemsUsed = usedChunkIds.map((id) => ({
      text: myChunks.find((c) => c.id === id)?.text ?? "",
      itemId: id,
      wasTargeted: true,
    }));
  }

  // Advance learning states for used chunks (writing context)
  const context: ModuleContext = "writing";
  for (const chunkId of usedChunkIds) {
    await logChunkEvent(userId, chunkId, "ielts_use", text.slice(0, 200));
    await markChunkActivated(userId, chunkId);

    // Advance the learning state
    const [item] = await db
      .select()
      .from(retrievalItems)
      .where(
        and(
          eq(retrievalItems.userId, userId),
          eq(retrievalItems.itemType, "chunk"),
          eq(retrievalItems.itemId, chunkId),
        ),
      )
      .limit(1);
    if (item) {
      const ls: ItemLearningState = item.learningState ?? {
        state: "exposure", achievedAt: {}, contexts: [],
        productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
      };
      const format = decideFormat("chunk", ls);
      const newLs = advanceState(ls, format, 5, context);
      const strength = holisticStrength(newLs);
      await db
        .update(retrievalItems)
        .set({ learningState: newLs })
        .where(eq(retrievalItems.id, item.id));
      await db
        .update(chunksT)
        .set({ retrievalStrength: strength })
        .where(eq(chunksT.id, chunkId));
    }
  }

  // ── Error Bank auto-integration ───────────────────────────────────────────
  // Only bank tasks whose "original" is a real quote from the essay — this
  // gates out mock template rows (statistics like "average sentence length:
  // …", "You didn't use: …") and any hallucinated live quote alike.
  for (const task of (feedback.rewriteTasks ?? []).slice(0, 6)) {
    if (!task.original || !text.includes(task.original)) continue;
    // register/style/ambiguity notes are feedback, not mistakes — keep them
    // out of the error bank (only genuinely-wrong items become revenge items)
    if (task.kind && task.kind !== "error") continue;
    const p = task.problem.toLowerCase();
    const category: ErrorCategory = p.includes("chinese")
      ? "chinese_english"
      : p.includes("preposition")
        ? "preposition"
        : p.includes("collocation")
          ? "vocabulary"
          : p.includes("spelling")
            ? "vocabulary"
            : "grammar";
    await addError(userId, {
      category,
      wrongForm: task.original,
      correctForm: task.fix || task.hint || "(see rewrite task)",
      explanation: task.explanation,
      source: "ai",
      sourceModule: "writing",
      severity: category === "chinese_english" ? "high" : "medium",
    });
  }

  const attemptId = await saveWritingAction({
    taskType: typeof body?.taskType === "string" ? body.taskType : "task2",
    prompt,
    text,
    feedback,
    ieltsScores: feedback.ielts,
    usedChunkIds,
  });

  return NextResponse.json({ feedback, attemptId, usedChunkIds, usedChunkTexts });
}
