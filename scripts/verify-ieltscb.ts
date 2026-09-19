/** V14 IELTSCB Reading URL Import verification — deterministic, offline
 *  (runs against the saved real fixture) + one LIVE round-trip when
 *  IELTSCB_LIVE=1. Covers spec §27: URL parser, API validation, adapter,
 *  evidence mapping, answer semantics, preview, confirm, duplicate strategy,
 *  error routing, readiness consumption. V14.1 adds: import diagnostics,
 *  passages-array foundation, image fallback, sentence-tagged passage
 *  display, error-type derivation, attempt-history integrity, scoring copy.
 *  Run: npm run test:ieltscb */
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { errors as errorsT, ieltscbImports, ieltsAttempts, ieltsTasks, learningProfiles, users } from "../src/db/schema";
import { parseIeltscbReportUrl } from "../src/lib/ieltscb/url";
import { validateIeltscbEnvelope } from "../src/lib/ieltscb/client";
import { adaptIeltscbReport, buildImportDiagnostics, buildPassageDisplay, deriveErrorType, htmlToText, splitAnswerVariants, tolerantEqual } from "../src/lib/ieltscb/adapter";
import { buildIeltscbPreview, confirmIeltscbImport } from "../src/server/services/ieltscb-import";
import { getActiveExam, setActiveExam } from "../src/server/current-user";
import { buildReadiness } from "../src/server/services/readiness";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

const REAL_URL = "https://www.ieltscb.com/Report/indexread?paper_id=121&classify=2&chapters_id=905&p_type=8&tid=6596156";
/** fixture is the real report above, but confirm-path tests run under a
 *  synthetic tid so they NEVER collide with the user's real import of this
 *  passage (duplicate detection is real data, not test state) */
const TEST_URL = REAL_URL.replace("tid=6596156", "tid=990001111");

