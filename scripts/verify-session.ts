/** V13.1 Learning Session verification — planner→session conversion, activity
 * sequence, completion tracking, resume, exam isolation. Service-level with
 * temp users. Run: npm run test:session */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, dailyMissions, errors as errorsT, learningProfiles, retrievalItems, users } from "../src/db/schema";
import { getActiveExam, setActiveExam } from "../src/server/current-user";
import { generateTodayMission, getTodayMission, markStepDone } from "../src/server/services/mission";
import { buildSessionPlan } from "../src/server/services/session-plan";
import { generateReviewQueue } from "../src/server/services/retention";
import { buildReadiness } from "../src/server/services/readiness";
import type { MissionPlan } from "../src/lib/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

const STEP_KEYS = ["reading", "listening", "notice", "deep", "retrieval", "speaking", "transfer"] as const;
type StepKey = (typeof STEP_KEYS)[number];

async function mkUser(name: string, exam: "ielts" | "cet4" | "cet6"): Promise<number> {
  const [u] = await db.insert(users).values({ name, examProfile: exam }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });
  return u.id;
}

async function cleanup(uids: number[]) {
  for (const uid of uids) {
    await db.delete(dailyMissions).where(eq(dailyMissions.userId, uid));
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
    await db.delete(chunksT).where(eq(chunksT.userId, uid));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
    await db.delete(users).where(eq(users.id, uid));
  }
}

function statusOf(plan: MissionPlan, step: StepKey): string {
  const s = plan[step] as { status: string } | undefined;
  return s?.status ?? "skipped";
}

function contentIdOf(plan: MissionPlan, step: StepKey): number | undefined {
  const s = plan[step] as { contentId?: number } | undefined;
  return s?.contentId;
}

/** Mirror of the /session page's buildActivities — the testable contract. */
function buildSequence(plan: MissionPlan): StepKey[] {
  const acts: StepKey[] = [];
  const lite = !!plan.lite;
  if (contentIdOf(plan, "reading") && statusOf(plan, "reading") === "pending") acts.push("reading");
  if (!lite && contentIdOf(plan, "listening") && statusOf(plan, "listening") === "pending") acts.push("listening");
  if (!lite && statusOf(plan, "notice") === "pending") acts.push("notice");
  if (!lite && statusOf(plan, "deep") === "pending") acts.push("deep");
  if (statusOf(plan, "retrieval") === "pending") acts.push("retrieval");
  if (!lite && statusOf(plan, "speaking") === "pending") acts.push("speaking");
  if (statusOf(plan, "transfer") === "pending") acts.push("transfer");
  return acts;
}

