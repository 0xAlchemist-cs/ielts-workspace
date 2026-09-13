import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT, contents, retrievalItems, sentences as sentencesT, vocabularies } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
import { saveCorpusChunk } from "@/server/services/bank";
import { ensureRetrievalItem } from "@/server/services/retrieval";
import { wordTiersFor } from "@/server/services/dictionary";
import { splitParagraphs, splitSentences, tokenizeWords } from "@/lib/text";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { ieltsQuestionFor, transferPromptFor } from "@/lib/banks";
import { ActiveReadingLab, type LabTarget } from "./lab";

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const cu = await requireUser();
  const userId = cu.user.id;
  const { id } = await params;
  const contentId = Number(id);
  const [content] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  if (!content || content.type !== "reading") notFound();

  // Imported markdown (Simon ebooks etc.) references local images that don't
  // exist here — strip the syntax so it never renders as literal text.
  const readableBody = content.body.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");

  let sentenceRows = (
    await db.select().from(sentencesT).where(eq(sentencesT.contentId, contentId))
  ).sort((a, b) => a.orderNo - b.orderNo);

  // Imported corpus (Cambridge passages, Simon worksheets, …) ships without
  // sentence rows — the reader renders from them, so materialize on first
  // visit. Same splitters as below, so paragraph indices stay aligned.
  if (sentenceRows.length === 0) {
    const flattened = splitParagraphs(readableBody).flatMap((para) => splitSentences(para));
    if (flattened.length) {
      await db
        .insert(sentencesT)
        .values(flattened.map((text, orderNo) => ({ contentId, orderNo, text })));
      sentenceRows = (
        await db.select().from(sentencesT).where(eq(sentencesT.contentId, contentId))
      ).sort((a, b) => a.orderNo - b.orderNo);
    }
  }

  // Rebuild paragraph structure (indices align with splitSentences order).
  const paragraphs: { id: number; text: string }[][] = [];
  let cursor = 0;
  for (const para of splitParagraphs(readableBody)) {
    const count = splitSentences(para).length;
    paragraphs.push(sentenceRows.slice(cursor, cursor + count).map((s) => ({ id: s.id, text: s.text })));
    cursor += count;
  }

  // ── Lab targets: user chunks from this content + corpus notice chunks ──────
  const mission = await getOrCreateTodayMission(userId);
  const noticeIds = (mission.plan.notice?.chunkIds ?? []).slice(0, 8);

  const userChunks = await db
    .select()
    .from(chunksT)
    .where(and(eq(chunksT.userId, userId), eq(chunksT.sourceContentId, contentId)));

  const corpusRows = noticeIds.length
    ? await db.select().from(chunksT).where(and(isNull(chunksT.userId), inArray(chunksT.id, noticeIds)))
    : [];

  const seen = new Set(userChunks.map((c) => c.text));
  const targets: LabTarget[] = [];

  const toTarget = async (
    c: typeof userChunks[number],
    corpusId: number | undefined,
  ): Promise<LabTarget> => {
    await ensureRetrievalItem(userId, "chunk", c.id);
    const [item] = await db
      .select({ id: retrievalItems.id })
      .from(retrievalItems)
      .where(
        and(
          eq(retrievalItems.userId, userId),
          eq(retrievalItems.itemType, "chunk"),
          eq(retrievalItems.itemId, c.id),
        ),
      )
      .limit(1);
    const transfer = transferPromptFor(c.text);
    return {
      chunkId: c.id,
      corpusId,
      text: c.text,
      pattern: c.pattern,
      meaningEn: c.meaningEn,
      meaningZh: c.meaningZh,
      examples: c.examples,
      saved: corpusId === undefined,
      retrievalItemId: item?.id ?? 0,
      zhCue: c.meaningZh || c.meaningEn,
      transferInstruction: transfer.instruction,
      transferSentence: transfer.sentence,
      ieltsQuestion: ieltsQuestionFor(c.text),
    };
  };

  for (const c of userChunks.slice(0, 5)) {
    targets.push(await toTarget(c, undefined));
  }
  for (const c of corpusRows) {
    if (seen.has(c.text) || targets.length >= 5) continue;
    seen.add(c.text);
    // copy corpus chunk into the user's bank so retrieval/generation work on it
    const saved = await saveCorpusChunk(userId, c.id);
    if (saved) targets.push(await toTarget({ ...c, id: saved.id, userId }, c.id));
  }

  // preselect: mission deep chunks if they're among the targets, else first 3
  const deepIds = (mission.plan.deep?.chunkIds ?? []).slice(0, 2);
  const deepTexts = deepIds.length
    ? (await db.select({ text: chunksT.text }).from(chunksT).where(inArray(chunksT.id, deepIds))).map((r) => r.text)
    : [];
  const preselect = targets.filter((t) => deepTexts.includes(t.text)).map((t) => t.chunkId);

  const savedVocab = new Set(
    (await db.select({ h: vocabularies.headword }).from(vocabularies).where(eq(vocabularies.userId, userId))).map((r) => r.h),
  );

  const tiers = wordTiersFor(tokenizeWords(content.body));

  return (
    <ActiveReadingLab
      contentId={content.id}
      title={content.title}
      topic={content.topic}
      cefr={content.cefr}
      difficulty={content.difficulty}
      minutes={content.minutes}
      paragraphs={paragraphs}
      tiers={tiers}
      savedVocab={[...savedVocab]}
      targets={targets}
      preselectIds={preselect}
    />
  );
}
