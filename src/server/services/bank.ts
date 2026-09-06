import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  chunks,
  errors,
  lexicalRelations,
  sentences,
  userSentences,
  vocabularies,
  type Chunk,
  type ErrorRow,
  type LexicalRelation,
  type Vocabulary,
} from "@/db/schema";
import type { ErrorCategory, WordAnalysis } from "@/lib/types";
import { lookupWord } from "@/server/services/dictionary";
import { ensureRetrievalItem } from "@/server/services/retrieval";
import { recordEvent } from "@/server/services/progress";

// ── Chunk bank ──────────────────────────────────────────────────────────────

/** Copy a corpus chunk into the user's personal bank + schedule retrieval. */
export async function saveCorpusChunk(userId: number, corpusChunkId: number): Promise<Chunk | null> {
  const rows = await db.select().from(chunks).where(eq(chunks.id, corpusChunkId)).limit(1);
  if (!rows.length) return null;
  const c = rows[0];

  const dup = await db
    .select({ id: chunks.id })
    .from(chunks)
    .where(and(eq(chunks.userId, userId), eq(chunks.text, c.text)))
    .limit(1);
  if (dup.length) return (await db.select().from(chunks).where(eq(chunks.id, dup[0].id)).limit(1))[0] ?? null;

  const [saved] = await db
    .insert(chunks)
    .values({
      userId,
      text: c.text,
      pattern: c.pattern,
      meaningEn: c.meaningEn,
      meaningZh: c.meaningZh,
      examples: c.examples,
      register: c.register,
      sourceContentId: c.sourceContentId,
    })
    .returning();
  await ensureRetrievalItem(userId, "chunk", saved.id);
  await recordEvent(userId, "understood");
  return saved;
}

/** Save a free-form chunk typed by the user (Language Lab, Listening Lab...). */
export async function saveCustomChunk(
  userId: number,
  data: { text: string; pattern?: string; meaningEn?: string; meaningZh?: string; examples?: string[]; sourceContentId?: number | null },
): Promise<Chunk> {
  const dup = await db
    .select({ id: chunks.id })
    .from(chunks)
    .where(and(eq(chunks.userId, userId), eq(chunks.text, data.text)))
    .limit(1);
  if (dup.length) {
    return (await db.select().from(chunks).where(eq(chunks.id, dup[0].id)).limit(1))[0];
  }
  const [saved] = await db
    .insert(chunks)
    .values({
      userId,
      text: data.text,
      pattern: data.pattern ?? "",
      meaningEn: data.meaningEn ?? "",
      meaningZh: data.meaningZh ?? "",
      examples: data.examples ?? [],
      sourceContentId: data.sourceContentId ?? null,
    })
    .returning();
  await ensureRetrievalItem(userId, "chunk", saved.id);
  await recordEvent(userId, "understood");
  return saved;
}

export async function getUserChunks(userId: number): Promise<Chunk[]> {
  return db.select().from(chunks).where(eq(chunks.userId, userId)).orderBy(desc(chunks.createdAt));
}

export async function getCorpusChunksForContent(contentId: number): Promise<Chunk[]> {
  return db
    .select()
    .from(chunks)
    .where(and(isNull(chunks.userId), or(eq(chunks.sourceContentId, contentId), isNull(chunks.sourceContentId))));
}

