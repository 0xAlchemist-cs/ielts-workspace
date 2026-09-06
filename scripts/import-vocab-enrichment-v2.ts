/**
 * Vocab enrichment round 2:
 *   1. insert missing corpus words from the 机考听力答案词第二版 list (whale3070)
 *   2. backfill exampleEn gaps with real Cambridge 4-19 sentences (chunsi-w corpus)
 *
 * Source: data/vocab-corpus/enrichment-v2.json (built by parse_enrichment_v2.py).
 * Idempotent: only missing headwords inserted, only empty exampleEn filled.
 * Run: npm run db:enrich
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, vocabularies } from "../src/db/schema";

interface WordEntry { headword: string; meaningZh: string }
interface ExampleEntry { sentence: string; source: string; location: string }

async function main() {
  const file = path.join(process.cwd(), "data", "vocab-corpus", "enrichment-v2.json");
  const { words, examples } = JSON.parse(readFileSync(file, "utf-8")) as {
    words: WordEntry[];
    examples: Record<string, ExampleEntry>;
  };
  console.log(`source words: ${words.length}, example headwords: ${Object.keys(examples).length}`);

  const corpus = await db
    .select({ id: vocabularies.id, headword: vocabularies.headword, exampleEn: vocabularies.exampleEn })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const byWord = new Map(corpus.map((r) => [r.headword.toLowerCase(), r]));

  // 1. insert missing headwords (meaningEn from ECDICT)
  const missing = words.filter((w) => !byWord.has(w.headword.toLowerCase()));
  if (missing.length) {
    const defs = await db
      .select({ word: dictionary.word, def: dictionary.definitionEn })
      .from(dictionary)
      .where(inArray(dictionary.word, missing.map((w) => w.headword.toLowerCase())));
    const dict = new Map(defs.map((d) => [d.word.toLowerCase(), d.def]));
    const BATCH = 100;
    for (let i = 0; i < missing.length; i += BATCH) {
      const slice = missing.slice(i, i + BATCH);
      const returned = await db
        .insert(vocabularies)
        .values(
          slice.map((w) => ({
            userId: null,
            headword: w.headword,
            meaningEn: dict.get(w.headword.toLowerCase()) ?? "",
            meaningZh: w.meaningZh,
            exampleEn: "",
            collocations: [] as string[],
          }))
        )
        .returning({ id: vocabularies.id, headword: vocabularies.headword });
      for (const r of returned) byWord.set(r.headword.toLowerCase(), { ...r, exampleEn: "" });
    }
  }
  console.log(`words inserted: ${missing.length}`);

  // 2. backfill exampleEn gaps with real Cambridge sentences
  let filled = 0;
  const updates: { id: number; example: string }[] = [];
  for (const [word, ex] of Object.entries(examples)) {
    const row = byWord.get(word);
    if (!row || row.exampleEn) continue;
    // strip podcast/listening speaker prefixes: "OLIVIA: …"
    const sentence = ex.sentence.replace(/^[A-Z][A-Z' ]{1,20}:\s*/, "").trim();
    if (sentence.length < 40) continue;
    updates.push({ id: row.id, example: sentence });
  }
  for (const u of updates) {
    await db.update(vocabularies).set({ exampleEn: u.example }).where(inArray(vocabularies.id, [u.id]));
    filled++;
  }
  console.log(`exampleEn backfilled: ${filled}`);

  const [total] = await db
    .select({ id: vocabularies.id })
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
