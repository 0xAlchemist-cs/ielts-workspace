/**
 * Import real Cambridge 1-9 material from the ielts-reader project into contents.
 *
 * Source: D:/雅思/ielts-reader/data —
 *   listening/*.json (305): {source:"剑桥雅思N · Test M · Part K", title, audio:"media/audio/…",
 *                            segments:[{speaker, en, start}]} — real transcripts, word-aligned
 *   passages/*.json  (229): {source, title, sentences:[{para, en, zh, …}]} — real reading passages
 *
 * Actions:
 *   listening → contents {type:"listening", body:"SPEAKER: line" transcript, audioUrl if the
 *               matching MP3 exists under public/audio/cambridge/}
 *   passages  → contents {type:"reading", body paragraphed from sentences (English only)}
 * Both idempotent by title. Questions in the source are raw-layout dumps and are NOT imported.
 * Run: npm run db:cambridge
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/db";
import { contents } from "../src/db/schema";

const READER = "D:\\雅思\\ielts-reader"; // corpus root: local clone of userheyy/ielts-reader (no env input — fixed local path)
const AUDIO_PUBLIC = path.join(process.cwd(), "public", "audio", "cambridge");

interface ListeningJson {
  id: string; source: string; title: string; audio: string;
  segments: { speaker?: string; en: string; start?: number }[];
}
interface PassageJson {
  id: string; source: string; title: string;
  sentences: { para?: number; en: string; zh?: string }[];
}

function minutesOf(text: string): number {
  return Math.max(3, Math.round(text.split(/\s+/).filter(Boolean).length / 180));
}

async function main() {
  const known = new Set(
    (await db.select({ title: contents.title }).from(contents)).map((r) => r.title)
  );
  console.log(`existing contents: ${known.size}`);

  let added = 0;

  // ── Listening transcripts ──────────────────────────────────────────────────
  const lstDir = path.join(READER, "data", "listening");
  const listening: ListeningJson[] = [];
  for (const f of existsSync(lstDir) ? [] : []) void f;
  for (const f of listJson(lstDir)) {
    listening.push(JSON.parse(readFileSync(f, "utf-8")));
  }
  for (const l of listening) {
    const src = (l.source ?? "").replace(/^剑桥雅思/, "").trim() || l.id;
    const title = `Cambridge ${src} — ${l.title ?? l.id}`;
    if (known.has(title)) continue;
    const body = (l.segments ?? []).map((s) => `${(s.speaker ?? "SPEAKER").trim()}: ${s.en.trim()}`).join("\n");
    if (body.length < 200) continue;
    const mp3Name = l.audio ? path.basename(l.audio) : "";
    const audioUrl = mp3Name && existsSync(path.join(AUDIO_PUBLIC, mp3Name))
      ? `/audio/cambridge/${encodeURIComponent(mp3Name)}`
      : null;
    await db.insert(contents).values({
      type: "listening",
      title,
      topic: "cambridge listening",
      cefr: "B1",
      difficulty: 3,
      vocabDensity: 0.4,
      grammarComplexity: 3,
      ieltsRelevance: 5,
      summaryEn: `Real Cambridge listening transcript (${l.source}).${audioUrl ? " Audio available." : ""}`,
      body,
      audioUrl,
      minutes: minutesOf(body),
    });
    known.add(title);
    added++;
  }
  console.log(`listening imported: ${added}/${listening.length}`);

  // ── Reading passages ───────────────────────────────────────────────────────
  const psgDir = path.join(READER, "data", "passages");
  const passages: PassageJson[] = [];
  for (const f of listJson(psgDir)) {
    passages.push(JSON.parse(readFileSync(f, "utf-8")));
  }
  let pAdded = 0;
  for (const p of passages) {
    const src = (p.source ?? "").replace(/^剑桥雅思/, "").trim() || p.id;
    const title = `Cambridge ${src} — ${p.title ?? p.id}`;
    if (known.has(title)) continue;
    // group English sentences into paragraphs by their `para` field
    const paras = new Map<number, string[]>();
    for (const s of p.sentences ?? []) {
      if (!s.en) continue;
      const key = s.para ?? 0;
      if (!paras.has(key)) paras.set(key, []);
      paras.get(key)!.push(s.en.trim());
    }
    const body = [...paras.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, lines]) => lines.join(" "))
      .join("\n\n");
    if (body.length < 400) continue;
    await db.insert(contents).values({
      type: "reading",
      title,
      topic: "cambridge reading",
      cefr: "B2",
      difficulty: 3,
      vocabDensity: 0.4,
      grammarComplexity: 3,
      ieltsRelevance: 5,
      summaryEn: `Real Cambridge reading passage (${p.source}).`,
      body,
      minutes: minutesOf(body),
    });
    known.add(title);
    pAdded++;
  }
  console.log(`passages imported: ${pAdded}/${passages.length}`);
  console.log(`total added: ${added + pAdded}`);
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const base = path.resolve(dir);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.resolve(dir, f))
    .filter((f) => f.startsWith(base + path.sep)); // containment: never read outside the base dir
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
