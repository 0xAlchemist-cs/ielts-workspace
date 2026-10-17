import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  chunks,
  contents,
  learningProfiles,
  lexicalRelations,
  listeningClips,
  sentences,
  users,
  vocabularies,
} from "../src/db/schema";
import { splitSentences } from "../src/lib/text";
import { seedContents, clipsBody } from "./seed-data/contents";
import { seedChunks } from "./seed-data/chunks";
import { chunkRelations, corpusWords, wordRelations } from "./seed-data/relations";

async function main() {
  const existing = await db.select({ id: contents.id }).from(contents).limit(1);
  if (existing.length > 0) {
    console.log("Seed data already present — skipping. Delete data/app.db to reseed.");
    return;
  }

  // 1. Contents + sentences + clips ──────────────────────────────────────────
  const contentIdBySlug = new Map<string, number>();
  for (const c of seedContents) {
    const body = c.type === "reading" ? c.body : clipsBody(c);
    const [row] = await db
      .insert(contents)
      .values({
        type: c.type,
        title: c.title,
        topic: c.topic,
        cefr: c.cefr,
        difficulty: c.difficulty,
        vocabDensity: c.vocabDensity,
        grammarComplexity: c.grammarComplexity,
        ieltsRelevance: c.ieltsRelevance,
        summaryEn: c.summaryEn,
        body,
        minutes: c.minutes,
      })
      .returning({ id: contents.id });
    contentIdBySlug.set(c.slug, row.id);

    const sents = splitSentences(body);
    if (sents.length) {
      await db.insert(sentences).values(
        sents.map((text, i) => ({ contentId: row.id, orderNo: i, text })),
      );
    }
    if (c.clips?.length) {
      await db.insert(listeningClips).values(
        c.clips.map((cl, i) => ({
          contentId: row.id,
          orderNo: i,
          startMs: 0,
          endMs: 0,
          text: `${cl.speaker}: ${cl.text}`,
          phenomena: cl.phenomena,
        })),
      );
    }
    console.log(`  [content] ${c.type} "${c.title}" → id=${row.id}, ${sents.length} sentences`);
  }

  // 2. Corpus chunks ─────────────────────────────────────────────────────────
  const chunkIdByText = new Map<string, number>();
  for (const ck of seedChunks) {
    const sourceContentId = contentIdBySlug.get(ck.sourceSlug) ?? null;
    const [row] = await db
      .insert(chunks)
      .values({
        userId: null,
        text: ck.text,
        pattern: ck.pattern,
        meaningEn: ck.meaningEn,
        meaningZh: ck.meaningZh,
        examples: ck.examples,
        register: ck.register,
        sourceContentId,
      })
      .returning({ id: chunks.id });
    chunkIdByText.set(ck.text, row.id);
  }
  console.log(`  [chunks] ${seedChunks.length} corpus chunks`);

  // 3. Corpus vocabulary + lexical relations ────────────────────────────────
  const vocabIdByWord = new Map<string, number>();
  for (const w of corpusWords) {
    const [row] = await db
      .insert(vocabularies)
      .values({
        userId: null,
        headword: w.headword,
        pos: w.pos,
        cefr: w.cefr,
        meaningEn: w.meaningEn,
        meaningZh: w.meaningZh,
        exampleEn: w.exampleEn,
        collocations: w.collocations,
        status: "passive",
      })
      .returning({ id: vocabularies.id });
    vocabIdByWord.set(w.headword, row.id);
  }

  let relCount = 0;
  for (const r of wordRelations) {
    const fromId = vocabIdByWord.get(r.from);
    const toId = vocabIdByWord.get(r.to);
    if (fromId && toId) {
      await db.insert(lexicalRelations).values({
        fromType: "vocab",
        fromId,
        toType: "vocab",
        toId,
        relation: r.relation,
        note: r.note,
      });
      relCount++;
    }
  }
  for (const r of chunkRelations) {
    const fromId = chunkIdByText.get(r.from);
    const toId = chunkIdByText.get(r.to);
    if (fromId && toId) {
      await db.insert(lexicalRelations).values({
        fromType: "chunk",
        fromId,
        toType: "chunk",
        toId,
        relation: r.relation,
        note: r.note,
      });
      relCount++;
    }
  }
  console.log(`  [network] ${corpusWords.length} corpus words, ${relCount} relations`);

  // 3. Exam-profile users — what the app's /welcome first-run creates for the
  // ACTIVE exam; suites and CI switch exams, so all three profiles must
  // resolve a learning memory. Idempotent per profile. ─────────────────────
  for (const exam of ["ielts", "cet4", "cet6"] as const) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.examProfile, exam)).limit(1);
    if (existing.length) continue;
    const [u] = await db.insert(users).values({ name: "Learner", examProfile: exam }).returning();
    await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });
  }
  console.log("  [users] one learner per exam profile (ielts/cet4/cet6)");

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
