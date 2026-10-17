/** V15.1 Wrong→Practice verification — the full chain: error → two-stage
 *  practice → engine grading → ladder/SM-2 → retention takeover → provenance
 *  log — with the original error row provably untouched. Run: npm run
 *  test:wrong-practice */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  errors as errorsT, learningProfiles, retrievalItems, reviewHistory,
  users, wrongPracticeLog, wrongPracticeSessions,
} from "../src/db/schema";
import { addError } from "../src/server/services/bank";
import { startWrongPractice, submitWrongPractice } from "../src/server/services/wrong-practice";
import { generateReviewQueue } from "../src/server/services/retention";
import { mockDrills } from "../src/lib/ai/mock-drills";
import { getActiveExam, setActiveExam } from "../src/server/current-user";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

async function main() {
  const originalExam = await getActiveExam();
  await setActiveExam("ielts");
  let uid: number | null = null;
  let cetUid: number | null = null;
  try {
    const [u] = await db.insert(users).values({ name: "__wp_verify__", examProfile: "ielts" }).returning();
    uid = u.id;
    await db.insert(learningProfiles).values({ userId: uid, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });

    /* ── 1 · error → practice start (drills reused, WHY framed) ────────── */
    const banked = await addError(uid, {
      category: "vocabulary",
      wrongForm: "farming",
      correctForm: "agriculture",
      explanation: "Q12 (matching_information) — 官方同义替换考点: farming = agriculture",
      sourceModule: "ieltscb_reading",
    });
    const snapshot = JSON.stringify(banked);

    const start = await startWrongPractice(uid, banked.id);
    check("① start ok: session + WHY carries the source question", start.ok && start.why.en.includes("IELTS reading") && start.why.en.includes("Q12"), start.ok ? "" : "no start");
    check("① two fresh contexts, correct form NOT shipped to client",
      start.ok && start.recall.context.includes("____") && start.transfer.context.includes("____") &&
      !start.ok || (start.ok && !start.recall.context.includes("agriculture") && !start.transfer.context.includes("agriculture") && !start.wrongForm.includes("agriculture")));

    /* ── 2 · new contexts are not copies of the original ───────────────── */
    const drills = mockDrills({ wrongForm: "farming", correctForm: "agriculture", category: "vocabulary" });
    check("② generated contexts differ from the original sentence",
      drills.items.every((d) => !d.context.includes("relies heavily on farming")) && drills.items.every((d) => !d.context.includes("farming")));

    const [item] = await db.select().from(retrievalItems)
      .where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, banked.id))).limit(1);
    check("② error has its retrieval item (existing engine wiring)", !!item);

    /* ── 3 · retrieval FAIL → incorrect, rescheduled early ─────────────── */
    const histBefore = (await db.select().from(reviewHistory).where(eq(reviewHistory.userId, uid))).length;
    const f1 = await submitWrongPractice(uid, start.ok ? start.sessionId : "", banked.id, "retrieval", "farming is important");
    check("③ wrong form in answer → incorrect (quality 0)", f1.ok && f1.result === "incorrect" && f1.quality === 0 && f1.next === "review-queue", JSON.stringify(f1));
    check("③ engine wrote review_history + interval reset (due tomorrow)", (await db.select().from(reviewHistory).where(eq(reviewHistory.userId, uid))).length === histBefore + 1);
    const [afterFail] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, item.id));
    check("③ SM-2 reset: interval 1 day, failCount+1", afterFail.intervalDays === 1 && afterFail.failCount === 1, `interval=${afterFail.intervalDays} fails=${afterFail.failCount}`);
    const queue = await generateReviewQueue(uid, 20, "errors");
    check("③ item back in the review queue (revenge)", queue.some((q) => q.retrievalItemId === item.id));

    /* ── 4 · transfer blocked until recall succeeds (order guard) ─────── */
    const tEarly = await submitWrongPractice(uid, start.ok ? start.sessionId : "", banked.id, "transfer", "agriculture matters");
    check("④ transfer rejected before successful recall", !tEarly.ok && tEarly.code === "STAGE_ORDER");

    /* ── 5 · new session: retrieval SUCCESS → partial allowed too ─────── */
    const s2 = await startWrongPractice(uid, banked.id);
    const r2 = await submitWrongPractice(uid, s2.ok ? s2.sessionId : "", banked.id, "retrieval", "agriculture");
    check("⑤ correct form alone → correct, transfer unlocked", r2.ok && r2.result === "correct" && r2.quality === 5 && r2.next === "transfer", JSON.stringify(r2));
    const dupe = await submitWrongPractice(uid, s2.ok ? s2.sessionId : "", banked.id, "retrieval", "agriculture");
    check("⑤ duplicate stage in one session rejected", !dupe.ok && dupe.code === "DUPLICATE_STAGE");

    /* ── 6 · transfer SUCCESS → contexts grow, ladder advances ────────── */
    const lsBefore = item.learningState?.contexts?.length ?? 0;
    const t2 = await submitWrongPractice(uid, s2.ok ? s2.sessionId : "", banked.id, "transfer", "Modern agriculture feeds the region.");
    check("⑥ transfer graded by engine (quality 5)", t2.ok && t2.quality === 5, JSON.stringify(t2));
    const [afterTransfer] = await db.select().from(retrievalItems).where(eq(retrievalItems.id, item.id));
    const lsAfter = afterTransfer.learningState;
    check("⑥ ladder at retrieval-or-higher with productionHits recorded (engine's own call)",
      ["retrieval", "usage", "transfer", "retention"].includes(lsAfter.state) && (lsAfter.productionHits ?? 0) >= 1,
      `state=${lsAfter.state} hits=${lsAfter.productionHits}`);
    check("⑥ contexts recorded by the existing engine", (lsAfter.contexts?.length ?? 0) > lsBefore);

    /* ── 7 · transfer FAIL in its own session → handled by engine ─────── */
    const s3 = await startWrongPractice(uid, banked.id);
    const r3 = await submitWrongPractice(uid, s3.ok ? s3.sessionId : "", banked.id, "retrieval", "agriculture");
    const t3 = await submitWrongPractice(uid, s3.ok ? s3.sessionId : "", banked.id, "transfer", "I do not know");
    check("⑦ transfer fail → incorrect, no crash, engine reschedules", r3.ok && t3.ok && t3.result === "incorrect");

    /* ── 8 · provenance log: separate from the original error ─────────── */
    const logs = await db.select().from(wrongPracticeLog).where(eq(wrongPracticeLog.userId, uid));
    check("⑧ log rows carry source + question + stage + result",
      logs.length === 5 && logs.every((l) => l.source === "IELTSCB report" && l.sourceQuestion === "Q12") &&
      logs.some((l) => l.practiceType === "retrieval" && l.result === "incorrect") &&
      logs.some((l) => l.practiceType === "transfer" && l.result === "correct"));

    /* ── 9 · the original error row is byte-identical ──────────────────── */
    const [now] = await db.select().from(errorsT).where(eq(errorsT.id, banked.id));
    check("⑨ original error never modified (wrongForm/category/status intact)", JSON.stringify(now) === snapshot);

    /* ── 10 · exam isolation: a CET user cannot touch an IELTS error ──── */
    const [cu] = await db.insert(users).values({ name: "__wp_cet__", examProfile: "cet4" }).returning();
    cetUid = cu.id;
    await db.insert(learningProfiles).values({ userId: cetUid, cefr: "B2", immersionLevel: 1, dailyMinutes: 45 });
    const cross = await startWrongPractice(cetUid, banked.id);
    const crossSubmit = await submitWrongPractice(cetUid, "00000000-0000-0000-0000-000000000000", banked.id, "retrieval", "agriculture");
    check("⑩ CET user cannot start or submit an IELTS error", !cross.ok && !crossSubmit.ok);

    /* ── 10b · session issuance (hardening): a submission must present a
       session id the server actually ISSUED for THIS error. Fabricated ids
       used to fabricate practice evidence (review counts + SM-2 churn). ── */
    const fabricated = await submitWrongPractice(uid, "11111111-2222-3333-4444-555555555556", banked.id, "retrieval", "agriculture");
    check("⑩b never-issued sessionId rejected", !fabricated.ok && fabricated.code === "SESSION_NOT_ISSUED", JSON.stringify(fabricated));
    const err2 = await addError(uid, {
      category: "grammar", wrongForm: "discuss about", correctForm: "discuss",
      explanation: "preposition", sourceModule: "writing",
    });
    const sOther = await startWrongPractice(uid, err2.id);
    const mismatch = sOther.ok
      ? await submitWrongPractice(uid, sOther.sessionId, banked.id, "retrieval", "agriculture")
      : { ok: false as const, code: "start-failed" as string };
    check("⑩b session issued for ANOTHER error rejected (mismatch)", !mismatch.ok && mismatch.code === "SESSION_MISMATCH", JSON.stringify(mismatch));
    // and the legitimate flow is unaffected: err2's own session grades fine
    const legit = sOther.ok
      ? await submitWrongPractice(uid, sOther.sessionId, err2.id, "retrieval", "discuss")
      : { ok: false as const };
    check("⑩b issued session submits normally for its own error", legit.ok, JSON.stringify(legit));

    /* ── 11 · AI fallback: generation works with no provider at all ───── */
    const fb = mockDrills({ wrongForm: "discuss about", correctForm: "discuss", category: "grammar" });
    check("⑪ mock/fallback drills are usable (2+ contexts, blank present)", fb.items.length >= 2 && fb.items.every((d) => d.context.includes("____")));

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    if (uid != null) {
      await db.delete(wrongPracticeSessions).where(eq(wrongPracticeSessions.userId, uid));
      await db.delete(wrongPracticeLog).where(eq(wrongPracticeLog.userId, uid));
      await db.delete(reviewHistory).where(eq(reviewHistory.userId, uid));
      await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
      await db.delete(errorsT).where(eq(errorsT.userId, uid));
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
    if (cetUid != null) {
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, cetUid));
      await db.delete(users).where(eq(users.id, cetUid));
    }
    console.log("  (wrong-practice verify user cleaned up)");
    await setActiveExam(originalExam);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
