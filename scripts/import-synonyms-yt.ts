/**
 * Import 羊驼 reading synonym groups + 听力场景 vocabulary.
 *
 * Sources:
 *   data/vocab-corpus/synonyms-yt.json     [{zh, words[]}] — 66 groups, 639 words
 *   data/vocab-corpus/listening-vocab.json [{headword, meaningZh, section}] — 503 entries
 *
 * Synonym groups: head = first word; every other word gets a synonym edge to
 * the head (relation "synonym", note "羊驼阅读同义替换 · <zh>").
 * Missing headwords get minimal corpus rows (userId=null) first.
 * Idempotent: existing headwords and existing edges are skipped.
 * Run: npm run db:synonyms
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, lexicalRelations, vocabularies } from "../src/db/schema";

interface SynGroup { zh: string; words: string[] }
interface ListeningWord { headword: string; meaningZh: string; section: string }

async function insertMissing(headwords: string[], byWord: Map<string, number>): Promise<number> {
  const missing = [...new Set(headwords.map((h) => h.toLowerCase()))].filter((h) => !byWord.has(h));
  const defs = missing.length
    ? await db
        .select({ word: dictionary.word, def: dictionary.definitionEn })
        .from(dictionary)
        .where(inArray(dictionary.word, missing))
    : [];
  const dict = new Map(defs.map((d) => [d.word.toLowerCase(), d.def]));
  const BATCH = 100;
  for (let i = 0; i < missing.length; i += BATCH) {
    const returned = await db
      .insert(vocabularies)
      .values(
        missing.slice(i, i + BATCH).map((w) => ({
          userId: null,
          headword: w,
          meaningEn: dict.get(w) ?? "",
          meaningZh: "",
          exampleEn: "",
          collocations: [] as string[],
        }))
      )
      .returning({ id: vocabularies.id, headword: vocabularies.headword });
    for (const r of returned) byWord.set(r.headword.toLowerCase(), r.id);
  }
  return missing.length;
}

async function main() {
  const root = path.join(process.cwd(), "data", "vocab-corpus");
  const groups: SynGroup[] = JSON.parse(readFileSync(path.join(root, "synonyms-yt.json"), "utf-8"));
  const listen: ListeningWord[] = JSON.parse(readFileSync(path.join(root, "listening-vocab.json"), "utf-8"));

  const corpus = await db
    .select({ id: vocabularies.id, headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const byWord = new Map(corpus.map((r) => [r.headword.toLowerCase(), r.id]));
  console.log(`corpus rows: ${corpus.length}`);

  // 1. synonym group words (+ all listening headwords) — insert missing
  const needed = groups.flatMap((g) => g.words.map((w) => w.toLowerCase()));
  needed.push(...listen.map((l) => l.headword.toLowerCase()));
  const inserted = await insertMissing(needed, byWord);
  console.log(`missing words inserted: ${inserted}`);

  // 2. synonym edges (head ↔ member), dedupe against existing
  const existing = await db
    .select({ fromId: lexicalRelations.fromId, toId: lexicalRelations.toId })
    .from(lexicalRelations)
    .where(and(eq(lexicalRelations.fromType, "vocab"), eq(lexicalRelations.relation, "synonym")));
  const edgeSet = new Set(existing.map((e) => `${e.fromId}:${e.toId}`));
  const values: { fromType: string; fromId: number; toType: string; toId: number; relation: string; note: string }[] = [];
  for (const g of groups) {
    const zh = g.zh.replace(/\s+/g, "");
    const headId = byWord.get(g.words[0].toLowerCase());
    if (!headId) continue;
    for (const w of g.words.slice(1)) {
      const id = byWord.get(w.toLowerCase());
      if (!id || id === headId) continue;
      for (const [a, b] of [[headId, id], [id, headId]]) {
        const key = `${a}:${b}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        values.push({ fromType: "vocab", fromId: a, toType: "vocab", toId: b, relation: "synonym", note: `羊驼阅读同义替换 · ${zh}` });
      }
    }
  }
  const BATCH = 100;
  for (let i = 0; i < values.length; i += BATCH) {
    await db.insert(lexicalRelations).values(values.slice(i, i + BATCH));
  }
  console.log(`synonym edges inserted: ${values.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
