import { requireUser } from "@/server/current-user";
import { db } from "@/db";
import { contents } from "@/db/schema";
import {
  getChunkRelations,
  getCorpusChunksForContent,
  getCorpusVocabulary,
  getUserChunks,
  getUserSentences,
  getVocabRelations,
} from "@/server/services/bank";
import { ChunkBankView } from "./view";

export default async function ChunksPage() {
  const cu = await requireUser();
  const userId = cu.user.id;

  const [userChunks, corpusWords, vocabRels, allContents] = await Promise.all([
    getUserChunks(userId),
    getCorpusVocabulary(),
    getVocabRelations(),
    db.select({ id: contents.id, title: contents.title }).from(contents),
  ]);

  const titleById = new Map(allContents.map((c) => [c.id, c.title]));
  // Vocabulary corpus grew to thousands of lookup-pool words; the Lexical
  // Network tab shows only words that participate in relations (seed network
  // + synonym graph endpoints), not the whole pool.
  const wordById = new Map(corpusWords.map((w) => [w.id, w]));
  const connectedIds = new Set<number>();
  for (const r of vocabRels) {
    if (r.fromType === "vocab") connectedIds.add(r.fromId);
    if (r.toType === "vocab") connectedIds.add(r.toId);
  }
  const networkWords = corpusWords.filter((w) => connectedIds.has(w.id));

  // corpus chunks (all contents) with saved flags
  const corpusByContent = new Map<number, Awaited<ReturnType<typeof getCorpusChunksForContent>>>();
  for (const c of allContents) {
    const rows = await getCorpusChunksForContent(c.id);
    const relevant = rows.filter((r) => r.sourceContentId === c.id);
    if (relevant.length) corpusByContent.set(c.id, relevant);
  }
  const savedTexts = new Set(userChunks.map((c) => c.text));

  const chunkRels = await getChunkRelations(userChunks.map((c) => c.id));
  const idToText = new Map<number, string>();
  for (const c of [...userChunks]) idToText.set(c.id, c.text);
  // also map corpus ids for relation display
  for (const rows of corpusByContent.values()) for (const r of rows) idToText.set(r.id, r.text);

  const sentencesByChunk: Record<number, string[]> = {};
  for (const c of userChunks) {
    const s = await getUserSentences(userId, "chunk", c.id);
    if (s.length) sentencesByChunk[c.id] = s.map((x) => x.text);
  }

  return (
    <ChunkBankView
      myChunks={userChunks.map((c) => ({
        id: c.id,
        text: c.text,
        pattern: c.pattern,
        meaningEn: c.meaningEn,
        meaningZh: c.meaningZh,
        examples: c.examples,
        register: c.register,
        strength: c.retrievalStrength,
        lastReviewAt: c.lastReviewAt,
        sourceTitle: c.sourceContentId ? (titleById.get(c.sourceContentId) ?? null) : null,
        mySentences: sentencesByChunk[c.id] ?? [],
      }))}
      discover={[...corpusByContent.entries()].map(([contentId, rows]) => ({
        contentTitle: titleById.get(contentId) ?? "",
        chunks: rows
          .filter((r) => !savedTexts.has(r.text))
          .map((r) => ({ id: r.id, text: r.text, meaningEn: r.meaningEn, meaningZh: r.meaningZh })),
      })).filter((g) => g.chunks.length > 0)}
      chunkRelations={chunkRels.map((r) => ({
        relation: r.relation,
        note: r.note,
        from: idToText.get(r.fromId) ?? "?",
        to: idToText.get(r.toId) ?? "?",
      }))}
      network={{
        words: networkWords.map((w) => ({
          id: w.id,
          headword: w.headword,
          pos: w.pos,
          cefr: w.cefr ?? "B2",
          meaningEn: w.meaningEn,
          meaningZh: w.meaningZh,
          example: w.exampleEn,
          collocations: w.collocations,
          audioUrl: w.audioUrl,
        })),
        relations: vocabRels
          .filter((r) => r.fromType === "vocab")
          .map((r) => ({
            relation: r.relation,
            note: r.note,
            from: wordById.get(r.fromId)?.headword ?? "?",
            to: wordById.get(r.toId)?.headword ?? "?",
          })),
      }}
    />
  );
}
