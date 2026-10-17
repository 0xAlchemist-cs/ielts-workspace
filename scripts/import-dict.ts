/** Import the ECDICT corpus (data/ecdict.csv + data/lemma.en.txt) into SQLite.
 *
 * Source: https://github.com/skywind3000/ECDICT (Apache-2.0)
 * Run: npm run db:dict   (downloads nothing — fetch the files first, see README)
 *
 * DICT_CSV / DICT_LEMMA override the source paths — CI imports the tiny
 * committed subset under data/test-fixtures/dict/ instead of the full 66MB
 * corpus (only the headwords the verify suites actually look up).
 *
 * All inserts use prepared statements with bound parameters. */
import fs from "node:fs";
import path from "node:path";
import { sqlite } from "../src/db";
import { GLOSSARY } from "../src/lib/glossary";

const DATA = path.join(process.cwd(), "data");

/** Quote-aware CSV field splitter (one physical line per record in ecdict.csv). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function isPlainWord(w: string): boolean {
  return /^[a-z][a-z'-]{0,23}$/.test(w) && !w.includes("--");
}

function importDictionary() {
  const csvPath = process.env.DICT_CSV ? path.resolve(process.env.DICT_CSV) : path.join(DATA, "ecdict.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`Missing ${csvPath} — download it first (see README).`);
    process.exit(1);
  }
  const raw = fs.readFileSync(csvPath, "utf8");

  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO dictionary
     (word, phonetic, definition_en, translation_zh, pos, collins, oxford, tag, bnc, frq, exchange)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const mustInclude = new Set(Object.keys(GLOSSARY).map((k) => k.toLowerCase()));
  let total = 0;
  let kept = 0;
  const started = Date.now();

  const run = sqlite.transaction((rows: (string | number)[][]) => {
    for (const r of rows) insert.run(...r);
  });

  let batch: (string | number)[][] = [];
  const lines = raw.split("\n");
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    total++;
    const f = splitCsvLine(line);
    if (f.length < 13) continue;
    const [word, phonetic, definition, translation, pos, collinsS, oxfordS, tag, bncS, frqS, exchange] = f;
    const w = word.trim();
    const collins = parseInt(collinsS || "0", 10) || 0;
    const oxford = parseInt(oxfordS || "0", 10) || 0;
    const bnc = parseInt(bncS || "0", 10) || 0;
    const frq = parseInt(frqS || "0", 10) || 0;
    const hasMeaning = !!(definition.trim() || translation.trim());
    const frequent = (bnc > 0 && bnc <= 60000) || (frq > 0 && frq <= 60000) || collins > 0 || oxford > 0;
    if (!hasMeaning) continue;
    if (!mustInclude.has(w.toLowerCase())) {
      if (!isPlainWord(w)) continue;
      if (!frequent) continue;
    }
    batch.push([
      w,
      phonetic.trim(),
      definition.trim(),
      translation.trim(),
      pos.trim(),
      collins,
      oxford,
      tag.trim(),
      bnc,
      frq,
      exchange.trim(),
    ]);
    kept++;
    if (batch.length >= 5000) {
      run(batch);
      batch = [];
    }
  }
  if (batch.length) run(batch);
  console.log(
    `  [dictionary] scanned ${total.toLocaleString()} rows → imported ${kept.toLocaleString()} words in ${
      ((Date.now() - started) / 1000).toFixed(1)
    }s`,
  );
}

function importLemmas() {
  const lemmaPath = process.env.DICT_LEMMA ? path.resolve(process.env.DICT_LEMMA) : path.join(DATA, "lemma.en.txt");
  if (!fs.existsSync(lemmaPath)) {
    console.error(`Missing ${lemmaPath} — download it first (see README).`);
    process.exit(1);
  }
  const raw = fs.readFileSync(lemmaPath, "utf8");
  const insert = sqlite.prepare(`INSERT OR IGNORE INTO word_lemmas (form, base) VALUES (?, ?)`);
  const run = sqlite.transaction((rows: [string, string][]) => {
    for (const [form, base] of rows) insert.run(form, base);
  });

  let kept = 0;
  let batch: [string, string][] = [];
  const started = Date.now();
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(";")) continue;
    const arrow = line.indexOf("->");
    if (arrow < 0) continue;
    const left = line.slice(0, arrow).trim();
    const slash = left.indexOf("/");
    const base = slash >= 0 ? left.slice(0, slash).trim() : left;
    if (!base) continue;
    const forms = line
      .slice(arrow + 2)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && s !== base.toLowerCase());
    for (const form of forms) {
      batch.push([form, base.toLowerCase()]);
      kept++;
      if (batch.length >= 5000) {
        run(batch);
        batch = [];
      }
    }
  }
  if (batch.length) run(batch);
  console.log(
    `  [lemmas] imported ${kept.toLocaleString()} form→base mappings in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

const dictCount = (sqlite.prepare(`SELECT COUNT(*) c FROM dictionary`).get() as { c: number }).c;
if (dictCount > 0) {
  console.log(`Dictionary already imported (${dictCount} words) — delete data/app.db and reseed to redo.`);
} else {
  importDictionary();
  importLemmas();
  const sample = sqlite
    .prepare(`SELECT word, definition_en, translation_zh, bnc, frq FROM dictionary WHERE word IN ('convince','persuade','garment','persuasion')`)
    .all();
  console.log("  sample:", JSON.stringify(sample));
  console.log("ECDICT import complete.");
}
