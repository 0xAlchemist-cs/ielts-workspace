/** Import the Cambridge listening bank (c10-c19) into ielts_tasks.
 * Source data: data/listening-bank/import.json (built by parse_bank.py —
 * official papers from ielts-reader + official answers from the gold pages).
 * One task per part (16 per book), linked to its audio via contents.audio_url.
 * Idempotent: skips entirely if source rows already exist.  Run: npm run db:listening */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { contents, ieltsTasks } from "../src/db/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "listening-bank-c10-19";

interface ImportQuestion {
  number: number;
  prompt: string;
  answer: string;
  acceptable: string[];
}
interface ImportRecord {
  book: string;
  test: number;
  part: number;
  title: string;
  source_label: string;
  questions: ImportQuestion[];
}

/** Narrow a serialized paper chunk to the entry line(s) that contain this
 *  question's [N] blank marker — ielts-reader items carry overlapping windows
 *  of the whole paper; the learner only needs their own blank's context. */
function blankContext(prompt: string, number: number): string {
  const marker = `[${number}]`;
  const at = prompt.indexOf(marker);
  if (at < 0) return prompt.trim();
  const units = prompt.split(/(?=[●\n])|\s{3,}/);
  const hit = units.find((u) => u.includes(marker));
  const text = (hit ?? prompt).replace(/\s+/g, " ").trim();
  return text.length >= 12 ? text : prompt.trim();
}

async function main() {
  const [existing] = await db
    .select({ id: ieltsTasks.id })
    .from(ieltsTasks)
    .where(eq(ieltsTasks.source, SOURCE))
    .limit(1);
  if (existing) {
    console.log(`listening bank already imported (task ${existing.id}) — nothing to do`);
    return;
  }

  const records: ImportRecord[] = JSON.parse(
    readFileSync(join(process.cwd(), "data", "listening-bank", "import.json"), "utf-8"),
  );

  // audio lookup: contents rows carry the cambridge audio url per part
  const audioRows = await db
    .select({ title: contents.title, audioUrl: contents.audioUrl, body: contents.body })
    .from(contents)
    .where(eq(contents.type, "listening"));
  const byAudio = new Map(audioRows.filter((r) => r.audioUrl).map((r) => [r.audioUrl!, r]));

  let inserted = 0;
  let withAudio = 0;
  for (const rec of records) {
    const audioUrl = `/audio/cambridge/${rec.book}-test${rec.test}-part${rec.part}.mp3`;
    const match = byAudio.get(audioUrl);
    const questions = rec.questions.map((q) => ({
      question: blankContext(q.prompt, q.number),
      answer: q.answer,
      ...(q.acceptable.length ? { acceptable: q.acceptable } : {}),
      subSkill: "completion",
    }));
    await db.insert(ieltsTasks).values({
      taskType: "listening_section",
      skill: "listening",
      difficulty: rec.part >= 3 ? 4 : 3,
      topic: "cambridge listening",
      prompt: `${rec.source_label} — ${rec.title}. Listen and complete the questions. (Answers: case-insensitive; slash variants accepted.)`,
      content: match ? match.body : null,
      questions,
      audioUrl: match ? audioUrl : null,
      timeLimitMinutes: 10,
      source: SOURCE,
    });
    inserted++;
    if (match) withAudio++;
  }
  console.log(`listening bank imported: ${inserted} parts (${withAudio} with audio) from ${SOURCE}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
