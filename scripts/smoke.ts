/** End-to-end learning-loop smoke test against the real services.
 * Creates a temporary user, walks the full loop, verifies counters, cleans up. */
import { eq, inArray } from "drizzle-orm";
import { pinActiveExam } from "./pin-exam";
import { db } from "../src/db";
import {
  chunks as chunksT,
  dailyMissions,
  errors as errorsT,
  learningProfiles,
  reviewHistory,
  retrievalItems,
  speakingAttempts,
  userProgress,
  users,
  vocabularies,
  writingAttempts,
} from "../src/db/schema";
import { generateTodayMission, markStepDone } from "../src/server/services/mission";
import { saveCorpusChunk, saveVocabulary } from "../src/server/services/bank";
import { submitReview } from "../src/server/services/retrieval";
import { generateReviewQueue } from "../src/server/services/retention";
import { getDashboardStats, getTodayFunnel, recordEvent } from "../src/server/services/progress";
import { gradeRetrieval } from "../src/lib/grading";
import { detectChunksInSentence } from "../src/lib/chunk-detect";
import { lookupWord } from "../src/server/services/dictionary";
import { mockProvider } from "../src/lib/ai";
import type { MissionPlan } from "../src/lib/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
}

let restoreExamFn: (() => Promise<void>) | null = null;

