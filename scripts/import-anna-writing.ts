/**
 * Parse the Anna 安小雅 2024.9–12 writing material (converted from PDF,
 * data/md-corpus/anna-2024-0912-raw.md) into:
 *   - writing_task2 / writing_task1 prompts → ielts_tasks (dedup by prompt)
 *   - bilingual-source model essays (English only) → contents (fingerprint dedup)
 * Idempotent. Run: npm run db:anna
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { contents, ieltsTasks } from "../src/db/schema";
import { contentFingerprint } from "../src/server/services/content-selection";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const stripBold = (s: string) => s.replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

interface Entry {
  zhTitle: string;
  prompt: string;
  essay: string;
}

/** split a block into (bold-runs-as-prompt, rest-as-essay) */
function splitBoldPrompt(block: string): { prompt: string; rest: string } {
  const runs: string[] = [];
  let rest = block;
  const re = /^\s*(\*{2,3}[^*]+\*{2,3})\s*/;
  for (let i = 0; i < 8; i++) {
    const m = rest.match(re);
    if (!m) break;
    runs.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { prompt: stripBold(runs.join(" ")), rest };
}

function parseTask2(md: string): Entry[] {
  const out: Entry[] = [];
  const parts = md.split(/^#### \d+：/m).slice(1);
  for (const raw of parts) {
    const nl = raw.indexOf("\n");
    const zhTitle = raw.slice(0, nl).trim();
    let body = raw.slice(nl + 1);
    const cut = body.search(/思路解析|中文翻译/);
    if (cut > 0) body = body.slice(0, cut);
    const { prompt, rest } = splitBoldPrompt(body);
    const essay = rest
      .replace(/\(\d+\s*words?\)|\[\d+\s*words?\]/gi, "")
      .replace(/Example answer：?/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (prompt.includes("?") && wordCount(essay) > 120) out.push({ zhTitle, prompt, essay });
  }
  return out;
}

function parseTask1(md: string): Entry[] {
  const out: Entry[] = [];
  const parts = md.split(/^#### No\. \d+：/m).slice(1);
  for (const raw of parts) {
    const nl = raw.indexOf("\n");
    const enTitle = raw.slice(0, nl).trim();
    let body = raw.slice(nl + 1);
    const cut = body.search(/中文翻译|思路解析/);
    if (cut > 0) body = body.slice(0, cut);
    body = body.replace(/^#+ Write at least.*$/m, " ");
    const { prompt, rest } = splitBoldPrompt(body);
    const essay = rest.replace(/Example answer：?/, "").replace(/\(\d+\s*words?\)/gi, "").replace(/\s+/g, " ").trim();
    if (prompt.length > 60 && wordCount(essay) > 100) {
      out.push({ zhTitle: enTitle, prompt, essay });
    }
  }
  return out;
}

async function importPrompts(entries: Entry[], taskType: "writing_task1" | "writing_task2") {
  const existing = new Set<string>();
  for (const r of await db.select({ p: ieltsTasks.prompt }).from(ieltsTasks).where(eq(ieltsTasks.taskType, taskType))) {
    existing.add(norm(r.p));
  }
  let n = 0;
  for (const e of entries) {
    if (existing.has(norm(e.prompt))) continue;
    await db.insert(ieltsTasks).values({
      taskType,
      skill: "writing",
      difficulty: 3,
      topic: "writing",
      prompt: e.prompt,
      timeLimitMinutes: taskType === "writing_task1" ? 20 : 40,
      source: "writing-anna-2024-9-12",
    });
    existing.add(norm(e.prompt));
    n++;
  }
  return n;
}

async function importEssays(entries: Entry[]) {
  const prints = new Set(
    (await db.select({ f: contents.fingerprint }).from(contents)).map((r) => r.f).filter(Boolean),
  );
  let n = 0;
  for (const e of entries) {
    const body = `${e.prompt}\n\n${e.essay}`;
    if (wordCount(body) < 150) continue;
    const fp = contentFingerprint(body);
    if (prints.has(fp)) continue;
    await db.insert(contents).values({
      type: "reading",
      title: `Anna 范文 · ${e.zhTitle}`,
      topic: "writing",
      cefr: "B2",
      difficulty: 3,
      ieltsRelevance: 5,
      minutes: Math.max(3, Math.round(wordCount(body) / 180)),
      body,
      fingerprint: fp,
    });
    prints.add(fp);
    n++;
  }
  return n;
}

async function main() {
  const md = readFileSync(path.join(process.cwd(), "data", "md-corpus", "anna-2024-0912-raw.md"), "utf-8");
  const splitAt = md.indexOf("## （A 类小作文）");
  const task2 = parseTask2(md.slice(0, splitAt));
  const task1 = parseTask1(md.slice(splitAt));
  console.log(`parsed: task2 ${task2.length}, task1 ${task1.length}`);

  const t2 = await importPrompts(task2, "writing_task2");
  const t1 = await importPrompts(task1, "writing_task1");
  const essays = await importEssays([...task2, ...task1]);
  console.log(`inserted: task2 ${t2}, task1 ${t1}, model essays ${essays}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
