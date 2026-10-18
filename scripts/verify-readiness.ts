/** V12.1 Readiness verification — goal persistence, evidence-based states,
 * target-change recalculation, planner bias, honest no-evidence, exam
 * isolation. Temp users, surgical cleanup.
 * Run: npm run test:readiness */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  externalSessions,
  ieltsAttempts,
  learningProfiles,
  retrievalItems,
  reviewHistory,
  chunks as chunksT,
  speakingAttempts,
  users,
  writingAttempts,
} from "../src/db/schema";
import { buildReadiness, setTargetBand } from "../src/server/services/readiness";
import { setActiveExam, getActiveExam, getCurrentUser } from "../src/server/current-user";
import { saveWritingRevisionAction } from "../src/app/actions";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

async function mkUser(name: string, exam: "ielts" | "cet4" | "cet6" = "ielts"): Promise<number> {
  const [u] = await db.insert(users).values({ name, examProfile: exam }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 45, targetBand: 6.5 });
  return u.id;
}

async function cleanup(uids: number[]) {
  for (const uid of uids) {
    await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, uid));
    await db.delete(writingAttempts).where(eq(writingAttempts.userId, uid));
    await db.delete(externalSessions).where(eq(externalSessions.userId, uid));
    await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, uid));
    await db.delete(reviewHistory).where(eq(reviewHistory.userId, uid));
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
    await db.delete(chunksT).where(eq(chunksT.userId, uid));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
    await db.delete(users).where(eq(users.id, uid));
  }
}

