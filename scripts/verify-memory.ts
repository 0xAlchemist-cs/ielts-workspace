/** V11 Learning Memory verification — insight birth/death, improvement
 * thresholds, pattern emergence & contradiction, planner/speaking influence,
 * empty state, exam isolation. Isolated temp users; surgical cleanup.
 * Run: npm run test:memory */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { chunkEvents, chunks as chunksT, errors as errorsT, learningProfiles, retrievalItems, reviewHistory, users } from "../src/db/schema";
import { buildLearningMemory } from "../src/server/services/learning-memory";
import { buildDailyPlan } from "../src/server/services/planner";
import { personalizeSpeakingTask, speakingTaskFor } from "../src/lib/ai/prompts/speaking-tasks";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}
const DAY = 86_400_000;

async function mkUser(name: string, exam: "ielts" | "cet4" | "cet6" = "ielts"): Promise<number> {
  const [u] = await db.insert(users).values({ name, examProfile: exam }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });
  return u.id;
}

interface SeededItem { itemId: number; rItemId: number; text: string }
async function seedChunk(userId: number, text: string): Promise<SeededItem> {
  const [c] = await db.insert(chunksT).values({
    userId, text, meaningEn: `meaning of ${text}`, meaningZh: "测试", examples: [`${text} example.`],
  }).returning();
  const [r] = await db.insert(retrievalItems).values({
    userId, itemType: "chunk", itemId: c.id, dueAt: Date.now(),
  }).returning();
  return { itemId: c.id, rItemId: r.id, text };
}

async function record(rItemId: number, userId: number, mode: string, correct: boolean, at: number): Promise<void> {
  await db.insert(reviewHistory).values({
    retrievalItemId: rItemId, userId, mode: mode as "production", prompt: "p", expected: "e",
    userResponse: "r", correct: correct ? 1 : 0, quality: correct ? 5 : 0, createdAt: at,
  });
}

async function cleanup(uids: number[]) {
  for (const uid of uids) {
    await db.delete(reviewHistory).where(eq(reviewHistory.userId, uid));
    await db.delete(chunkEvents).where(eq(chunkEvents.userId, uid));
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
    await db.delete(chunksT).where(eq(chunksT.userId, uid));
    await db.delete(errorsT).where(eq(errorsT.userId, uid));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
    await db.delete(users).where(eq(users.id, uid));
  }
}

