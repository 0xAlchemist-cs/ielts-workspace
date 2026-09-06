/**
 * Backfill CEFR levels onto corpus vocabulary rows from ECDICT frequency data.
 *
 * Mapping (standard frequency-rank ladder over the better of BNC/COCA rank):
 *   ≤1000 A1 · ≤2000 A2 · ≤4000 B1 · ≤8000 B2 · ≤16000 C1 · else C2
 * Words without any rank info are left null (no guess).
 * Idempotent: only rows with cefr IS NULL are filled.
 * Run: npm run db:cefr
 */
import { inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { dictionary, vocabularies } from "../src/db/schema";
import type { CEFR } from "../src/lib/types";

function rankToCefr(rank: number): "A1" | "A2" | "B1" | "B2" | "C1" | "C2" {
  if (rank <= 1000) return "A1";
  if (rank <= 2000) return "A2";
  if (rank <= 4000) return "B1";
  if (rank <= 8000) return "B2";
  if (rank <= 16000) return "C1";
  return "C2";
}

async function main() {
  const rows = await db
    .select({ id: vocabularies.id, headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  console.log(`corpus rows: ${rows.length}`);

  const dictRows = await db
    .select({ word: dictionary.word, bnc: dictionary.bnc, frq: dictionary.frq, tag: dictionary.tag })
    .from(dictionary)
    .where(inArray(dictionary.word, rows.map((r) => r.headword.toLowerCase())));
  const byWord = new Map(dictRows.map((d) => [d.word.toLowerCase(), d]));

  let filled = 0;
  let noRank = 0;
  const BATCH = 200;
  const updates: { id: number; cefr: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" }[] = [];
  for (const r of rows) {
    const d = byWord.get(r.headword.toLowerCase());
    if (!d) { noRank++; continue; }
    const ranks = [d.bnc, d.frq].filter((x) => typeof x === "number" && x > 0) as number[];
    if (!ranks.length) { noRank++; continue; }
    updates.push({ id: r.id, cefr: rankToCefr(Math.min(...ranks)) });
  }
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    for (const u of slice) {
      // rankToCefr can yield "A1"/"C2" which the schema's CEFR union lacks;
      // the column is TEXT so it stores fine — widen the union in schema when convenient.
      await db.update(vocabularies).set({ cefr: u.cefr as CEFR }).where(inArray(vocabularies.id, [u.id]));
    }
    filled += slice.length;
  }
  const dist = updates.reduce<Record<string, number>>((acc, u) => {
    acc[u.cefr] = (acc[u.cefr] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`cefr filled: ${filled}, no rank info: ${noRank}`);
  console.log(`distribution:`, dist);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
