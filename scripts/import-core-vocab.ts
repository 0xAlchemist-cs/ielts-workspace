/**
 * Enrich the corpus vocabulary with the IELTS-practice ielts_core list.
 *
 * Source: D:/雅思/ielts-repos/IELTS-practice/assets/wordlists/ielts_core.json
 * (3610 entries: word, meaning "n. 中文", example, freq, phonetic).
 *
 * Actions (both idempotent):
 *   1. insert corpus rows (userId=null) for headwords not yet present
 *   2. fill exampleEn on existing corpus rows whose exampleEn is empty
 * meaningEn is enriched from the ECDICT dictionary where available.
 * Run: npm run db:corevocab
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, vocabularies } from "../src/db/schema";

interface CoreEntry {
  word: string;
  meaning: string;
  example: string;
  freq: number;
  phonetic: string;
}

async function main() {
  const src = path.join(process.cwd(), "..", "ielts-repos", "IELTS-practice", "assets", "wordlists", "ielts_core.json");
  const entries: CoreEntry[] = JSON.parse(readFileSync(src, "utf-8"));
  console.log(`ielts_core entries: ${entries.length}`);

  const corpus = await db
    .select({ id: vocabularies.id, headword: vocabularies.headword, exampleEn: vocabularies.exampleEn })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const byWord = new Map(corpus.map((r) => [r.headword.toLowerCase(), r]));

  // ECDICT meaningEn for all words we may touch
  const needed = entries.map((e) => e.word.toLowerCase());
  const dictRows = await db
    .select({ word: dictionary.word, def: dictionary.definitionEn })
    .from(dictionary)
    .where(inArray(dictionary.word, needed));
  const dict = new Map(dictRows.map((d) => [d.word.toLowerCase(), d.def]));
  console.log(`ECDICT matched: ${dict.size}/${needed.length}`);

  // 1. insert missing headwords
  const missing = entries.filter((e) => !byWord.has(e.word.toLowerCase()));
  let inserted = 0;
  const BATCH = 100;
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const returned = await db
      .insert(vocabularies)
      .values(
        slice.map((e) => ({
          userId: null,
          headword: e.word,
          pos: (e.meaning.match(/^[a-z]+\./i)?.[0] ?? "").trim(),
          meaningEn: dict.get(e.word.toLowerCase()) ?? "",
          meaningZh: e.meaning.replace(/^[a-z]+\.\s*/i, ""),
          exampleEn: e.example ?? "",
          collocations: [] as string[],
        }))
      )
      .returning({ id: vocabularies.id, headword: vocabularies.headword });
    for (const r of returned) byWord.set(r.headword.toLowerCase(), { ...r, exampleEn: "" });
    inserted += slice.length;
  }
  console.log(`inserted: ${inserted}`);

  // 2. backfill exampleEn on existing rows that lack one
  let filled = 0;
  for (const e of entries) {
    const row = byWord.get(e.word.toLowerCase());
    if (!row || row.exampleEn || !e.example) continue;
    await db.update(vocabularies).set({ exampleEn: e.example }).where(inArray(vocabularies.id, [row.id]));
    filled++;
  }
  console.log(`exampleEn backfilled: ${filled}`);

  const [total] = await db
    .select({ n: vocabularies.id })
    .from(vocabularies)
    .where(isNull(vocabularies.userId))
    .limit(1);
  void total;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
