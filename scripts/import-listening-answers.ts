/**
 * Import Cambridge listening answer words (350) into corpus vocabularies.
 *
 * Source: data/listening-answers/answers.json (parsed by parse_ocr_extras.py
 * from the OCR'd PDF 雅思听力350个剑桥雅思听力基础答案词).
 * Idempotent: only headwords not yet in the corpus (userId IS NULL) are
 * inserted; existing rows are left untouched. meaningEn enriched from ECDICT.
 * Run: npm run db:answers
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, vocabularies } from "../src/db/schema";

interface AnswerWord {
  headword: string;
  pos: string;
  meaningZh: string;
}

async function main() {
  const file = path.join(process.cwd(), "data", "listening-answers", "answers.json");
  const words: AnswerWord[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`answer words: ${words.length}`);

  const corpus = await db
    .select({ headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  const known = new Set(corpus.map((r) => r.headword.toLowerCase()));

  const missing = words.filter((w) => !known.has(w.headword.toLowerCase()));
  console.log(`already in corpus: ${words.length - missing.length}, to insert: ${missing.length}`);

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
          pos: w.pos,
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
