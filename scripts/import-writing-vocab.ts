/**
 * Import 雅思写作词汇 bold word pairs (word + 中文) into corpus vocabularies.
 * Missing headwords only; meaningEn from ECDICT.
 * Source: data/vocab-corpus/writing-vocab.json
 * Run: npm run db:writingvocab
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, vocabularies } from "../src/db/schema";

interface WordEntry { headword: string; meaningZh: string }

async function main() {
  const file = path.join(process.cwd(), "data", "vocab-corpus", "writing-vocab.json");
  const words: WordEntry[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`writing vocab entries: ${words.length}`);

  const corpus = await db
    .select({ headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const known = new Set(corpus.map((r) => r.headword.toLowerCase()));
  const missing = words.filter((w) => !known.has(w.headword.toLowerCase()));
  console.log(`to insert: ${missing.length}`);

  if (missing.length) {
    const defs = await db
      .select({ word: dictionary.word, def: dictionary.definitionEn })
      .from(dictionary)
      .where(inArray(dictionary.word, missing.map((w) => w.headword.toLowerCase())));
    const dict = new Map(defs.map((d) => [d.word.toLowerCase(), d.def]));
    const BATCH = 100;
    for (let i = 0; i < missing.length; i += BATCH) {
      await db.insert(vocabularies).values(
        missing.slice(i, i + BATCH).map((w) => ({
          userId: null,
          headword: w.headword,
          meaningEn: dict.get(w.headword.toLowerCase()) ?? "",
          meaningZh: w.meaningZh,
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