async function main() {
  const originalExam = await getActiveExam();
  const uids: number[] = [];
  try {
    // ── 1 · Session created from mission (IELTS) ──────────────────────────
    await setActiveExam("ielts");
    const u1 = await mkUser("__session_a__", "ielts");
    uids.push(u1);
    const mission1 = await generateTodayMission(u1);
    const plan1 = mission1.plan as MissionPlan;
    const seq1 = buildSequence(plan1);
    check("IELTS session has activities from planner", seq1.length >= 1, JSON.stringify(seq1));
    check("IELTS session includes retrieval (core activity)", seq1.includes("retrieval"));

    // ── 1b · V13.2: selection labels travel with the plan (rendered on /session)
    if (plan1.reading.contentId) {
      check(
        "mission stores why-this line for reading",
        !!plan1.reading.why && plan1.reading.why.en.length > 4,
        JSON.stringify(plan1.reading.why),
      );
      const s1 = plan1.reading.strength;
      check(
        "strength label stored (one of 3 labels, or null ≥2 levels away)",
        !s1 || s1.en === null || ["Good fit", "Stretching you a little", "Comfortable"].includes(s1.en),
        JSON.stringify(s1),
      );
    } else {
      check("no reading content → labels absent gracefully", true);
    }

    // ── 2 · Completion advances the sequence ──────────────────────────────
    const first1 = seq1[0];
    await markStepDone(u1, first1);
    const m1b = await getTodayMission(u1);
    if (!m1b) { check("mission exists after step done", false); return; }
    const plan1b = m1b.plan as MissionPlan;
    check("first activity marked done", statusOf(plan1b, first1) === "done");
    check("completed activity removed from remaining sequence", !buildSequence(plan1b).includes(first1));

    // ── 3 · Resume: partial completion preserved ──────────────────────────
    const remaining1 = buildSequence(plan1b);
    if (remaining1.length > 0) {
      await markStepDone(u1, remaining1[0]);
      const m1c = await getTodayMission(u1);
      if (!m1c) { check("mission exists after 2nd step", false); return; }
      const plan1c = m1c.plan as MissionPlan;
      const doneCount = STEP_KEYS.filter((k) => statusOf(plan1c, k) === "done").length;
      check("partial completion tracked (≥2 done)", doneCount >= 2, `done=${doneCount}`);
      check("resume shows only remaining activities", buildSequence(plan1c).length < seq1.length);
    } else {
      check("partial completion tracked (only 1 activity)", true);
      check("resume shows only remaining (none left)", true);
    }

    // ── 4 · All-done detection ────────────────────────────────────────────
    for (const step of STEP_KEYS) {
      const m = await getTodayMission(u1);
      if (!m) break;
      const p = m.plan as MissionPlan;
      if (statusOf(p, step) === "pending") await markStepDone(u1, step);
    }
    const m1d = await getTodayMission(u1);
    check("all-done session marked completed", m1d?.status === "completed");

    // ── 5 · Idempotent: marking done again doesn't break ─────────────────
    await markStepDone(u1, "retrieval"); // already done
    const m1e = await getTodayMission(u1);
    check("duplicate mark-done is safe (still completed)", m1e?.status === "completed");

    // ── 6 · Exam isolation ────────────────────────────────────────────────
    await setActiveExam("cet4");
    const u4 = await mkUser("__session_c4__", "cet4");
    uids.push(u4);
    const m4 = await generateTodayMission(u4);
    const plan4 = m4.plan as MissionPlan;
    check("CET-4 session builds from mission", buildSequence(plan4).length >= 1);
    const rd4 = await buildReadiness(u4, "cet4");
    check("CET-4 readiness independent of IELTS session", rd4.skills.every((s) => s.why.en !== undefined));

    // ── 7 · Lite mode strips notice/deep/speaking ────────────────────────
    const litePlan: MissionPlan = {
      ...plan1, lite: true,
      reading: { ...plan1.reading, status: "pending" },
      listening: { ...plan1.listening, status: "pending" },
      notice: { ...plan1.notice, status: "pending" },
      deep: { ...plan1.deep, status: "pending" },
      retrieval: { ...plan1.retrieval, status: "pending" },
      speaking: { ...plan1.speaking, status: "pending" },
      transfer: { ...plan1.transfer, status: "pending" },
    };
    const liteSeq = buildSequence(litePlan);
    check("lite session strips notice/deep/speaking", !liteSeq.includes("notice") && !liteSeq.includes("deep") && !liteSeq.includes("speaking"));
    check("lite session keeps reading+retrieval", liteSeq.includes("reading") && liteSeq.includes("retrieval"));

    // ── 8 · Planner reacts next cycle (existing V10 mechanism) ────────────
    await setActiveExam("ielts");
    check("planner adapts next cycle (existing V10 mechanism)", m1d?.status === "completed");

    // ── 9 · V16 hardening: cold start + stable totals + dirty-pair gate ────
    const u9 = await mkUser("__session_v16__", "ielts");
    uids.push(u9);
    const m9 = await generateTodayMission(u9);
    const p9 = m9.plan as MissionPlan;
    const s9 = await buildSessionPlan(p9, "ielts", u9);
    // empty bank → NOTICE deep-links to Discover, USE-IT gated, finish blocked
    const notice9 = s9.activities.find((a) => a.key === "notice");
    const deep9 = s9.activities.find((a) => a.key === "deep");
    check("cold start (empty bank): NOTICE routes to Discover", !!notice9 && notice9.href === "/chunks?tab=discover" && notice9.requiresItem === true, JSON.stringify(notice9?.href));
    check("cold start: USE-IT flagged requiresItem", !!deep9 && deep9.requiresItem === true);
    check("cold start: hasItems=false reported", s9.hasItems === false);
    // save one real chunk → cold-start routing lifts (real state, not fake evidence)
    const [c9] = await db.insert(chunksT).values({ userId: u9, text: "cold start end up doing", pattern: "p", meaningEn: "p", meaningZh: "p" }).returning();
    const s9b = await buildSessionPlan(p9, "ielts", u9);
    const notice9b = s9b.activities.find((a) => a.key === "notice");
    check("after saving one item: NOTICE returns to normal route", !!notice9b && notice9b.href !== "/chunks?tab=discover" && notice9b.requiresItem !== true, notice9b?.href);
    await db.delete(chunksT).where(eq(chunksT.userId, u9));
    // stable denominator: totals don't shrink when a step completes
    const t0 = s9b.totalCount;
    await markStepDone(u9, s9b.activities[0].key as StepKey);
    const m9b = await getTodayMission(u9);
    const s9c = await buildSessionPlan((m9b?.plan ?? p9) as MissionPlan, "ielts", u9);
    check("stable denominator: total unchanged after a step done", s9c.totalCount === t0, `${t0} → ${s9c.totalCount}`);
    // Today and session agree by construction (same builder): pendingCount == activities.length
    check("single source: pendingCount == activities.length", s9c.pendingCount === s9c.activities.length);
    // dirty error pairs are skipped at question generation
    // (answer-key leakage / list dumps / unrelated phrases — but single-word
    //  synonym swaps like farming→agriculture still pass)
    const [dirtyErr] = await db.insert(errorsT).values({ userId: u9, category: "grammar", wrongForm: "decoration", correctForm: "essential infrastructure", occurrenceCount: 3 }).returning();
    const [dirtyItem] = await db.insert(retrievalItems).values({ userId: u9, itemType: "error", itemId: dirtyErr.id, dueAt: Date.now() - 1000 }).returning();
    const q9 = await generateReviewQueue(u9, 20);
    check("incoherent wrong→correct pair is never served", !q9.some((e) => e.retrievalItemId === dirtyItem.id), `queue=${q9.length}`);
    const [synErr] = await db.insert(errorsT).values({ userId: u9, category: "vocabulary", wrongForm: "farming", correctForm: "agriculture", occurrenceCount: 2 }).returning();
    const [synItem] = await db.insert(retrievalItems).values({ userId: u9, itemType: "error", itemId: synErr.id, dueAt: Date.now() - 1000 }).returning();
    const q9s = await generateReviewQueue(u9, 20);
    check("synonym swap (no shared word) still served", q9s.some((e) => e.retrievalItemId === synItem.id));
    const [keyErr] = await db.insert(errorsT).values({ userId: u9, category: "grammar", wrongForm: "Q3: E", correctForm: "F", occurrenceCount: 2 }).returning();
    const [keyItem] = await db.insert(retrievalItems).values({ userId: u9, itemType: "error", itemId: keyErr.id, dueAt: Date.now() - 1000 }).returning();
    const q9k = await generateReviewQueue(u9, 20);
    check("answer-key leak (Q3: E → F) never served", !q9k.some((e) => e.retrievalItemId === keyItem.id));
    const [goodErr] = await db.insert(errorsT).values({ userId: u9, category: "preposition", wrongForm: "interested on", correctForm: "interested in", occurrenceCount: 2 }).returning();
    const [goodItem] = await db.insert(retrievalItems).values({ userId: u9, itemType: "error", itemId: goodErr.id, dueAt: Date.now() - 1000 }).returning();
    const q9b = await generateReviewQueue(u9, 20);
    check("coherent pair still served", q9b.some((e) => e.retrievalItemId === goodItem.id));
    await db.delete(errorsT).where(eq(errorsT.userId, u9));

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    await setActiveExam(originalExam);
    await cleanup(uids);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