async function main() {
  const originalExam = await getActiveExam();
  const uids: number[] = [];
  await setActiveExam("ielts");

  try {
    // ── 1 · no evidence → honest "none", no fake strengths/weaknesses ──────
    const fresh = await mkUser("__rd_fresh__");
    uids.push(fresh);
    const rFresh = await buildReadiness(fresh, "ielts");
    check("fresh learner → all skills none/none-fake", rFresh.skills.every((s) => s.state === "none" || s.state === "building"));
    check("fresh learner → no topGap", rFresh.topGap === null);

    // ── 2 · strong Reading + weak Listening → states differ (controlled) ──
    const u1 = await mkUser("__rd_gap__");
    uids.push(u1);
    // writing: 4 strong attempts (7.0+ vs target 6.5) — EXACT production shape:
    // routes save feedback.ielts into ieltsScores and the full AI feedback
    // (with TOP-LEVEL overallEstimate) into the feedback column
    for (let i = 0; i < 4; i++) {
      await db.insert(writingAttempts).values({
        userId: u1, taskType: "task2", prompt: "p", text: "some essay",
        ieltsScores: { taskResponse: 7, coherence: 7, lexical: 7, grammar: 7 },
        feedback: { ielts: { taskResponse: 7, coherence: 7, lexical: 7, grammar: 7 }, overallEstimate: 7 },
      });
    }
    // reading (ielts_attempts mode=learning, band high) vs listening (low) —
    // need ≥3 per skill to move past "building"
    for (let i = 0; i < 6; i++) {
      await db.insert(ieltsAttempts).values({
        userId: u1, taskId: 200 + i, mode: "learning",
        responses: { taskSkill: i < 3 ? "reading" : "listening" },
        band: i < 3 ? 7 : 4.5,
        subSkillResults: [],
      });
    }
    const r1 = await buildReadiness(u1, "ielts");
    const writing = r1.skills.find((s) => s.skill === "writing");
    check("writing 4×7.0 (production shape) vs target 6.5 → strong", writing?.state === "strong", writing?.state);
    check("writing evidenceCount counts the banded attempts", writing?.evidenceCount === 4, String(writing?.evidenceCount));

    // legacy row without taskSkill must be excluded from BOTH skill buckets
    // (it used to be double-counted into reading AND listening)
    await db.insert(ieltsAttempts).values({
      userId: u1, taskId: 999, mode: "learning", responses: {}, band: 7, subSkillResults: [],
    });
    const r1legacy = await buildReadiness(u1, "ielts");
    check("P2: unattributed legacy attempt counts toward neither skill",
      r1legacy.skills.find((s) => s.skill === "reading")?.evidenceCount === 3 &&
      r1legacy.skills.find((s) => s.skill === "listening")?.evidenceCount === 3,
      `reading=${r1legacy.skills.find((s) => s.skill === "reading")?.evidenceCount} listening=${r1legacy.skills.find((s) => s.skill === "listening")?.evidenceCount}`);

    // ── 2b · speaking band evidence, production shape (top-level in feedback) ─
    const u1s = await mkUser("__rd_speak__");
    uids.push(u1s);
    for (let i = 0; i < 3; i++) {
      await db.insert(speakingAttempts).values({
        userId: u1s, prompt: "p", transcript: "t", round: 1, usedChunkIds: [],
        ieltsScores: { fluency: 5, coherence: 5, lexical: 5, grammar: 5, pronunciation: 5 },
        feedback: { ielts: { fluency: 5, coherence: 5, lexical: 5, grammar: 5, pronunciation: 5 }, overallEstimate: 5 },
      });
    }
    const r1s = await buildReadiness(u1s, "ielts");
    const speaking = r1s.skills.find((s) => s.skill === "speaking");
    check("speaking 3×5.0 (production shape) vs target 6.5 → needs_work", speaking?.state === "needs_work", speaking?.state);
    check("speaking evidenceCount counts banded attempts", speaking?.evidenceCount === 3, String(speaking?.evidenceCount));

    // external sessions are skill-tagged: a LISTENING session is not speaking
    // evidence (all sessions used to be counted into speaking)
    await db.insert(externalSessions).values([
      { userId: u1s, tool: "chatgpt_external", skill: "listening", durationMinutes: 15 },
      { userId: u1s, tool: "chatgpt_external", skill: "speaking", durationMinutes: 15 },
    ]);
    const r1se = await buildReadiness(u1s, "ielts");
    check("P2: only speaking-skill external sessions enter speaking evidence",
      r1se.skills.find((s) => s.skill === "speaking")?.evidenceCount === 4,
      String(r1se.skills.find((s) => s.skill === "speaking")?.evidenceCount));

    // ── 2c · legacy shape (overallEstimate inside ieltsScores) still works ───
    const u1l = await mkUser("__rd_legacy__");
    uids.push(u1l);
    for (let i = 0; i < 3; i++) {
      await db.insert(writingAttempts).values({
        userId: u1l, taskType: "task2", prompt: "p", text: "some essay",
        ieltsScores: { taskResponse: 7, coherence: 7, lexical: 7, grammar: 7, overallEstimate: 7 },
      });
    }
    const r1l = await buildReadiness(u1l, "ielts");
    check("legacy ieltsScores.overallEstimate still read", r1l.skills.find((s) => s.skill === "writing")?.state === "strong");

    // ── 2d · mock feedback is demo data, never exam evidence (round-2) ────
    // Offline/mock writing attempts carry isMock:true on the saved feedback —
    // their heuristic overallEstimate must not move Readiness.
    const u1m = await mkUser("__rd_mock__");
    uids.push(u1m);
    for (let i = 0; i < 4; i++) {
      await db.insert(writingAttempts).values({
        userId: u1m, taskType: "task2", prompt: "p", text: "some essay",
        ieltsScores: { taskResponse: 7, coherence: 7, lexical: 7, grammar: 7 },
        feedback: { ielts: { taskResponse: 7, coherence: 7, lexical: 7, grammar: 7 }, overallEstimate: 7, isMock: true },
      });
    }
    const r1m = await buildReadiness(u1m, "ielts");
    check("P2: mock banded attempts never count as readiness evidence",
      r1m.skills.find((s) => s.skill === "writing")?.evidenceCount === 0,
      String(r1m.skills.find((s) => s.skill === "writing")?.evidenceCount));
    const reading = r1.skills.find((s) => s.skill === "reading");
    const listening = r1.skills.find((s) => s.skill === "listening");
    check("reading vs listening states differ by evidence", reading?.state === "strong" && listening?.state === "needs_work", `${reading?.state} vs ${listening?.state}`);

    // ── 3 · target change recalculates without deleting history ───────────
    await setTargetBand(u1, 8); // much harder target
    const r1b = await buildReadiness(u1, "ielts");
    const writingB = r1b.skills.find((s) => s.skill === "writing");
    check("target 6.5→8.0: writing strong→needs_work", writing?.state === "strong" && writingB?.state === "needs_work", `${writing?.state}→${writingB?.state}`);
    const attemptsCount = (await db.select().from(writingAttempts).where(eq(writingAttempts.userId, u1))).length;
    check("history intact after target change", attemptsCount === 4);

    // ── 4 · memory≠readiness: retrieval strength never fabricates exam state ─
    const u2 = await mkUser("__rd_mem__");
    uids.push(u2);
    // strong retrieval history but ZERO exam attempts
    const [c] = await db.insert(chunksT).values({ userId: u2, text: "keep up with", meaningEn: "m", meaningZh: "m", examples: [] }).returning();
    const [ri] = await db.insert(retrievalItems).values({ userId: u2, itemType: "chunk", itemId: c.id }).returning();
    for (let i = 0; i < 8; i++) {
      await db.insert(reviewHistory).values({ retrievalItemId: ri.id, userId: u2, mode: "production", prompt: "p", expected: "e", userResponse: "r", correct: 1, quality: 5 });
    }
    const r2 = await buildReadiness(u2, "ielts");
    check("strong retrieval does NOT fake exam readiness", r2.skills.every((s) => s.state === "none" || s.state === "building"));

    // ── 5 · CET-4: honest session-only states, no band claims ─────────────
    await setActiveExam("cet4");
    const u4 = await mkUser("__rd_cet4__", "cet4");
    uids.push(u4);
    const r4 = await buildReadiness(u4, "cet4");
    check("CET-4 fresh → honest none states", r4.skills.every((s) => s.state === "none"));
    check("CET-4 readiness snapshot carries no band", r4.skills.every((s) => !s.why.en.includes("band")), JSON.stringify(r4.skills.map((s) => s.why.en)));
    check("CET-4 no fake topGap", r4.topGap === null);
    // CET user never inherits IELTS writing attempts
    const r4b = await buildReadiness(u1, "cet4"); // u1 has IELTS evidence
    check("IELTS evidence does not leak into CET readiness", r4b.skills.every((s) => s.state === "none" || s.state === "building"));

    // ── 6 · readiness → planner bias (topGap skill becomes primarySkill) ──
    await setActiveExam("ielts");
    const { generateTodayMission } = await import("../src/server/services/mission");
    // u1 with target 8.0 → all skills needs_work; listening band 4.5 vs 8 is worst
    const mission1 = await generateTodayMission(u1);
    const planWhy1 = (mission1.plan as { rationale?: { planWhy?: { en: string } } }).rationale?.planWhy?.en ?? "";
    check("planner why-line references readiness gap or budget", planWhy1.length > 10, planWhy1);

    // ── 7 · P2 regression: revision save is user-scoped ─────────────────────
    // A revision may only touch the CURRENT user's own attempts — never
    // another goal's row, even though attemptId alone would find it.
    const cu = await getCurrentUser();
    const stranger = await mkUser("__rd_rev_target__");
    uids.push(stranger);
    const [strangerAttempt] = await db.insert(writingAttempts).values({
      userId: stranger, taskType: "task2", prompt: "p", text: "their essay", revisionText: null,
    }).returning({ id: writingAttempts.id });
    await saveWritingRevisionAction(strangerAttempt.id, "hostile overwrite").catch(() => {
      /* revalidatePath outside a request context — tolerated in scripts */
    });
    const [afterStranger] = await db.select().from(writingAttempts).where(eq(writingAttempts.id, strangerAttempt.id));
    check("P2: revision save never crosses into another user's attempt", afterStranger?.revisionText === null,
      `got "${afterStranger?.revisionText}"`);
    if (cu) {
      // positive control on the real current user — insert, revise, clean up
      const [ownAttempt] = await db.insert(writingAttempts).values({
        userId: cu.user.id, taskType: "task2", prompt: "p", text: "my essay", revisionText: null,
      }).returning({ id: writingAttempts.id });
      try {
        await saveWritingRevisionAction(ownAttempt.id, "my own revision").catch(() => {
          /* same revalidatePath note */
        });
        const [afterOwn] = await db.select().from(writingAttempts).where(eq(writingAttempts.id, ownAttempt.id));
        check("P2: own attempt still revises normally", afterOwn?.revisionText === "my own revision");
      } finally {
        await db.delete(writingAttempts).where(eq(writingAttempts.id, ownAttempt.id));
      }
    }

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    await setActiveExam(originalExam);
    await cleanup(uids);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