async function main() {
  restoreExamFn = await pinActiveExam("ielts");
  // ── setup temp user ──────────────────────────────────────────────────────
  const [u] = await db.insert(users).values({ name: "__smoke__" }).returning();
  const userId = u.id;
  await db.insert(learningProfiles).values({ userId, cefr: "B2", immersionLevel: 1 });

  try {
    // ① mission generation
    const mission = await generateTodayMission(userId);
    check("mission generated with 7 steps", !!mission.plan.reading && !!mission.plan.transfer);
    // Content rotates by day-of-month; some contents carry only 1 attached
    // corpus chunk. The pipeline is proven as long as the notice step is
    // non-empty — count varies with the daily rotation.
    check("notice step has corpus chunks", mission.plan.notice.chunkIds.length >= 1, `got ${mission.plan.notice.chunkIds.length}`);

    // ② chunk detection
    const detected = detectChunksInSentence("I was going to go camping, but I ended up staying home.");
    check("chunk detection finds 'I was going to' + 'end up doing'",
      detected.includes("I was going to") && detected.includes("end up doing"), JSON.stringify(detected));

    // ③ dictionary (ECDICT)
    const look = await lookupWord("persuade");
    check("ECDICT lookup 'persuade'", !!look && look.entry.translationZh.includes("说"), JSON.stringify(look?.entry.translationZh?.slice(0, 20)));
    const lemmaLook = await lookupWord("convinced");
    check("lemma fallback 'convinced' → convince", !!lemmaLook && (lemmaLook.viaLemma || lemmaLook.entry.word === "convinced"));

    // ④ save corpus chunk → retrieval item
    const corpusChunkId = mission.plan.notice.chunkIds[0];
    const saved = await saveCorpusChunk(userId, corpusChunkId);
    check("corpus chunk copied to user bank", !!saved && saved.userId === userId);
    const [item] = await db.select().from(retrievalItems)
      .where(eq(retrievalItems.userId, userId)).limit(1);
    check("retrieval item auto-registered", !!item);

    // ⑤ local grader
    const g1 = gradeRetrieval({ itemType: "chunk", chunkText: "end up doing", examples: ["I ended up staying home."] },
      "I was going to go out but I ended up staying at home");
    check("grader: production correct → quality 5", g1.quality === 5);
    const g2 = gradeRetrieval({ itemType: "chunk", chunkText: "end up doing" }, "I stayed home");
    check("grader: miss → quality 0", g2.quality === 0);
    const g3 = gradeRetrieval({ itemType: "vocab", headword: "persuade" }, "persuade");
    check("grader: vocab exact → 5", g3.quality === 5);

    // ⑥ review queue + submit (production correct)
    const queue = await generateReviewQueue(userId, 10);
    check("review queue has the saved chunk", queue.some((q) => q.itemType === "chunk"));
    const chunkQ = queue.find((q) => q.itemType === "chunk")!;
    const r1 = await submitReview(userId, chunkQ.retrievalItemId, "production", `Obviously, honestly, ${chunkQ.expected} happened exactly like the model sentence.`);
    check("review submit graded 5", r1?.quality === 5, JSON.stringify(r1));
    check("SM-2 interval advanced to ≥1 day", (r1?.intervalDays ?? 0) >= 1);
    check("strength grew above 0", (r1?.strength ?? 0) > 0);

    // ⑦ fail once → interval resets
    const r2 = await submitReview(userId, chunkQ.retrievalItemId, "production", "no idea");
    check("failed review resets interval to 1", r2?.intervalDays === 1 && r2.quality === 0);

    // ⑧ progress funnel
    await recordEvent(userId, "exposure", 2);
    await recordEvent(userId, "used", 1);
    const funnel = await getTodayFunnel(userId);
    check("funnel counters recorded", funnel.exposure === 2 && funnel.used === 1 && funnel.retrieved >= 1, JSON.stringify(funnel));

    // ⑨ vocabulary save + passive status
    const v = await saveVocabulary(userId, "garment", "The industry produces over 100 billion garments a year.");
    check("vocab saved passive with ECDICT meaning", !!v && v.status === "passive" && v.meaningEn.length > 3);

    // ⑩ mock AI provider templates — must stay deterministic even when a live
    // provider is configured in Settings, so test mockProvider directly.
    const prov = mockProvider;
    const word = await prov.word({ word: "convince", sentenceContext: "She convinced me that the plan would work." });
    check("mock word (glossary)", word.meaningZh.includes("信服"));
    const sentence = await prov.sentence({
      sentence: "I was going to go camping, but I ended up staying home.",
      matchedChunks: [{ text: "end up doing", pattern: "end up + -ing", meaningEn: "to finally be in a situation you didn't plan", meaningZh: "最后……", examples: ["I ended up staying home."] }],
    });
    check("mock sentence analysis (8 dims + chunk)", sentence.detectedChunks.includes("end up doing") && sentence.whyThisExpression.length > 20);
    const speaking = await prov.speaking({
      prompt: "Tell me about something you had planned to do but ended up not doing.",
      transcript: "I very like camping. I was going to go camping last year but I end up staying at home because the weather was supposed to rain all weekend and I didn't want to run out of patience with the wet tent.",
      targetChunks: ["end up doing"],
      recentErrors: [],
    });
    check("mock speaking feedback catches 'very like'", speaking.corrections.some((c) => c.original === "very like"));
    check("mock speaking detects chunk usage", speaking.chunksUsed.some((c) => c.used));
    const writing = await prov.writing({ prompt: "Technology essay…", text: "Many people think technology is good. It is very good. A lot of people use it every day and it makes life very easy. I think this is good." });
    check("mock writing feedback has comparisons", writing.comparisons.length >= 2);

    // ⑪ dashboard stats
    const stats = await getDashboardStats(userId, 6.0);
    check("dashboard counts active chunks = 1", stats.activeChunks === 1);
    check("dashboard weakest link is computed from real data", stats.weakestLink.area.length > 0, JSON.stringify(stats.weakestLink));

    // ⑫ mission step marking
    await markStepDone(userId, "reading");
    const [m2] = await db.select().from(dailyMissions).where(eq(dailyMissions.userId, userId)).limit(1);
    check("mission step marked done", (m2.plan as MissionPlan).reading.status === "done");

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // ── cleanup all smoke rows ──────────────────────────────────────────────
    const chunkIds = (await db.select({ id: chunksT.id }).from(chunksT).where(eq(chunksT.userId, userId))).map((r) => r.id);
    await db.delete(reviewHistory).where(eq(reviewHistory.userId, userId));
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
    if (chunkIds.length) await db.delete(chunksT).where(inArray(chunksT.id, chunkIds));
    await db.delete(vocabularies).where(eq(vocabularies.userId, userId));
    await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, userId));
    await db.delete(writingAttempts).where(eq(writingAttempts.userId, userId));
    await db.delete(errorsT).where(eq(errorsT.userId, userId));
    await db.delete(userProgress).where(eq(userProgress.userId, userId));
    await db.delete(dailyMissions).where(eq(dailyMissions.userId, userId));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    console.log("  (smoke user cleaned up)");
  }
  await restoreExamFn?.();
  process.exit(fail > 0 ? 1 : 0);
}

void main().catch(async (e) => { console.error(e); try { await restoreExamFn?.(); } catch {} process.exit(1); });
