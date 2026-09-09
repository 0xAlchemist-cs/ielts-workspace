/**
 * Import Cambridge c5–c9 listening sections into ielts_tasks — 100% local
 * (no OCR): question layout from ielts-reader `questions[].source_text`,
 * answers from `items[].answer` (slash variants), cross-validated against
 * the word-aligned transcripts. Audio: public/audio/cambridge (80 files).
 * Idempotent by (source, audio_url). Run: npm run db:listening-c5-9
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { ieltsTasks } from "../src/db/schema";

const READER_DIR = "D:\\雅思\\ielts-reader\\data\\listening";

interface Item {
  number: number;
  answer?: string;
}
interface ReaderFile {
  id: string;
  segments: { en: string }[];
  questions: { source_text: string; items?: Item[] }[];
}

interface BankQuestion {
  question: string;
  answer: string;
  acceptable?: string[];
  subSkill: string;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9%£$ ]/g, " ").replace(/\s+/g, " ").trim();

// static patterns only (no dynamic regex construction)
const BLANK_PAIR = /(\d{1,2})\s*[·.…]{3,}/g; // "3 ········" blank with its number
const STEM_NUM = /^(\d{1,2})\s+(?=\S)/; // "7 The tour costs..."
const Q_RANGE = /Questions\s+(\d+)\s*[–—-]\s*(\d+)/g;

/** Parse "11 by minibus / a minibus 12 15 ..." per number. Sections restart
 * numbering at 1/11/21/31 — the map only opens on the section's first
 * number; a bare number starts the NEXT answer when it equals expected+1
 * (or +2 for choose-TWO pairs); digits inside answers stay put. */
function parseAnswers(raw: string, startQ: number, max: number): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const tokens = raw.trim().split(/\s+/);
  let cur = 0;
  let buf: string[] = [];
  const flush = () => {
    if (cur > 0 && buf.length) {
      const variants = buf.join(" ").split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean);
      out.set(cur, variants);
    }
    buf = [];
  };
  for (const t of tokens) {
    const stripped = t.replace(/^[·.()[\]]+/, "").replace(/[).:\]]+$/, "");
    const num = /^\d{1,2}$/.test(stripped) ? Number(stripped) : null;
    const startsNext = num !== null && num <= max && (cur === 0 ? num === startQ : num === cur + 1 || num === cur + 2);
    if (startsNext) {
      flush();
      cur = num;
    } else {
      buf.push(t);
    }
  }
  flush();
  return out;
}

function buildQuestions(sourceText: string, answers: Map<number, string[]>): BankQuestion[] {
  const lines = sourceText.split("\n").map((l) => l.replace(/\r/g, "").trimEnd());
  const blankLines = new Map<number, number>(); // qNumber -> line index (dot-blank style)
  const stemLines = new Map<number, number>(); // qNumber -> line index (numbered stem style)
  lines.forEach((l, i) => {
    for (const m of l.matchAll(BLANK_PAIR)) {
      const n = Number(m[1]);
      if (!blankLines.has(n)) blankLines.set(n, i);
    }
    const stem = l.match(STEM_NUM);
    if (stem) {
      const n = Number(stem[1]);
      if (!stemLines.has(n)) stemLines.set(n, i);
    }
  });

  const rows: BankQuestion[] = [];
  for (const n of [...answers.keys()].sort((a, b) => a - b)) {
    let context: string;
    let subSkill = "completion";
    if (blankLines.has(n)) {
      const i = blankLines.get(n)!;
      context = lines[i].replace(BLANK_PAIR, (full, numStr) => (Number(numStr) === n ? "[N] __________" : full));
    } else if (stemLines.has(n)) {
      const i = stemLines.get(n)!;
      context = `${lines[i]} [N] __________`;
    } else {
      context = `Question [N] — answer from memory (see original paper)`;
      subSkill = "choice";
    }
    const variants = answers.get(n) ?? [""];
    rows.push({
      question: context.replace("[N]", `[${n}]`),
      answer: variants[0],
      acceptable: variants.length > 1 ? variants.slice(1) : undefined,
      subSkill,
    });
  }
  return rows;
}

async function main() {
  const files = readdirSync(READER_DIR)
    .filter((f) => /^c[5-9]-test[1-4]-l[1-4]\.json$/.test(f))
    .sort();
  console.log(`reader files: ${files.length}`);

  let inserted = 0;
  const suspects: string[] = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(path.join(READER_DIR, f), "utf-8")) as ReaderFile;
    const m = d.id.match(/^c(\d+)-test(\d+)-l(\d+)$/);
    if (!m) continue;
    const [, b, t, p] = m;
    const audioUrl = `/audio/cambridge/c${b}-test${t}-part${p}.mp3`;
    const existing = await db
      .select({ id: ieltsTasks.id })
      .from(ieltsTasks)
      .where(and(eq(ieltsTasks.source, "listening-bank-c5-9"), eq(ieltsTasks.audioUrl, audioUrl)))
      .limit(1);
    if (existing.length) continue;

    const q0 = d.questions?.[0];
    // two shapes across eras: c5–c8 repeat the FULL numbered answer string on
    // every item; c9 carries one short per-question answer on each item
    const ansItems = (q0?.items ?? []).filter((i) => i.answer && i.answer.trim());
    const rawAns = ansItems[0]?.answer ?? "";
    const transcript = norm(d.segments.map((s) => s.en).join(" "));
    let expected = 10;
    let startQ = 1;
    for (const mm of (q0?.source_text ?? "").matchAll(Q_RANGE)) {
      startQ = startQ === 1 ? Number(mm[1]) : Math.min(startQ, Number(mm[1]));
      expected = Math.max(expected, Number(mm[2]));
    }
    const answers =
      rawAns.trim().length < 25
        ? new Map<number, string[]>(
            ansItems
              .filter((i) => i.number >= 1)
              .map((i) => [i.number, (i.answer ?? "").split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean)] as [number, string[]]),
          )
        : parseAnswers(rawAns, startQ, expected);
    const rows = buildQuestions(q0?.source_text ?? "", answers);

    // transcript cross-validation: keep a variant only if it appears in the transcript
    let ok = 0;
    for (const r of rows) {
      const all = [r.answer, ...(r.acceptable ?? [])].filter(Boolean);
      const hits = all.filter((v) => transcript.includes(norm(v)));
      if (hits.length) {
        r.answer = hits[0];
        const rest = all.filter((v) => v !== r.answer);
        r.acceptable = rest.length ? rest : undefined;
        ok++;
      }
    }
    if (rows.length < 4 || ok / rows.length < 0.6) {
      suspects.push(`${d.id}: ${ok}/${rows.length} answers transcript-verified`);
    }
    if (rows.length < 4) {
      // unparseable layout — never insert an empty paper section (it would
      // silently appear in mock assembly as a 0-question part)
      console.log(`  skip ${d.id}: only ${rows.length} questions parsed`);
      continue;
    }

    await db.insert(ieltsTasks).values({
      taskType: "listening_section",
      skill: "listening",
      difficulty: 3,
      topic: "cambridge listening",
      prompt: `剑桥雅思${b} · Test ${t} · Part ${p} — Listening Part ${p}. Listen and complete the questions below.`,
      questions: rows,
      audioUrl,
      timeLimitMinutes: 10,
      source: "listening-bank-c5-9",
    });
    inserted++;
  }
  console.log(`inserted sections: ${inserted}`);
  if (suspects.length) {
    console.log(`suspect sections (${suspects.length}):`);
    suspects.forEach((s) => console.log("  ", s));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