async function main() {
  const originalExam = await getActiveExam();
  await setActiveExam("ielts");
  let uid: number | null = null;
  let taskId: number | null = null;

  try {
    /* ── 1 · URL parser ─────────────────────────────────────────────────── */
    const p1 = parseIeltscbReportUrl(REAL_URL);
    check("① URL parser extracts all params", p1.ok && p1.params.paperId === 121 && p1.params.classify === 2 && p1.params.chaptersId === 905 && p1.params.pType === 8 && p1.params.tid === 6596156);
    check("① URL parser rejects garbage", !parseIeltscbReportUrl("not a url").ok);
    const rej1 = parseIeltscbReportUrl("https://example.com/Report/indexread?paper_id=1");
    check("① URL parser rejects foreign host", !rej1.ok && rej1.code === "UNSUPPORTED_URL");
    const rej2 = parseIeltscbReportUrl("https://www.ieltscb.com/Report/indexread?paper_id=121&classify=2&chapters_id=905&p_type=8");
    check("① URL parser rejects missing tid", !rej2.ok && rej2.code === "INVALID_PARAMS");
    const rej3 = parseIeltscbReportUrl("https://www.ieltscb.com/Other/x?paper_id=1&classify=2&chapters_id=3&p_type=4&tid=5");
    check("① URL parser rejects non-Report paths", !rej3.ok && rej3.code === "UNSUPPORTED_URL");

    /* ── 2 · envelope validation ────────────────────────────────────────── */
    check("② envelope accepts e=9999", validateIeltscbEnvelope({ e: "9999", m: "ok", data: { question_list: {} } as never }).ok);
    const bad = validateIeltscbEnvelope({ e: "1001", m: "请先登录" });
    check("② envelope maps login errors to AUTH_REQUIRED", !bad.ok && bad.code === "AUTH_REQUIRED");
    const bad2 = validateIeltscbEnvelope({ e: "1002", m: "boom" });
    check("② envelope maps other codes to API_ERROR", !bad2.ok && bad2.code === "API_ERROR");

    /* ── 3 · unit helpers ───────────────────────────────────────────────── */
    check("③ htmlToText strips tags + nbsp", htmlToText("A.<br /><b>cold</b>&nbsp;weather") === "A. cold weather");
    check("③ splitAnswerVariants handles / and |", splitAnswerVariants("anchor| ship's anchor |an anchor ").join("~") === "anchor~ship's anchor~an anchor");
    check("③ tolerantEqual ignores case/punct", tolerantEqual("A.  Babylonians", "a babylonians"));

    /* ── 4 · adapter vs saved REAL fixture ─────────────────────────────── */
    const envelope = JSON.parse(readFileSync("data/ieltscb-samples/report-121-905-6596156.json", "utf-8")) as { data: never };
    const raw = envelope.data;
    const params = parseIeltscbReportUrl(REAL_URL)!.ok ? ({ paperId: 121, classify: 2, chaptersId: 905, pType: 8, tid: 6596156 } as const) : null;
    const { test } = adaptIeltscbReport(raw, params!, REAL_URL);

    check("④ content_title", test.title === "A Chronicles of Timekeeping");
    check("④ 8 paragraphs A-H + subtitle", test.passage.paragraphs.length === 8 && test.passage.paragraphs.map((p) => p.label).join("") === "ABCDEFGH" && !!test.passage.subtitle);
    check("④ 3 question groups", test.questionGroups.length === 3);
    check("④ 13 questions flat", test.questions.length === 13);
    check("④ group types detected", test.questionGroups.map((g) => g.type).join(",") === "matching_information,matching_classification,diagram_label");
    check("④ 13 answers present", test.questions.every((q) => q.isCorrect != null));
    check("④ user answers = answer-card text", test.questions.find((q) => q.number === 2)?.userAnswer === "A" && test.questions.find((q) => q.number === 9)?.userAnswer === "yet");
    check("④ correct answers = option_names", test.questions.find((q) => q.number === 1)?.correctAnswer === "D" && test.questions.find((q) => q.number === 2)?.correctAnswer === "B" && test.questions.find((q) => q.number === 3)?.correctAnswer === "F" && test.questions.find((q) => q.number === 4)?.correctAnswer === "E");
    check("④ Q1-Q4 user/correct/isright per spec",
      test.questions.filter((q) => [1, 2, 3, 4].includes(q.number)).every((q) => q.isCorrect === (q.number === 1)));
    check("④ question_list.answer agrees with option_names (no conflict)", !test.warnings.some((w) => w.code === "ANSWER_CONFLICT"));
    check("④ 13 official explanations", test.questions.every((q) => q.explanation) && test.questions.every((q) => q.explanation!.officialGuide));
    check("④ evidence: Q1 → paragraph D", test.questions.find((q) => q.number === 1)?.evidence[0]?.paragraphLabel === "D");
    check("④ evidence text non-empty", (test.questions.find((q) => q.number === 1)?.evidence[0]?.text?.length ?? 0) > 20);
    check("④ synonyms imported", test.synonyms.length === 9 && test.synonyms[0].questionWord === "cold" && test.synonyms[0].passageWords === "freezing");
    check("④ core words = 111", test.coreWords.length === 111);
    check("④ whole-paper guide preserved", (test.officialGuide?.length ?? 0) > 100);
    check("④ summary 2/13 + duration 357", test.summary.correctCount === 2 && test.summary.rightNumText === "2/13" && test.summary.durationSeconds === 357);
    check("④ fill-in accepted variants (no invention, no dupes)",
      (test.questions.find((q) => q.number === 9)?.acceptedAnswers.length ?? 0) === 3 &&
      !!test.questions.find((q) => q.number === 9)?.acceptedAnswers.includes("ship’s anchor"));

    /* ── 4b · V14.1: passages array + diagnostics + image fallback ─────── */
    check("④b passages array (test foundation) keeps single-passage shape", test.passages.length === 1 && test.passages[0] === test.passage);
    const diag = buildImportDiagnostics(test, null, { responseHash: "a".repeat(64), importDurationMs: 123 });
    check("④b diagnostics: 9 stages, fetch+api success", diag.stages.length === 9 && diag.stages.filter((s) => s.stage === "fetch" || s.stage === "api").every((s) => s.status === "success"));
    check("④b diagnostics: evidence=warning (11/13), images=warning (no source img)", diag.stages.find((s) => s.stage === "evidence")?.status === "warning" && diag.stages.find((s) => s.stage === "images")?.status === "warning");
    check("④b diagnostics: answers+analysis+synonym success", ["answers", "analysis", "synonym"].every((k) => diag.stages.find((s) => s.stage === k)?.status === "success"));
    check("④b diagnostics: parser version + hash + duration carried", diag.parserVersion === "1.0.0" && diag.responseHash === "a".repeat(64) && diag.importDurationMs === 123);
    check("④b image fallback: no img field → null + honest source tag", test.questionGroups.every((g) => g.imageUrl === null && g.imageSource === "none"));
    check("④b error type: blank → 未作答", deriveErrorType({ userAnswer: null, type: "matching_information", paraphrases: [] }).zh === "未作答");
    check("④b error type: synonym → 同义替换未识别", deriveErrorType({ userAnswer: "A", type: "matching_information", paraphrases: [{ questionWord: "cold", passageWords: "freezing" }] }).zh === "同义替换未识别");
    check("④b error type: no-synonym matching → 定位偏差", deriveErrorType({ userAnswer: "E", type: "matching_information", paraphrases: [] }).zh === "定位偏差");
    check("④b error type: fill-in → 词汇产出缺口", deriveErrorType({ userAnswer: "no", type: "diagram_label", paraphrases: [] }).zh === "词汇产出缺口");

    /* ── 4c · V14.1 §4: sentence-tagged passage display ────────────────── */
    const display = buildPassageDisplay(test);
    const taggedSentences = display.flatMap((p) => p.sentences.filter((s) => s.tags.length > 0));
    const q1Sentence = taggedSentences.find((s) => s.tags.includes("Q1"));
    check("④c passage display: 8 paragraphs, tagged sentences exist", display.length === 8 && taggedSentences.length >= 10);
    check("④c Q1 sentence tagged + carries the freezing evidence", !!q1Sentence && /freezing/i.test(q1Sentence.text));
    check("④c tags come only from source markers (Q12/Q13 absent as warned)", !taggedSentences.some((s) => s.tags.includes("Q12")));

    /* ── 5+6 · temp user, then preview + confirm (offline, raw injected;
 *         synthetic tid can never collide with real imports) ─────────── */
    const [u] = await db.insert(users).values({ name: "__ieltscb_verify__", examProfile: "ielts" }).returning();
    uid = u.id;
    await db.insert(learningProfiles).values({ userId: uid, cefr: "B2", immersionLevel: 1, dailyMinutes: 45 });

    const pv = await buildIeltscbPreview(TEST_URL, { raw, userId: uid });
    check("⑤ preview ok, nothing written yet", pv.ok && pv.preview.questions.length === 13 && pv.preview.existing === null);
    check("⑤ preview diagnostics attached (hash + stages)", pv.ok && !!pv.preview.diagnostics && pv.preview.diagnostics.stages.length === 9 && /^[0-9a-f]{64}$/.test(pv.preview.diagnostics.responseHash ?? ""));
    check("⑤ preview evidence count 11/13", pv.ok && pv.preview.questions.filter((q) => q.evidence.length > 0).length === 11);

    const c1 = await confirmIeltscbImport(uid, TEST_URL, { raw });
    check("⑥ confirm → imported", c1.ok && c1.action === "imported");
    taskId = c1.ok ? c1.taskId : null;

    const [taskRow] = taskId ? await db.select().from(ieltsTasks).where(eq(ieltsTasks.id, taskId)) : [];
    check("⑥ task row: source ieltscb, 13 questions, options A-H", taskRow?.source === "ieltscb" && (taskRow?.questions as { options?: string[] }[])?.length === 13 && ((taskRow?.questions as { options?: string[] }[])[0]?.options?.length ?? 0) === 8);
    check("⑥ task explanations carry official fields", Array.isArray((taskRow?.explanations as { questionExplanations?: unknown[] })?.questionExplanations) && ((taskRow?.explanations as { questionExplanations?: { paraphrase: string | null }[] }).questionExplanations?.[0]?.paraphrase ?? "").includes("="));
    check("⑥ task explanations carry passageDisplay for highlighting", Array.isArray((taskRow?.explanations as { passageDisplay?: unknown[] })?.passageDisplay) && ((taskRow?.explanations as { passageDisplay?: { sentences: { tags: string[] }[] }[] }).passageDisplay?.length ?? 0) === 8);

    const [impRow] = await db.select().from(ieltscbImports).where(eq(ieltscbImports.userId, uid));
    check("⑥ registry: raw snapshot + canonical + parser version", !!impRow && impRow.parserVersion === "1.0.0" && !!impRow.rawSnapshot && !!impRow.canonical && impRow.tid === 990001111);

    const attemptId1 = c1.ok ? c1.attemptId : null;
    const [att1] = attemptId1 ? await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.id, attemptId1)) : [];
    const att1Responses = (att1?.responses ?? {}) as { taskSkill?: string; source?: string; external?: { tid?: number; bandBasis?: string }; answers?: Record<string, string> };
    check("⑥ attempt: taskSkill reading + source ieltscb + answers", att1Responses.taskSkill === "reading" && att1Responses.source === "ieltscb" && att1Responses.external?.tid === 990001111 && Object.keys(att1Responses.answers ?? {}).length === 13);
    check("⑥ attempt: score 15 band 3 (2/13 → scaled 6/40)", att1?.score === 15 && att1?.band === 3, `got score=${att1?.score} band=${att1?.band}`);
    check("⑥ attempt: band labeled passage reference, NOT official band", (att1Responses.external?.bandBasis ?? "").includes("passage practice reference"));

    /* ── 7 · error routing: synonym misses → vocabulary errors ─────────── */
    const routed = await db.select().from(errorsT).where(and(eq(errorsT.userId, uid), eq(errorsT.sourceModule, "ieltscb_reading")));
    check("⑦ wrong Q2 (agriculture=farming) banked as vocabulary", routed.some((e) => e.category === "vocabulary" && e.wrongForm === "farming" && e.correctForm === "agriculture"));

    /* ── 8 · duplicate: same tid → update, never a second attempt ──────── */
    const before = (await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, uid))).length;
    const questionsBefore = ((await db.select().from(ieltsTasks).where(eq(ieltsTasks.id, taskId!)))[0]?.questions as unknown[])?.length;
    const c2 = await confirmIeltscbImport(uid, TEST_URL, { raw });
    const after = (await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, uid))).length;
    const questionsAfter = ((await db.select().from(ieltsTasks).where(eq(ieltsTasks.id, taskId!)))[0]?.questions as unknown[])?.length;
    check("⑧ same report re-import → updated, attempts untouched", c2.ok && c2.action === "updated" && before === after);
    check("⑧ question set is static source data (re-import changes nothing)", questionsBefore === 13 && questionsAfter === 13);

    /* ── 9 · same material re-tested (new tid) → attempt-added ─────────── */
    const RETEST_URL = TEST_URL.replace("tid=990001111", "tid=990001112");
    const c3 = await confirmIeltscbImport(uid, RETEST_URL, { raw });
    check("⑨ re-test same passage → new attempt, same task", c3.ok && c3.action === "attempt-added" && c3.taskId === taskId);
    const attemptsAll = await db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, uid)).orderBy(ieltsAttempts.createdAt);
    check("⑨ two attempts on one task, history preserved (attempt 1 intact)", attemptsAll.length === 2 && attemptsAll.every((a) => a.taskId === taskId) && attemptsAll[0].id === attemptId1);
    check("⑨ questions never duplicated by re-test", ((await db.select().from(ieltsTasks).where(eq(ieltsTasks.id, taskId!)))[0]?.questions as unknown[])?.length === 13);

    /* ── 10 · readiness consumes imported bands ─────────────────────────── */
    const rd = await buildReadiness(uid, "ielts");
    const reading = rd.skills.find((s) => s.skill === "reading");
    check("⑩ readiness sees the reading evidence", (reading?.why.en.match(/\d+ attempts?/) ?? reading?.why.en.match(/attempt/)) !== null, reading?.why.en);

    /* ── 12 · V14.2 external-practice收口 + internal mock retired ────────
     * config-level assertions (import the real modules) + source guards
     * (fs) that keep the retirement from silently regressing */
    const coaches = await import("../src/lib/external-coaches");
    check("⑫ external coach config: one GPT covers speaking + listening", coaches.EXTERNAL_COACHES.length >= 1 && coaches.EXTERNAL_COACHES.some((c) => c.skill === "both" && c.url.startsWith("https://chatgpt.com/")));
    check("⑫ IELTSCB entries defined from config (user-supplied reading list, no invented deep links)", coaches.IELTSCB_URL === "https://www.ieltscb.com/" && coaches.IELTSCB_READING_URL === "https://www.ieltscb.com/ReadQuestion/listpage?classify=2");

    const readSrc = (p: string) => readFileSync(p, "utf-8");
    const ieltsPage = readSrc("src/app/ielts/page.tsx");
    check("⑫ /ielts page renders the External Practice area", ieltsPage.includes("<ExternalPractice />"));
    const ep = readSrc("src/app/ielts/external-practice.tsx");
    check("⑫ Reading entry + 去做真题 CTA use the real reading list URL; full practice stays on site root", ep.split("IELTSCB_READING_URL").length >= 3 && ep.includes("IELTSCB_URL"));
    check("⑫ Speaking + Listening entries read the existing coach URL", ep.includes("EXTERNAL_COACH_URL"));
    const panel = readSrc("src/app/library/ieltscb-panel.tsx");
    check("⑫ import panel round-trip link also targets the reading list", panel.includes("IELTSCB_READING_URL"));
    const extAnchors = ep.split("<a").slice(1);
    check("⑫ every external anchor template: target=_blank + rel=noopener noreferrer (workspace tab never covered)", extAnchors.length >= 2 && extAnchors.every((a) => a.includes('target="_blank"') && a.includes('rel="noopener noreferrer"')));
    const sidebar = readSrc("src/components/shell/sidebar.tsx");
    check("⑫ Full Mock gone from sidebar navigation", !sidebar.includes("/ielts/mock") && !sidebar.includes("全真模考"));
    const topbar = readSrc("src/components/shell/topbar.tsx");
    check("⑫ Full Mock gone from topbar section map", !topbar.includes("/ielts/mock"));
    const mockPage = readSrc("src/app/ielts/mock/page.tsx");
    check("⑫ /ielts/mock redirects to /ielts (never a 404)", mockPage.includes('redirect("/ielts")'));
    let mockExamExists = true;
    try {
      readFileSync("src/app/ielts/mock/exam.tsx");
    } catch {
      mockExamExists = false;
    }
    check("⑫ mock exam UI + API + service retired", !mockExamExists);

    /* ── 11 · LIVE round-trip (network; only with IELTSCB_LIVE=1) ─────── */
    if (process.env.IELTSCB_LIVE === "1") {
      const live = await buildIeltscbPreview(REAL_URL);
      check("⑪ LIVE: fetch+adapt real URL without cookies", live.ok && live.preview.questions.length === 13 && live.preview.summary.correctCount === 2);
      const liveBad = await buildIeltscbPreview("https://www.ieltscb.com/Report/indexread?paper_id=121&classify=2&chapters_id=905&p_type=8&tid=1");
      check("⑪ LIVE: unknown tid → clean error, no crash", !liveBad.ok);
    } else {
      check("⑪ LIVE round-trip skipped (set IELTSCB_LIVE=1)", true);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // ── cleanup: temp user + everything the import wrote ──────────────────
    if (uid != null) {
      await db.delete(ieltscbImports).where(eq(ieltscbImports.userId, uid));
      await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, uid));
      if (taskId != null) await db.delete(ieltsTasks).where(eq(ieltsTasks.id, taskId));
      await db.delete(errorsT).where(eq(errorsT.userId, uid));
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
      console.log("  (ieltscb verify user cleaned up)");
    }
    await setActiveExam(originalExam);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
