/**
 * Wire per-word pronunciation audio onto corpus vocabulary rows.
 *
 * Audio source (copied once from the my-ielts material repo):
 *   public/audio/vocab/<NN_topic>/<word>.mp3   3696 words across 22 topics
 *   public/audio/179/<word>.mp3                179 listening key words
 *
 * Matching: filename (lowercased, .mp3 stripped) === vocabularies.headword
 * on corpus rows (userId IS NULL). The word→topic map comes from
 * data/vocab-corpus/import.json so each word resolves to its own topic dir.
 *
 * Idempotent: rows that already have audio_url are left untouched.
 * Run: npm run db:audio
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { vocabularies } from "../src/db/schema";

const AUDIO_ROOT = path.join(process.cwd(), "public", "audio");

function toUrl(segment: string): string {
  return "/" + segment.split(path.sep).map(encodeURIComponent).join("/");
}

async function main() {
  // 1. word → audio url candidates from the filesystem
  const urlByWord = new Map<string, string>();
  const topicDirs = readdirSync(path.join(AUDIO_ROOT, "vocab"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const dir of topicDirs) {
    for (const f of readdirSync(path.join(AUDIO_ROOT, "vocab", dir))) {
      if (!f.toLowerCase().endsWith(".mp3")) continue;
      const word = f.replace(/\.mp3$/i, "").toLowerCase();
      if (!urlByWord.has(word)) urlByWord.set(word, toUrl(path.join("audio", "vocab", dir, f)));
    }
  }
  const before179 = urlByWord.size;
  for (const f of readdirSync(path.join(AUDIO_ROOT, "179"))) {
    if (!f.toLowerCase().endsWith(".mp3")) continue;
    const word = f.replace(/\.mp3$/i, "").toLowerCase();
    if (!urlByWord.has(word)) urlByWord.set(word, toUrl(path.join("audio", "179", f)));
  }
  console.log(`Audio files indexed: ${urlByWord.size} (${urlByWord.size - before179} from 179 dir)`);

  // 2. corpus vocab rows without audio
  const rows = await db
    .select({ id: vocabularies.id, headword: vocabularies.headword })
    .from(vocabularies)
    .where(isNull(vocabularies.userId));
  let wired = 0;
  const missing: string[] = [];
  for (const r of rows) {
    const url = urlByWord.get(r.headword.toLowerCase());
    if (!url) {
      if (missing.length < 5) missing.push(r.headword);
      continue;
    }
    await db
      .update(vocabularies)
      .set({ audioUrl: url })
      .where(and(eq(vocabularies.id, r.id), isNull(vocabularies.audioUrl)));
    wired++;
  }
  console.log(`Corpus rows: ${rows.length}, wired: ${wired}, no audio found: ${rows.length - wired}`);
  if (missing.length) console.log(`  (no-audio examples: ${missing.join(", ")})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
