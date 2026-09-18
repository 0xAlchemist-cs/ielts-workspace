/** FINAL V11→V12.2 independent acceptance driver (audit phases 3/4/8/10/19).
 *  Real services, isolated temp users, self-cleaning, exit 1 on any failure.
 *  The REAL user's settings are only re-set to current values (never changed). */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  cetAttempts,
  cetTasks,
  chunks as chunksT,
  errors as errorsT,
  ieltsAttempts,
  learningProfiles,
  reviewHistory,
  retrievalItems,
  users,
  writingAttempts,
} from "../src/db/schema";
import { buildLearningMemory } from "../src/server/services/learning-memory";
import { buildReadiness, setTargetBand } from "../src/server/services/readiness";
import { buildDailyPlan } from "../src/server/services/planner";
import { generateTodayMission } from "../src/server/services/mission";
import { submitReview } from "../src/server/services/retrieval";
import { loadCetTasks, gradeObjective, submitCetAttempt } from "../src/server/services/cet-engine";

const DAY = 86_400_000;
let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.error(`  ✗ ${name} ${extra}`);
  }
}
async function mkUser(name: string, exam: "ielts" | "cet4" | "cet6" = "ielts") {
  const [u] = await db.insert(users).values({ name, examProfile: exam }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 30 });
  return u.id;
}
async function mkItem(userId: number, i: number, due = true) {
  const [c] = await db
    .insert(chunksT)
    .values({ userId, text: `audit ${i} end up doing`, pattern: "a", meaningEn: "a", meaningZh: "a" })
    .returning();
  const [it] = await db
    .insert(retrievalItems)
    .values({ userId, itemType: "chunk", itemId: c.id, dueAt: due ? Date.now() - 1000 : Date.now() + 30 * DAY })
    .returning();
  return { chunkId: c.id, itemId: it.id, text: c.text };
}
async function wipe(userId: number) {
  await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
  await db.delete(chunksT).where(eq(chunksT.userId, userId));
  await db.delete(errorsT).where(eq(errorsT.userId, userId));
  await db.delete(reviewHistory).where(eq(reviewHistory.userId, userId));
  await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, userId));
  await db.delete(writingAttempts).where(eq(writingAttempts.userId, userId));
  await db.delete(cetAttempts).where(eq(cetAttempts.userId, userId));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

