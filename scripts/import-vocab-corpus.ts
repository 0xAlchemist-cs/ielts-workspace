/**
 * Import the my-ielts vocabulary corpus + synonym network.
 *
 * Source: data/vocab-corpus/import.json (built by the parser at
 * D:/雅思/ielts-repos/my-ielts/parse_vocab.py) —
 *   vocab:     3632 headwords (词汇真经, 22 topics) word|pos|中文|example
 *   synonyms:  1045 edges (听力179 + 阅读538 考点词同义替换)
 *
 * Writes:
 *   vocabularies       userId=null corpus rows; meaningEn enriched from ECDICT
 *                      (dictionary table) where available
 *   lexicalRelations   relation="synonym" edges between corpus vocab rows;
 *                      missing endpoint words get minimal rows first
 *
 * Idempotent: existing corpus headwords and existing synonym edges are skipped.
 * Run: npm run db:vocab
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, lexicalRelations, vocabularies } from "../src/db/schema";

interface VocabRow {
  headword: string;
  pos: string;
  meaningZh: string;
  exampleEn: string;
  topic: string;
}

interface SynonymEdge {
  from: string;
  to: string;
  source: "listening179" | "reading538";
  note: string;
}

const NOTE_LABEL = { listening179: "听力179同义替换", reading538: "阅读538考点词" } as const;

async function main() {
  const file = path.join(process.cwd(), "data", "vocab-corpus", "import.json");
  const { vocab, synonyms } = JSON.parse(readFileSync(file, "utf-8")) as {
    vocab: VocabRow[];
    synonyms: SynonymEdge[];
  };
  console.log(`Loaded ${vocab.length} words, ${synonyms.length} synonym edges`);

  // ECDICT lookup map for meaningEn enrichment (only for words we will touch)
  const needed = new Set<string>(vocab.map((v) => v.headword.toLowerCase()));
  for (const e of synonyms) {
    needed.add(e.from.toLowerCase());
    needed.add(e.to.toLowerCase());
  }
  const dict = new Map<string, string>();
  for (const d of await db
    .select({ word: dictionary.word, def: dictionary.definitionEn })
    .from(dictionary)) {
    const w = d.word.toLowerCase();
    if (needed.has(w) && d.def && !dict.has(w)) dict.set(w, d.def);
  }
  console.log(`ECDICT English definitions matched for ${dict.size}/${needed.size} words`);

  // Existing corpus headwords (idempotency + id map; edges connect corpus rows only)
  const corpusRows = await db
    .select({ id: vocabularies.id, headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const idByWord = new Map<string, number>();
  for (const r of corpusRows) idByWord.set(r.headword.toLowerCase(), r.id);
  console.log(`Existing corpus vocab rows: ${corpusRows.length}`);

  // 1. Insert vocabulary corpus rows (skip existing headwords)
  const toInsert = vocab.filter((v) => !idByWord.has(v.headword.toLowerCase()));
  let inserted = 0;
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH);
    const returned = await db
      .insert(vocabularies)
      .values(
        slice.map((v) => ({
          userId: null,
          headword: v.headword,
          pos: v.pos,
          meaningEn: dict.get(v.headword.toLowerCase()) ?? "",
          meaningZh: v.meaningZh,
          exampleEn: v.exampleEn,
          collocations: [] as string[],
        }))
      )
      .returning({ id: vocabularies.id, headword: vocabularies.headword });
    for (const r of returned) idByWord.set(r.headword.toLowerCase(), r.id);
    inserted += slice.length;
    console.log(`  vocab ${inserted}/${toInsert.length}`);
  }

  // 2. Ensure synonym endpoint words exist (minimal rows)
  const endpoints = new Set<string>();
  for (const e of synonyms) {
    if (!idByWord.has(e.from.toLowerCase())) endpoints.add(e.from);
    if (!idByWord.has(e.to.toLowerCase())) endpoints.add(e.to);
  }
  const endList = [...endpoints];
  for (let i = 0; i < endList.length; i += BATCH) {
    const slice = endList.slice(i, i + BATCH);
    const returned = await db
      .insert(vocabularies)
      .values(
        slice.map((w) => ({
          userId: null,
          headword: w,
          meaningEn: dict.get(w.toLowerCase()) ?? "",
          meaningZh: "",
          exampleEn: "",
          collocations: [] as string[],
        }))
      )
      .returning({ id: vocabularies.id, headword: vocabularies.headword });
    for (const r of returned) idByWord.set(r.headword.toLowerCase(), r.id);
  }
  console.log(`Endpoint-only words inserted: ${endList.length}`);

  // 3. Insert synonym edges (dedupe against existing + within batch)
  const existingEdges = await db
    .select({ fromId: lexicalRelations.fromId, toId: lexicalRelations.toId })
    .from(lexicalRelations)
    .where(and(eq(lexicalRelations.fromType, "vocab"), eq(lexicalRelations.relation, "synonym")));
  const edgeSet = new Set(existingEdges.map((e) => `${e.fromId}:${e.toId}`));
  const edgeValues: { fromType: string; fromId: number; toType: string; toId: number; relation: string; note: string }[] = [];
  for (const e of synonyms) {
    const fromId = idByWord.get(e.from.toLowerCase());
    const toId = idByWord.get(e.to.toLowerCase());
    if (!fromId || !toId) continue;
    const key = `${fromId}:${toId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edgeValues.push({
      fromType: "vocab",
      fromId,
      toType: "vocab",
      toId,
      relation: "synonym",
      note: `${NOTE_LABEL[e.source]}${e.note ? " · " + e.note : ""}`,
    });
  }
  for (let i = 0; i < edgeValues.length; i += BATCH) {
    await db.insert(lexicalRelations).values(edgeValues.slice(i, i + BATCH));
  }
  console.log(`Synonym edges inserted: ${edgeValues.length} (skipped ${synonyms.length - edgeValues.length})`);

  const total = await db.select({ id: vocabularies.id }).from(vocabularies);
  console.log(`Done. vocabularies rows now: ${total.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
