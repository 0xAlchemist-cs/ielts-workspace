/**
 * Import md-corpus documents (methodology mds, Simon worksheets, model essays)
 * into contents as reading material for the Reading Lab.
 *
 * Source: data/md-corpus/ + manifest.json (built by build_manifest.py).
 * Only manifest entries with importable=true are inserted (English, ≥300 words).
 * Chinese reference material stays as md files and is NOT imported.
 *
 * Fields: cefr B2, difficulty 3, vocabDensity 0.4, grammarComplexity 3,
 * ieltsRelevance 4, minutes = words/180 rounded (min 3).
 * Idempotent: skips titles that already exist in contents.
 * Run: npm run db:contents
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/db";
import { contents } from "../src/db/schema";

interface ManifestEntry {
  file: string;
  title: string;
  topic: string;
  words: number;
  englishRatio: number;
  importable: boolean;
}

async function main() {
  const root = path.join(process.cwd(), "data", "md-corpus");
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf-8"));
  const importable = manifest.filter((m) => m.importable);
  console.log(`Manifest: ${manifest.length} entries, ${importable.length} importable`);

  const existing = await db.select({ title: contents.title }).from(contents);
  const known = new Set(existing.map((e) => e.title));

  let inserted = 0;
  for (const m of importable) {
    if (known.has(m.title)) {
      console.log(`  skip (exists): ${m.title}`);
      continue;
    }
    const raw = readFileSync(path.join(root, m.file), "utf-8");
    // first heading or first 160 chars of plain text as summary
    const plain = raw.replace(/[#*`>|_\[\]()]/g, " ").replace(/\s+/g, " ").trim();
    const summaryEn = plain.slice(0, 157) + "...";
    const minutes = Math.max(3, Math.round(m.words / 180));
    await db.insert(contents).values({
      type: "reading",
      title: m.title,
      topic: m.topic,
      cefr: "B2",
      difficulty: 3,
      vocabDensity: 0.4,
      grammarComplexity: 3,
      ieltsRelevance: 4,
      summaryEn,
      body: raw,
      minutes,
    });
    known.add(m.title);
    inserted++;
    console.log(`  imported: ${m.title} (${m.words} words, ${minutes} min)`);
  }
  console.log(`Done: ${inserted} contents inserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
