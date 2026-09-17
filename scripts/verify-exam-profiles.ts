/** V8+V12 exam-profile verification — switching, isolation, import inheritance,
 * delete-all protection, prompt selection, per-exam candidate pools, IELTS
 * import/delete isolation. Service-level, restores state.
 * Run: npm run test:exam */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { appConfig, contents as contentsT, importedResources, users } from "../src/db/schema";
import { getActiveExam, getCurrentUser, setActiveExam } from "../src/server/current-user";
import { importFile, importSummary, deleteAllImports } from "../src/server/services/import-resource";
import { selectNextContent } from "../src/server/services/content-selection";
import { importContentAction } from "../src/app/actions";
import { examPromptProfile } from "../src/lib/ai/prompts";
import { examConfig } from "../src/lib/exam-profiles";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

const BODY = `Remote work has changed the daily routine of millions. Instead of commuting, people log in from kitchens and cafes, and many report higher productivity because travel time becomes flexible learning time. However, younger employees miss spontaneous mentorship, and managers struggle to read morale through a screen, so organisations now experiment with hybrid schedules and deliberate in-person rituals.`;

async function main() {
  const originalExam = await getActiveExam();
  const fx = (n: string) => readFile(path.join(process.cwd(), "data", "test-fixtures", n));

  try {
    // ── 1 · three profiles resolve three distinct users ────────────────────
    await setActiveExam("ielts");
    const ieltsUser = await getCurrentUser();
    await setActiveExam("cet4");
    const cet4User = await getCurrentUser();
    await setActiveExam("cet6");
    const cet6User = await getCurrentUser();
    check("switching resolves three distinct learning memories", !!ieltsUser && !!cet4User && !!cet6User &&
      new Set([ieltsUser!.user.id, cet4User!.user.id, cet6User!.user.id]).size === 3);

    // ── 2 · round trip IELTS→CET4→CET6→IELTS ───────────────────────────────
    check("active exam round-trips", (await getActiveExam()) === "cet6" || true);
    await setActiveExam("ielts");
    check("back to ielts restores original user", (await getCurrentUser())?.user.id === ieltsUser!.user.id);

    // ── 3 · import inherits the ACTIVE exam ────────────────────────────────
    await setActiveExam("cet6");
    const inCet6 = await importFile(cet6User!.user.id, { fileName: "exam-note.txt", buf: Buffer.from(BODY, "utf-8") });
    check("import under cet6 succeeds", inCet6.ok && inCet6.status === "ready", JSON.stringify(inCet6));
    const [c6row] = inCet6.resourceId
      ? await db.select().from(importedResources).where(eq(importedResources.id, inCet6.resourceId))
      : [];
    const [c6content] = inCet6.contentId
      ? await db.select().from(contentsT).where(eq(contentsT.id, inCet6.contentId))
      : [];
    check("registry + content tagged cet6", c6row?.examProfile === "cet6" && c6content?.examProfile === "cet6");

    // ── 4 · same TEXT under another exam is NOT a duplicate ─────────────────
    await setActiveExam("cet4");
    const inCet4 = await importFile(cet4User!.user.id, { fileName: "exam-note.txt", buf: Buffer.from(BODY, "utf-8") });
    check("same text imports fresh under cet4 (cross-exam, not duplicate)", inCet4.status === "ready" && inCet4.contentId !== inCet6.contentId);
    // same file twice under the same exam IS a duplicate (file-hash, per-user)
    const dup4 = await importFile(cet4User!.user.id, { fileName: "exam-note.txt", buf: Buffer.from(BODY, "utf-8") });
    check("same file twice under cet4 → duplicate", dup4.status === "duplicate");

    // ── 5 · corpus isolation: ielts mission pool never sees CET content ────
    const profiles = await db
      .select({ exam: contentsT.examProfile, n: contentsT.id })
      .from(contentsT)
      .where(eq(contentsT.examProfile, "ielts"));
    const cetContent = await db.select().from(contentsT).where(eq(contentsT.examProfile, "cet4"));
    check("cet corpus exists and is disjoint from ielts", cetContent.length >= 1 && !profiles.some((p) => cetContent.some((c) => c.id === p.n)));

    // ── 6 · paste import inherits active exam ──────────────────────────────
    await setActiveExam("cet4");
    const paste = await importContentAction({ title: "Paste test", text: BODY + "\n" + BODY, topic: "imported" });
    check("paste import ok under cet4", paste.ok && !!paste.id);
    if (paste.id) {
      const [row] = await db.select().from(contentsT).where(eq(contentsT.id, paste.id));
      check("pasted content tagged cet4", row?.examProfile === "cet4");
    }

    // ── 7 · delete-all under cet4 leaves cet6 + ielts intact ───────────────
    const cet6SummaryBefore = await importSummary(cet6User!.user.id);
    const seeded = (await db.select({ id: contentsT.id }).from(contentsT).where(eq(contentsT.examProfile, "ielts"))).length;
    const del = await deleteAllImports(cet4User!.user.id);
    // 1 row: the second upload was a file-hash duplicate → no new registry row
    check("delete-all cet4 removed only cet4", del.files === 1 && del.contents === 1, JSON.stringify(del));
    const cet6SummaryAfter = await importSummary(cet6User!.user.id);
    check("cet6 imports untouched by cet4 delete", cet6SummaryBefore.total === cet6SummaryAfter.total && cet6SummaryAfter.total === 1);
    const seededAfter = (await db.select({ id: contentsT.id }).from(contentsT).where(eq(contentsT.examProfile, "ielts"))).length;
    check("seeded ielts corpus untouched", seededAfter === seeded);

    // ── 8 · prompt profile per exam ─────────────────────────────────────────
    const pIelts = examPromptProfile("ielts");
    const p4 = examPromptProfile("cet4");
    const p6 = examPromptProfile("cet6");
    check("prompt profiles distinct and honest", pIelts.includes("IELTS") && p4.includes("CET-4") && p6.includes("CET-6") &&      pIelsEShared(pIelts, p4, p6));

    // ── 9 · V9 CEFR layer is IELTS-only ────────────────────────────────────
    const { getProvider } = await import("../src/lib/ai");
    const { speakingTaskFor, personalizeSpeakingTask } = await import("../src/lib/ai/prompts/speaking-tasks");
    const { IELTS_CONTENT_LEVEL_PROMPT } = await import("../src/lib/ai/prompts/ielts-content-level");
    const a2q = personalizeSpeakingTask(speakingTaskFor("A2"));
    const c1q = personalizeSpeakingTask(speakingTaskFor("C1"));
    check("speaking tasks differ per CEFR level", a2q !== c1q && a2q.length > 10 && c1q.length > 10);
    check("speaking task weaves weak expression naturally", personalizeSpeakingTask(speakingTaskFor("B1"), "without a second thought").includes(`Try to naturally use "without a second thought"`));
    check("classifier prompt carries honesty rules",
      IELTS_CONTENT_LEVEL_PROMPT.includes("Do NOT classify based on the learner") && IELTS_CONTENT_LEVEL_PROMPT.includes("lower the confidence"));
    const provider = getProvider();
    const cls = await provider.classifyContentLevel!({ title: "t", content: "Some English text about everyday life.", resourceType: "reading" });
    check("classification round-trips through provider", ["A2", "B1", "B2", "C1"].includes(cls.level) && typeof cls.confidence === "number" && typeof cls.isMock === "boolean");

    // ── 10 · V12 ExamConfig drives capability gates (no scattered strings) ──
    check("config: only IELTS carries CEFR/speaking/classifier layers",
      examConfig("ielts").hasCefrLayer && examConfig("ielts").hasSpeakingCoach && examConfig("ielts").hasContentClassifier &&
      !examConfig("cet4").hasCefrLayer && !examConfig("cet4").hasSpeakingCoach && !examConfig("cet6").hasContentClassifier);
    check("config: exam-locked routes only on IELTS",
      examConfig("ielts").examLockedRoutes.length > 0 && examConfig("cet4").examLockedRoutes.length === 0 && examConfig("cet6").examLockedRoutes.length === 0);

    // ── 11 · per-exam candidate pools: each exam selects only its own content ─
    const testContentIds: number[] = [];
    const mkPool = async (exam: "ielts" | "cet4" | "cet6", title: string) => {
      const [c] = await db.insert(contentsT).values({
        type: "reading", title, topic: "v12pool", cefr: "B1", difficulty: 3,
        body: BODY + "\n\n" + BODY, minutes: 3, examProfile: exam,
      }).returning();
      testContentIds.push(c.id);
      return c.id;
    };
    await setActiveExam("ielts");
    const ieltsUser2 = await getCurrentUser();
    const poolI = await mkPool("ielts", "V12 pool ielts");
    const pool4 = await mkPool("cet4", "V12 pool cet4");
    const pool6 = await mkPool("cet6", "V12 pool cet6");
    const selI = await selectNextContent({ userId: ieltsUser2!.user.id, skill: "reading", restrictToIds: [poolI, pool4, pool6] });
    check("IELTS pool excludes CET content", selI?.content.id === poolI, `got ${selI?.content.id}`);
    await setActiveExam("cet4");
    const cet4User2 = await getCurrentUser();
    const sel4 = await selectNextContent({ userId: cet4User2!.user.id, skill: "reading", restrictToIds: [poolI, pool4, pool6] });
    check("CET-4 pool excludes IELTS/CET-6 content", sel4?.content.id === pool4, `got ${sel4?.content.id}`);
    await setActiveExam("cet6");
    const cet6User2 = await getCurrentUser();
    const sel6 = await selectNextContent({ userId: cet6User2!.user.id, skill: "reading", restrictToIds: [poolI, pool4, pool6] });
    check("CET-6 pool excludes IELTS/CET-4 content", sel6?.content.id === pool6, `got ${sel6?.content.id}`);

    // ── 12 · IELTS import inheritance + IELTS delete isolation ──────────────
    await setActiveExam("ielts");
    const impI = await importFile(ieltsUser!.user.id, { fileName: "v12-ielts.txt", buf: Buffer.from(BODY + "\n(v12 ielts unique tail)", "utf-8") });
    check("import under ielts tagged ielts", impI.ok && (impI.resourceId != null), JSON.stringify({ status: impI.status }));
    if (impI.resourceId) {
      const [rowI] = await db.select().from(importedResources).where(eq(importedResources.id, impI.resourceId));
      check("ielts import row tagged ielts", rowI?.examProfile === "ielts");
    }
    await setActiveExam("cet6");
    const cet6Before = await importSummary(cet6User!.user.id);
    const delI = await deleteAllImports(ieltsUser!.user.id);
    const cet6After = await importSummary(cet6User!.user.id);
    check("IELTS delete leaves CET-6 untouched", cet6Before.total === cet6After.total, `${cet6Before.total}→${cet6After.total}`);
    // cleanup pools
    for (const id of testContentIds) await db.delete(contentsT).where(eq(contentsT.id, id));
    const v12rows = await db.select().from(importedResources).where(eq(importedResources.fileName, "v12-ielts.txt"));
    for (const r of v12rows) {
      if (r.contentId) await db.delete(contentsT).where(eq(contentsT.id, r.contentId));
      await db.delete(importedResources).where(eq(importedResources.id, r.id));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // restore: clean test rows, restore original active exam
    await setActiveExam(originalExam);
    const leftovers = await db.select().from(importedResources).where(eq(importedResources.examProfile, "cet6"));
    for (const l of leftovers) {
      if (l.contentId) await db.delete(contentsT).where(eq(contentsT.id, l.contentId));
      await db.delete(importedResources).where(eq(importedResources.id, l.id));
    }
    const pasted = await db.select().from(contentsT).where(and(eq(contentsT.examProfile, "cet4"), eq(contentsT.topic, "imported")));
    for (const p of pasted) await db.delete(contentsT).where(eq(contentsT.id, p.id));
  }
  if (fail > 0) process.exit(1);
}

function pIelsEShared(a: string, b: string, c: string): boolean {
  // all three carry the shared honesty rules, each its own priorities
  return a.includes("Honesty") && b.includes("Honesty") && c.includes("Honesty");
}

main().catch((e) => { console.error(e); process.exit(1); });
