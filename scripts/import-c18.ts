/** Import real Cambridge 18 audio (Section 1 & 2) as listening contents.
 * Audio lives in public/audio/c18/*.mp3 (downloaded once from the user's
 * materials repo). Transcripts are NOT fabricated: the PDF is a scan, so the
 * Lab offers a paste-in box; everything downstream is built for real text. */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { contents } from "../src/db/schema";

const ITEMS = [
  { title: "Cambridge 18 · Test 1 · Section 1 (part 1)", audio: "/audio/c18/t1s1-p1.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 1 (part 2)", audio: "/audio/c18/t1s1-p2.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 1 (part 3)", audio: "/audio/c18/t1s1-p3.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 1 (part 4)", audio: "/audio/c18/t1s1-p4.mp3", topic: "real audio", minutes: 4 },
  { title: "Cambridge 18 · Section 2 (part 1)", audio: "/audio/c18/s2-p1.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Section 2 (part 2)", audio: "/audio/c18/s2-p2.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Section 2 (part 3)", audio: "/audio/c18/s2-p3.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Section 2 (part 4)", audio: "/audio/c18/s2-p4.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 3 (part 1)", audio: "/audio/c18/t1s3-p1.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 3 (part 2)", audio: "/audio/c18/t1s3-p2.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 3 (part 3)", audio: "/audio/c18/t1s3-p3.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 3 (part 4)", audio: "/audio/c18/t1s3-p4.mp3", topic: "real audio", minutes: 4 },
  { title: "Cambridge 18 · Test 1 · Section 4 (part 1)", audio: "/audio/c18/t1s4-p1.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 4 (part 2)", audio: "/audio/c18/t1s4-p2.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 4 (part 3)", audio: "/audio/c18/t1s4-p3.mp3", topic: "real audio", minutes: 3 },
  { title: "Cambridge 18 · Test 1 · Section 4 (part 4)", audio: "/audio/c18/t1s4-p4.mp3", topic: "real audio", minutes: 4 },
];

async function main() {
  let added = 0;
  for (const item of ITEMS) {
    const existing = await db.select({ id: contents.id }).from(contents).where(eq(contents.title, item.title)).limit(1);
    if (existing.length) continue;
    await db.insert(contents).values({
      type: "listening",
      title: item.title,
      topic: item.topic,
      cefr: "B1",
      difficulty: 3,
      vocabDensity: 0.4,
      grammarComplexity: 3,
      ieltsRelevance: 5,
      summaryEn: "Real Cambridge 18 recording at full exam speed. Global listening + miss detection work immediately; paste the transcript (if you have the book) to unlock line-level analysis.",
      body: "",
      audioUrl: item.audio,
      minutes: item.minutes,
    });
    added++;
  }
  console.log(`C18 real-audio contents: ${added} added`);
  process.exit(0);
}
main();