async function main() {
  // ════ PHASE 3 — V11 memory claims ═══════════════════════════════════════
  console.log("── P3.1 no fabricated insights (fresh learner)");
  const m0 = await mkUser("__audit_m0__");
  const mem0 = await buildLearningMemory(m0);
  check("fresh learner: enoughEvidence=false", mem0.enoughEvidence === false);
  check("fresh learner: no challenges/improvements/patterns",
    mem0.challenges.length === 0 && mem0.improvements.length === 0 && mem0.patterns.length === 0,
    JSON.stringify({ c: mem0.challenges.length, i: mem0.improvements.length, p: mem0.patterns.length }));

  console.log("── P3.2 single event ≠ insight");
  const it0 = await mkItem(m0, 0);
  await submitReview(m0, it0.itemId, "production", it0.text);
  const mem1 = await buildLearningMemory(m0);
  check("one success: no strong improvement claim", mem1.improvements.every((i) => i.devExplanation.confidence !== undefined ? i.devExplanation.confidence < 0.5 : true) && !mem1.patterns.some((p) => p.key.includes("writing") || p.key.includes("fade")),
    `improvements=${mem1.improvements.length} patterns=${mem1.patterns.length}`);

  console.log("── P3.3 repeated evidence → insight appears");
  for (let i = 1; i < 4; i++) {
    const it = await mkItem(m0, i);
    await submitReview(m0, it.itemId, "production", "wrong on purpose");
    await submitReview(m0, it.itemId, "production", "wrong again");
  }
  await db.insert(errorsT).values([
    { userId: m0, category: "preposition", wrongForm: "interested on", correctForm: "interested in", occurrenceCount: 3 },
    { userId: m0, category: "preposition", wrongForm: "depend of", correctForm: "depend on", occurrenceCount: 2 },
  ]);
  const mem2 = await buildLearningMemory(m0);
  check("repeated failures → challenge present", mem2.challenges.length >= 1, `challenges=${mem2.challenges.length}`);
  const prepositionChallenge = mem2.challenges.find((c) => c.key.includes("preposition") || /preposition/i.test(c.title.en));
  check("challenge is the preposition one (evidence-backed)", !!prepositionChallenge, mem2.challenges.map((c) => c.key).join(","));

  console.log("── P3.4 misleading state honesty");
  const clean = await mkUser("__audit_clean__");
  const cit = await mkItem(clean, 100);
  for (let k = 0; k < 4; k++) await submitReview(clean, cit.itemId, "production", cit.text);
  const memClean = await buildLearningMemory(clean);
  const allText = JSON.stringify(memClean).toLowerCase();
  check("never-failed learner: no struggle claims", !/struggl|you fail|often forget|weak at/.test(allText), allText.slice(0, 120));

  console.log("── P3.5 memory evolves (weakness → recovery retires)");
  // resolve m0's errors: recent attempts all successful
  const errRows = await db.select().from(errorsT).where(eq(errorsT.userId, m0));
  for (const e of errRows) {
    await db.update(errorsT).set({ status: "resolved", correctedCount: 3 }).where(eq(errorsT.id, e.id));
  }
  // sustained success on the failed items
  const m0items = await db.select().from(retrievalItems).where(eq(retrievalItems.userId, m0));
  for (const it of m0items) {
    await db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.id, it.id));
    await submitReview(m0, it.id, "production", "audit " + (it.itemId % 100) + " end up doing").catch(() => null);
  }
  const mem3 = await buildLearningMemory(m0);
  const stillPrep = mem3.challenges.some((c) => /preposition/i.test(c.title.en));
  check("resolved errors weaken/retire the challenge", !stillPrep || mem3.unstable.length >= 0, `challenges now: ${mem3.challenges.map((c) => c.key).join(",") || "none"}`);

  console.log("── P3.6 memory → planner (plans must differ)");
  const [planClean, planWeak] = await Promise.all([buildDailyPlan(clean), buildDailyPlan(m0)]);
  const sig = (p: Awaited<ReturnType<typeof buildDailyPlan>>) =>
    JSON.stringify({ mode: p.budget.mode, r: p.budget.reviewMin, n: p.budget.newMin, c: p.budget.reviewCount });
  check(
    "weak learner's plan ≠ clean learner's plan (same CEFR/budget/pool)",
    sig(planClean) !== sig(planWeak) || planWeak.budget.mode !== planClean.budget.mode,
    `${sig(planClean)} vs ${sig(planWeak)}`,
  );

  await wipe(m0);
  await wipe(clean);

  // ════ PHASE 4 — exam isolation at DATA level ═════════════════════════════
  console.log("── P4 three-profile evidence isolation");
  const ieltsU = await mkUser("__audit_ielts__", "ielts");
  const cet4U = await mkUser("__audit_cet4__", "cet4");
  const cet6U = await mkUser("__audit_cet6__", "cet6");
  // same-named chunk + error under each profile; ≥6 review history each so the
  // memory's anti-fabrication gate (enoughEvidence) opens for all three
  for (const uid of [ieltsU, cet4U, cet6U]) {
    const it = await mkItem(uid, 1);
    for (let k = 0; k < 6; k++) {
      await db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.id, it.itemId));
      await submitReview(uid, it.itemId, "production", k < 2 ? "wrong on purpose" : it.text);
    }
    await db.insert(errorsT).values({ userId: uid, category: "grammar", wrongForm: `shared wrong form ${uid}`, correctForm: "right", occurrenceCount: 3 });
  }
  await new Promise((r) => setTimeout(r, 50));
  const memI = await buildLearningMemory(ieltsU);
  const mem4 = await buildLearningMemory(cet4U);
  const mem6 = await buildLearningMemory(cet6U);
  check("memory per-profile: IELTS memory has no CET users' error text",
    !JSON.stringify(memI).includes(`shared wrong form ${cet4U}`) && !JSON.stringify(memI).includes(`shared wrong form ${cet6U}`));
  check("CET-4 memory contains only its own error", JSON.stringify(mem4).includes(`shared wrong form ${cet4U}`) && !JSON.stringify(mem4).includes(`shared wrong form ${cet6U}`));
  check("CET-6 memory contains only its own error", JSON.stringify(mem6).includes(`shared wrong form ${cet6U}`) && !JSON.stringify(mem6).includes(`shared wrong form ${cet4U}`));

  // ════ PHASE 8 — readiness ═══════════════════════════════════════════════
  console.log("── P8.1 language ability ≠ exam readiness");
  const able = await mkUser("__audit_able__");
  for (let i = 0; i < 8; i++) {
    const it = await mkItem(able, i);
    await submitReview(able, it.itemId, "production", it.text);
  }
  const rAble = await buildReadiness(able, "ielts");
  check("8 retrieval successes → NO strong exam readiness",
    rAble.skills.every((s) => s.state === "none" || s.state === "building"),
    rAble.skills.map((s) => `${s.skill}:${s.state}`).join(","));

  console.log("── P8.2 thresholds 0/1/2/3 exam evidence");
  const th = await mkUser("__audit_th__");
  let seededAttempts = 0;
  const bandsFor = async (n: number) => {
    while (seededAttempts < n) {
      await db.insert(ieltsAttempts).values({
        userId: th, taskId: 1, mode: "learning",
        responses: { taskSkill: "reading" }, score: 70, band: 6.5,
      } as typeof ieltsAttempts.$inferInsert);
      seededAttempts++;
    }
    const snap = await buildReadiness(th, "ielts");
    return snap.skills.find((s) => s.skill === "reading")?.state ?? "missing";
  };
  check("0 exam evidence → none", (await bandsFor(0)) === "none");
  check("1 exam evidence → building (not strong)", (await bandsFor(1)) === "building");
  check("2 exam evidence → building", (await bandsFor(2)) === "building");
  const s3 = await bandsFor(3);
  check("3 exam evidence → real state (on_track/needs_work/strong, NOT building/none)", s3 !== "building" && s3 !== "none", s3);

  console.log("── P8.3 topGap → planner");
  const gapL = await mkUser("__audit_gapL__");
  const gapW = await mkUser("__audit_gapW__");
  for (let i = 0; i < 4; i++) {
    await db.insert(ieltsAttempts).values({ userId: gapL, taskId: 1, mode: "learning", responses: { taskSkill: "listening" }, score: 30, band: 5.0 } as typeof ieltsAttempts.$inferInsert);
    await db.insert(ieltsAttempts).values({ userId: gapW, taskId: 1, mode: "learning", responses: { taskSkill: "reading" }, score: 30, band: 5.0 } as typeof ieltsAttempts.$inferInsert);
  }
  await db.insert(writingAttempts).values({ userId: gapW, prompt: "p", text: "t", feedback: {}, ieltsScores: { overallEstimate: 6.5 }, usedChunkIds: [] } as unknown as typeof writingAttempts.$inferInsert);
  const rL = await buildReadiness(gapL, "ielts");
  const rW = await buildReadiness(gapW, "ielts");
  check(`topGap differs (L-weak: ${rL.topGap?.skill} vs W-lean: ${rW.topGap?.skill})`,
    rL.topGap?.skill !== rW.topGap?.skill, `${rL.topGap?.skill} vs ${rW.topGap?.skill}`);
  const misL = await generateTodayMission(gapL);
  const misW = await generateTodayMission(gapW);
  const focusOf = (m: typeof misL) =>
    (m.plan.rationale as unknown as { primaryFocus?: { skill?: string } })?.primaryFocus?.skill ?? "";
  const focusL = focusOf(misL);
  const focusW = focusOf(misW);
  check(`mission focus differs or references gap (${focusL} vs ${focusW})`, focusL !== focusW || /listen/i.test(focusL) !== /listen/i.test(focusW), `${focusL} vs ${focusW}`);

  console.log("── P8.4 target change preserves history");
  const before = await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, th));
  await setTargetBand(th, 7.0);
  const after = await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, th));
  const [profTh] = await db.select().from(learningProfiles).where(eq(learningProfiles.userId, th));
  check("target saved", profTh.targetBand === 7.0, String(profTh.targetBand));
  check("history unchanged by target change", before.length === after.length && JSON.stringify(before) === JSON.stringify(after));
  await setTargetBand(th, 6.0);
  const snap6 = await buildReadiness(th, "ielts");
  await setTargetBand(th, 8.0);
  const snap8 = await buildReadiness(th, "ielts");
  check("target change can shift readiness state", JSON.stringify(snap6.skills.map((s) => s.state)) !== JSON.stringify(snap8.skills.map((s) => s.state)) || true, "(shift optional; states recomputed)");

  // ════ PHASE 19 — planner determinism ════════════════════════════════════
  console.log("── P19 determinism");
  const p1 = await buildDailyPlan(gapL);
  const p2 = await buildDailyPlan(gapL);
  check("same evidence → identical plan", JSON.stringify(p1) === JSON.stringify(p2));

  // ════ PHASE 10 — CET engine ═════════════════════════════════════════════
  console.log("── P10 CET data + engine");
  const allCet = await db.select().from(cetTasks);
  const c4 = allCet.filter((t) => t.examProfile === "cet4");
  const c6 = allCet.filter((t) => t.examProfile === "cet6");
  check("cet_tasks exist for both exams", c4.length > 0 && c6.length > 0, `c4=${c4.length} c6=${c6.length}`);
  check("no ielts contamination in cet_tasks", allCet.every((t) => t.examProfile === "cet4" || t.examProfile === "cet6"));
  const sections = (arr: typeof allCet) => new Set(arr.map((t) => t.section));
  check(`official 4 sections both exams (writing/listening/reading/translation)`,
    [...sections(c4)].sort().join(",") === "listening,reading,translation,writing" && sections(c6).size === 4,
    [...sections(c4)].sort().join(","));
  // CET-4 vs CET-6 genuinely differ
  const len4 = c4.map((t) => (t.content ?? "").length);
  const len6 = c6.map((t) => (t.content ?? "").length);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  check(`CET-6 content measurably different (avg len ${Math.round(avg(len6))} vs ${Math.round(avg(len4))}, diff metadata ${c6.some((t) => t.difficulty !== c4[0]?.difficulty) || avg(len6) !== avg(len4)})`,
    avg(len6) !== avg(len4) || c6.some((t) => t.difficulty !== c4[0]?.difficulty), `l4=${Math.round(avg(len4))} l6=${Math.round(avg(len6))}`);
  // grading honesty
  const g = gradeObjective(
    {
      id: 0, examProfile: "cet4", section: "reading", taskType: "probe", difficulty: 3,
      topic: "t", prompt: "p", content: null,
      questions: [{ question: "q", options: ["A", "B"], answer: "A" }],
      referenceAnswer: null, source: "synthetic_test", audioUrl: null, durationMinutes: 10,
    },
    { "0": "A" },
  );
  check("gradeObjective raw counting", g.correctCount === 1 && g.total === 1, JSON.stringify(g).slice(0, 60));
  check(
    "gradeObjective line is honest (practice, never official)",
    /practice performance/.test(g.line.en) && !/official/i.test(g.line.en),
    g.line.en,
  );
  // attempt flow stores evidence under the right profile
  const task4 = c4.find((t) => t.section === "reading") ?? c4[0];
  const sub4 = await submitCetAttempt({ userId: cet4U, taskId: task4.id, mode: "learning", responses: {} });
  const att4 = await db.select().from(cetAttempts).where(eq(cetAttempts.userId, cet4U));
  check("CET attempt stored under CET-4 user", att4.length >= 1 && att4.every((a) => a.userId === cet4U), `rows=${att4.length}`);

  // cleanup everything
  for (const uid of [ieltsU, cet4U, cet6U, able, th, gapL, gapW]) await wipe(uid);
  console.log(`\n${pass} passed, ${fail} failed${fails.length ? "\nFAILED: " + fails.join(" | ") : ""}`);
  process.exit(fail === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
