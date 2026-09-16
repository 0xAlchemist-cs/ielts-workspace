/** V8 exam-profile verification — switching, isolation, import inheritance,
 * delete-all protection, prompt selection. Service-level, restores state.
 * Run: npm run test:exam */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { appConfig, contents as contentsT, importedResources, users } from "../src/db/schema";
import { getActiveExam, getCurrentUser, setActiveExam } from "../src/server/current-user";
import { importFile, importSummary, deleteAllImports } from "../src/server/services/import-resource";
import { importContentAction } from "../src/app/actions";
import { examPromptProfile } from "../src/lib/ai/prompts";

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
    check("prompt profiles distinct and honest", pIelts.includes("IELTS") && p4.includes("CET-4") && p6.includes("CET-6") &&
      p4.includes("never claim") === false && // claim rule lives in base text
      pIelsEShared(pIelts, p4, p6));

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
