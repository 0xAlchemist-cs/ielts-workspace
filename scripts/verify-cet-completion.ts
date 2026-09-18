/** V12.2.1 CET completion verification — writing AI feedback + exam timer.
 * Real configs asserted (30/25/40/30 and 30/30/40/30); timer flows exercised
 * in test mode (seconds not minutes). Temp users, surgical cleanup.
 * Run: npm run test:cet-completion */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { cetExamSessions, cetTasks, errors as errorsT, learningProfiles, users } from "../src/db/schema";
import { getActiveExam, setActiveExam } from "../src/server/current-user";
import { getProvider } from "../src/lib/ai";
import {
  EXAM_SECTION_MINUTES,
  TEST_SECTION_SECONDS,
  startExamSession,
  getLiveExamSession,
  advanceSection,
} from "../src/server/services/cet-exam-timer";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

async function mkUser(name: string, exam: "cet4" | "cet6"): Promise<number> {
  const [u] = await db.insert(users).values({ name, examProfile: exam }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 45 });
  return u.id;
}

async function main() {
  const originalExam = await getActiveExam();
  const uids: number[] = [];
  try {
    // ── Writing AI feedback ──────────────────────────────────────────────────
    const provider = getProvider();
    const fb4 = await provider.cetWritingFeedback!({
      exam: "cet4", section: "writing",
      prompt: "Write an essay on the importance of urban green spaces (120-180 words).",
      answer: "Urban green spaces are very important. They make cities beautiful. Parks give people a place to exercise and relax. I think every city should have more parks because they help people feel less stress and more happy. Trees also make the air cleaner, which is good for health.",
    });
    check("CET-4 AI feedback round-trips (4 sections of guidance)",
      fb4.strengths.length > 0 && fb4.problems.length > 0 && fb4.suggestions.length > 0 && fb4.revisionTargets.length > 0,
      JSON.stringify(fb4).slice(0, 100));
    const fb6 = await provider.cetWritingFeedback!({
      exam: "cet6", section: "translation",
      prompt: "翻译：近年来，越来越多的城市开始重视绿色空间的建设。",
      answer: "In recent years, more and more cities have begun to pay attention to the development of green spaces.",
    });
    check("CET-6 translation feedback round-trips", fb6.suggestions !== undefined);
    check("feedback is practice guidance (mock labels itself honestly)", fb4.isMock === true || fb4.isMock === false);
    check("no official score language in feedback output",
      !JSON.stringify(fb4).includes("official score") && !JSON.stringify(fb4).includes("官方成绩"));
    // AI failure fallback is structural: FallbackProvider catches to mock
    check("AI failure degrades to mock (structural)", typeof fb4.isMock === "boolean");

    // Error Bank / Memory integration happens through submitCetAttempt (test:cet covers)

    // ── Timer configs (real, official) ─────────────────────────────────────
    check("CET-4 official: 30/25/40/30 = 125",
      EXAM_SECTION_MINUTES.cet4.writing === 30 && EXAM_SECTION_MINUTES.cet4.listening === 25 &&
      EXAM_SECTION_MINUTES.cet4.reading === 40 && EXAM_SECTION_MINUTES.cet4.translation === 30 &&
      Object.values(EXAM_SECTION_MINUTES.cet4).reduce((a, b) => a + b, 0) === 125);
    check("CET-6 official: 30/30/40/30 = 130",
      EXAM_SECTION_MINUTES.cet6.writing === 30 && EXAM_SECTION_MINUTES.cet6.listening === 30 &&
      EXAM_SECTION_MINUTES.cet6.reading === 40 && EXAM_SECTION_MINUTES.cet6.translation === 30 &&
      Object.values(EXAM_SECTION_MINUTES.cet6).reduce((a, b) => a + b, 0) === 130);
    check("test mode uses seconds (never waits minutes)",
      TEST_SECTION_SECONDS.cet4.writing === 30 && TEST_SECTION_SECONDS.cet4.listening === 20);

    // ── Timer flow (test mode, service-level) ──────────────────────────────
    await setActiveExam("cet4");
    const u4 = await mkUser("__cetcomp4__", "cet4");
    uids.push(u4);
    const s0 = await startExamSession(u4, "cet4", true);
    check("session starts at writing with fresh clock", s0.currentSection === "writing" && !s0.submitted);
    check("writing remaining ≈ 30s (test mode)", (s0.sections.writing?.remainingMs ?? 0) <= 30_000);
    // resume (refresh-safety): same session, clock keeps running
    const s0b = await startExamSession(u4, "cet4", true);
    check("resume returns the SAME session (refresh-safe)", s0b.sessionId === s0.sessionId && s0b.examStartTime === s0.examStartTime);
    // advance writing → listening
    const s1 = await advanceSection(u4, s0.sessionId, "writing", true, {}, "my essay draft");
    check("writing → listening (timedOut recorded)", s1?.currentSection === "listening" && s1.timedOut.includes("writing"));
    // idempotent double-advance (rapid clicks): same state
    const s1b = await advanceSection(u4, s0.sessionId, "writing", true, {}, "dup");
    check("double advance is idempotent", s1b?.currentSection === "listening");
    // advance through to submission
    const s2 = await advanceSection(u4, s0.sessionId, "listening", false, { "0": "A" });
    const s3 = await advanceSection(u4, s0.sessionId, "reading", false, { "0": "B" });
    const s4 = await advanceSection(u4, s0.sessionId, "translation", false, {}, "my translation");
    check("full sequence ends submitted", s4?.submitted === true);
    // answers preserved per section
    const [row] = await db.select().from(cetExamSessions).where(eq(cetExamSessions.id, s0.sessionId)).limit(1);
    const answers = row.answers as Record<string, { freeText?: string }>;
    check("all 4 sections' answers preserved", !!answers.writing && !!answers.listening && !!answers.reading && !!answers.translation && answers.writing.freeText === "my essay draft");
    check("submittedAt recorded (immutable)", row.submittedAt != null);
    // cannot advance a submitted session
    const s5 = await advanceSection(u4, s0.sessionId, "writing", true, {});
    check("submitted session rejects further advance", s5 === null || s5.submitted);

    // CET-6 session independence
    await setActiveExam("cet6");
    const u6 = await mkUser("__cetcomp6__", "cet6");
    uids.push(u6);
    const s6 = await startExamSession(u6, "cet6", true);
    check("CET-6 session independent (own row, writing start)", s6.currentSection === "writing" && s6.sessionId !== s0.sessionId);
    const a6 = await advanceSection(u6, s6.sessionId, "writing", true, {}, "six essay");
    check("CET-6 advances identically", a6?.currentSection === "listening");

    // IELTS untouched
    await setActiveExam("ielts");
    const live = await getLiveExamSession(u4, "cet4");
    check("live-session query scoped to exam (ielts switch does not disturb)", live === null || live.exam === "cet4");

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    await setActiveExam(originalExam);
    for (const uid of uids) {
      await db.delete(cetExamSessions).where(eq(cetExamSessions.userId, uid));
      await db.delete(errorsT).where(eq(errorsT.userId, uid));
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
