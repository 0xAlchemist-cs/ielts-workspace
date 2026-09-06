/**
 * Import writing collocations/phrases (写作collocations + 7分288词) into corpus
 * vocabularies. Only headwords not yet in the corpus (userId IS NULL) are
 * inserted; existing rows untouched. meaningEn enriched from ECDICT.
 * Source: data/vocab-corpus/writing-phrases.json (parse_writing_phrases.py).
 * Run: npm run db:phrases
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, vocabularies } from "../src/db/schema";

interface PhraseEntry { phrase: string; meaningZh: string; topic: string; source: string }

async function main() {
  const file = path.join(process.cwd(), "data", "vocab-corpus", "writing-phrases.json");
  const phrases: PhraseEntry[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`writing phrases: ${phrases.length}`);

  const corpus = await db
    .select({ headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const known = new Set(corpus.map((r) => r.headword.toLowerCase()));

  const missing = phrases.filter((p) => !known.has(p.phrase.toLowerCase()));
  console.log(`already present: ${phrases.length - missing.length}, to insert: ${missing.length}`);

  if (missing.length) {
    const defs = await db
      .select({ word: dictionary.word, def: dictionary.definitionEn })
      .from(dictionary)
      .where(inArray(dictionary.word, missing.map((p) => p.phrase.toLowerCase())));
    const dict = new Map(defs.map((d) => [d.word.toLowerCase(), d.def]));

    const BATCH = 100;
    for (let i = 0; i < missing.length; i += BATCH) {
      await db.insert(vocabularies).values(
        missing.slice(i, i + BATCH).map((p) => ({
          userId: null,
          headword: p.phrase,
          meaningEn: dict.get(p.phrase.toLowerCase()) ?? "",
          meaningZh: p.meaningZh,
          exampleEn: "",
          collocations: [] as string[],
        }))
      );
    }
  }
  console.log(`inserted: ${missing.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