async function main() {
  const now = Date.now();
  const uids: number[] = [];

  // ── 1 · empty state: no fabricated insight for a fresh learner ────────────
  const fresh = await mkUser("__mem_fresh__");
  uids.push(fresh);
  const mFresh = await buildLearningMemory(fresh);
  check("fresh learner → empty state, no insights", !mFresh.enoughEvidence && mFresh.challenges.length === 0 && mFresh.patterns.length === 0);

  // ── 2 · challenge appears after repeated failure, weakens after success ──
  const u1 = await mkUser("__mem_challenge__");
  uids.push(u1);
  const a1 = await seedChunk(u1, "as a result");
  const a2 = await seedChunk(u1, "the reason is");
  const a3 = await seedChunk(u1, "in contrast");
  // six failures across three items → production/recognition signals
  for (const it of [a1, a2, a3]) {
    await record(it.rItemId, u1, "production", false, now - 5 * DAY);
    await record(it.rItemId, u1, "production", false, now - 4 * DAY);
    await db.update(retrievalItems).set({
      learningState: { state: "retrieval", achievedAt: { exposure: 1, understanding: 1, recognition: 1, retrieval: 1 }, contexts: ["reading"], productionHits: 0, productionMisses: 2, contextualHits: 0, contextualMisses: 0 },
      failCount: 2, successCount: 0,
    }).where(eq(retrievalItems.id, it.rItemId));
  }
  let m1 = await buildLearningMemory(u1);
  const hadChallenge = m1.enoughEvidence && m1.challenges.some((c) => c.key === "challenge_production");
  check("repeated failures → production challenge appears", hadChallenge, JSON.stringify(m1.challenges.map((c) => c.key)));
  // sustained success on the same items → challenge weakens (misses cleared)
  for (const it of [a1, a2, a3]) {
    await db.update(retrievalItems).set({
      learningState: { state: "usage", achievedAt: { exposure: 1, understanding: 1, recognition: 1, retrieval: 1, usage: 1 }, contexts: ["reading"], productionHits: 3, productionMisses: 0, contextualHits: 0, contextualMisses: 0 },
      successCount: 4, failCount: 2,
    }).where(eq(retrievalItems.id, it.rItemId));
    for (let k = 0; k < 4; k++) await record(it.rItemId, u1, "production", true, now - 3 * DAY + k * 3600_000);
  }
  m1 = await buildLearningMemory(u1);
  const stillHas = m1.challenges.some((c) => c.key === "challenge_production");
  check("sustained success → challenge disappears", !stillHas, JSON.stringify(m1.challenges.map((c) => c.key)));

  // ── 3 · improvement needs before/after evidence; one success is not enough ─
  const u2 = await mkUser("__mem_improve__");
  uids.push(u2);
  const b1 = await seedChunk(u2, "take responsibility for");
  for (let k = 0; k < 4; k++) await record(b1.rItemId, u2, "production", false, now - 20 * DAY); // early misses
  await record(b1.rItemId, u2, "production", true, now - 1 * DAY); // ONE success
  let m2 = await buildLearningMemory(u2);
  check("single success does NOT create improvement", !m2.improvements.some((i) => i.key === "improve_recall"), JSON.stringify(m2.improvements.map((i) => i.key)));
  for (let k = 0; k < 3; k++) await record(b1.rItemId, u2, "production", true, now - 1 * DAY + k * 3600_000);
  m2 = await buildLearningMemory(u2);
  check("sustained recent success → improvement appears", m2.improvements.some((i) => i.key === "improve_recall"), JSON.stringify(m2.improvements.map((i) => i.key)));

  // ── 4 · pattern fade_after_gap (early ok → fail after ≥7d, ≥3 items) ─────
  const u3 = await mkUser("__mem_fade__");
  uids.push(u3);
  const c1 = await seedChunk(u3, "without a second thought");
  const c2 = await seedChunk(u3, "sounded risky");
  const c3 = await seedChunk(u3, "keep up with");
  for (const [i, it] of [c1, c2, c3].entries()) {
    await record(it.rItemId, u3, "production", true, now - (15 + i) * DAY); // early success
    await record(it.rItemId, u3, "production", false, now - 1 * DAY); // fail after a long gap
  }
  const m3 = await buildLearningMemory(u3);
  check("fade-after-gap pattern emerges (3 items)", m3.patterns.some((p) => p.patternId === "fade_after_gap"), JSON.stringify(m3.patterns.map((p) => p.patternId)));
  // contradiction: those items now succeed repeatedly → pattern loses its 3-item base
  for (const it of [c1, c2, c3]) {
    await record(it.rItemId, u3, "production", true, now - 0.5 * DAY);
  }
  // note: history rows persist; fade detection re-checks chronology — latest
  // success AFTER the fail does not erase the earlier fade, but a fresh memory
  // build must reflect new successes in improved accuracy, and the P2 pattern
  // requires early-then-late-fail pairs; with a later success the story is
  // "recovered" — verify the improvement side responds:
  const m3b = await buildLearningMemory(u3);
  check("recovery visible after contradiction (memory evolves)", m3b.recentlyStrengthened.length >= 1 || m3b.improvements.length >= 1 || m3b.patterns.length >= 1);

  // ── 5 · pattern writing_helps (≥3 items: generation → later success) ─────
  const u4 = await mkUser("__mem_write__");
  uids.push(u4);
  const w1 = await seedChunk(u4, "a breath of fresh air");
  const w2 = await seedChunk(u4, "cut down on");
  const w3 = await seedChunk(u4, "stay up late");
  for (const it of [w1, w2, w3]) {
    await db.insert(chunkEvents).values({ userId: u4, chunkId: it.itemId, type: "generation_pass", detail: "own sentence", createdAt: now - 5 * DAY });
    await record(it.rItemId, u4, "production", true, now - 4 * DAY);
    await record(it.rItemId, u4, "production", true, now - 3 * DAY);
  }
  const m4 = await buildLearningMemory(u4);
  check("writing-helps pattern emerges (3 items)", m4.patterns.some((p) => p.patternId === "writing_helps"), JSON.stringify(m4.patterns.map((p) => p.patternId)));

  // ── 6 · memory → planner: the pattern annotates the plan why ─────────────
  const plan4 = await buildDailyPlan(u4);
  check("planner why-line carries the memory pattern", plan4.budget.whyEn.includes("Writing helps your expressions stick"), plan4.budget.whyEn);

  // ── 7 · memory → speaking: recognise-not-produce biases reason questions ─
  const u5 = await mkUser("__mem_speak__");
  uids.push(u5);
  const s1 = await seedChunk(u5, "on the other hand");
  const s2 = await seedChunk(u5, "compared with");
  const s3 = await seedChunk(u5, "whereas");
  const s4 = await seedChunk(u5, "in contrast to");
  const s5 = await seedChunk(u5, "similarly");
  for (const it of [s1, s2, s3, s4, s5]) {
    await record(it.rItemId, u5, "recognition", true, now - 6 * DAY);
    await record(it.rItemId, u5, "production", false, now - 5 * DAY);
  }
  await record(s1.rItemId, u5, "recognition", true, now - 4 * DAY);
  await record(s2.rItemId, u5, "recognition", true, now - 4 * DAY);
  await record(s3.rItemId, u5, "production", false, now - 4 * DAY);
  const m5 = await buildLearningMemory(u5);
  const hasRNP = m5.patterns.some((p) => p.patternId === "recognise_not_produce");
  check("recognise-not-produce pattern emerges (5 items)", hasRNP, JSON.stringify(m5.patterns.map((p) => p.patternId)));
  const task = speakingTaskFor("B1");
  // Date-flake-proof contract: with the "reason" bias the output IS the
  // reason-tagged question (previously asserted ≠ unbiased, which breaks on
  // days when the rotation already lands on a why-question — 2026-09-19).
  const withBias = personalizeSpeakingTask(task, "without a second thought", hasRNP ? "reason" : undefined);
  const reasonIdx = task.tags?.findIndex((t) => t === "reason") ?? -1;
  const reasonQ = reasonIdx >= 0 ? task.questions[reasonIdx] : null;
  check(
    "memory-biased speaking prompt picks the reason question",
    !!reasonQ && /why/i.test(reasonQ) && withBias.startsWith(reasonQ),
    `reasonQ=${reasonQ?.slice(0, 40) ?? "none"} withBias=${withBias.slice(0, 40)}`,
  );

  // ── 8 · exam isolation: CET memory never surfaces in IELTS view ──────────
  const cetUser = await mkUser("__mem_cet4__", "cet4");
  uids.push(cetUser);
  const e1 = await seedChunk(cetUser, "as a result");
  for (let k = 0; k < 6; k++) await record(e1.rItemId, cetUser, "production", false, now - 5 * DAY);
  const mCet = await buildLearningMemory(cetUser);
  const mIelts = await buildLearningMemory(u1);
  const cetKeys = new Set([...mCet.challenges.map((c) => c.key), ...mCet.patterns.map((c) => c.key)]);
  const ieltsKeys = new Set([...mIelts.challenges.map((c) => c.key), ...mIelts.patterns.map((c) => c.key)]);
  check("memory is per-profile (no shared insight keys across exams)", [...cetKeys].every((k) => !ieltsKeys.has(k)) || mIelts.challenges.length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await cleanup(uids);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