/** Relations touching any of the given chunks (or corpus vocab words). */
export async function getChunkRelations(chunkIds: number[]): Promise<LexicalRelation[]> {
  if (!chunkIds.length) return [];
  const rels = await db.select().from(lexicalRelations);
  return rels.filter((r) => r.fromType === "chunk" && chunkIds.includes(r.fromId) || r.toType === "chunk" && chunkIds.includes(r.toId));
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** Save a clicked word into the personal vocabulary (meaning from ECDICT). */
export async function saveVocabulary(
  userId: number,
  word: string,
  context?: string,
): Promise<Vocabulary | null> {
  const headword = word.toLowerCase().replace(/[^a-z'-]/g, "");
  if (!headword) return null;
  const lookup = await lookupWord(headword);

  const existing = await db
    .select()
    .from(vocabularies)
    .where(and(eq(vocabularies.userId, userId), eq(vocabularies.headword, headword)))
    .limit(1);
  if (existing.length) return existing[0];

  const [saved] = await db
    .insert(vocabularies)
    .values({
      userId,
      headword,
      pos: lookup?.entry.pos ?? "",
      cefr: undefined,
      meaningEn: (lookup?.entry.definitionEn ?? "").replace(/\\n/g, " ").split("\n")[0]?.slice(0, 200) ?? "",
      meaningZh: (lookup?.entry.translationZh ?? "").replace(/\\n/g, "；").split(/[;\n；]/)[0]?.slice(0, 80) ?? "",
      exampleEn: context ?? "",
    })
    .returning();
  await ensureRetrievalItem(userId, "vocab", saved.id);
  await recordEvent(userId, "understood");
  return saved;
}

export async function getUserVocabulary(userId: number): Promise<Vocabulary[]> {
  return db.select().from(vocabularies).where(eq(vocabularies.userId, userId)).orderBy(desc(vocabularies.createdAt));
}

export async function getCorpusVocabulary(): Promise<Vocabulary[]> {
  return db.select().from(vocabularies).where(isNull(vocabularies.userId));
}

export async function getVocabRelations(): Promise<LexicalRelation[]> {
  return db.select().from(lexicalRelations);
}

// ── User sentences ──────────────────────────────────────────────────────────

export async function saveUserSentence(
  userId: number,
  refType: "chunk" | "vocab" | "grammar",
  refId: number,
  text: string,
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  await db.insert(userSentences).values({ userId, refType, refId, text: clean });
}

export async function getUserSentences(userId: number, refType: string, refId: number) {
  return db
    .select()
    .from(userSentences)
    .where(and(eq(userSentences.userId, userId), eq(userSentences.refType, refType), eq(userSentences.refId, refId)))
    .orderBy(desc(userSentences.createdAt))
    .limit(20);
}

// ── Error bank ──────────────────────────────────────────────────────────────

export async function addError(
  userId: number,
  data: {
    category: ErrorCategory;
    wrongForm: string;
    correctForm: string;
    explanation?: string;
    source?: "manual" | "ai";
    sourceModule?: string;
    severity?: "low" | "medium" | "high";
    languageItemId?: number | null;
  },
): Promise<ErrorRow> {
  const wrong = data.wrongForm.trim();
  const correct = data.correctForm.trim();
  const existing = await db
    .select()
    .from(errors)
    .where(and(eq(errors.userId, userId), eq(errors.wrongForm, wrong), eq(errors.category, data.category)))
    .limit(1);
  if (existing.length) {
    const [row] = await db
      .update(errors)
      .set({
        occurrenceCount: existing[0].occurrenceCount + 1,
        lastSeenAt: Date.now(),
        status: "active", // regression: any re-occurrence resets to active
        ...(data.sourceModule && !existing[0].sourceModule ? { sourceModule: data.sourceModule } : {}),
      })
      .where(eq(errors.id, existing[0].id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(errors)
    .values({
      userId,
      category: data.category,
      wrongForm: wrong,
      correctForm: correct,
      explanation: data.explanation ?? "",
      source: data.source ?? "manual",
      sourceModule: data.sourceModule ?? "review",
      severity: data.severity ?? "medium",
      languageItemId: data.languageItemId ?? null,
    })
    .returning();
  await ensureRetrievalItem(userId, "error", row.id);
  return row;
}

export async function listErrors(userId: number, includeResolved = false): Promise<ErrorRow[]> {
  const rows = await db
    .select()
    .from(errors)
    .where(eq(errors.userId, userId))
    .orderBy(desc(errors.occurrenceCount), desc(errors.lastSeenAt));
  return includeResolved ? rows : rows.filter((r) => r.status === "active");
}

export async function toggleErrorStatus(userId: number, errorId: number): Promise<void> {
  const rows = await db.select().from(errors).where(and(eq(errors.id, errorId), eq(errors.userId, userId))).limit(1);
  if (!rows.length) return;
  await db
    .update(errors)
    .set({ status: rows[0].status === "active" ? "resolved" : "active" })
    .where(eq(errors.id, errorId));
}

export async function recentErrors(userId: number, limit = 5): Promise<{ wrong: string; correct: string }[]> {
  const rows = await listErrors(userId);
  return rows.slice(0, limit).map((r) => ({ wrong: r.wrongForm, correct: r.correctForm }));
}

// ── Content sentence cache ──────────────────────────────────────────────────

export async function cacheSentenceAnalysis(sentenceId: number, analysis: unknown): Promise<void> {
  await db
    .update(sentences)
    .set({ sentenceAnalysis: analysis as object })
    .where(eq(sentences.id, sentenceId));
}

export function wordAnalysisToVocabHint(a: WordAnalysis): { meaningEn: string; meaningZh: string } {
  return { meaningEn: a.simpleDefinition, meaningZh: a.meaningZh };
}
