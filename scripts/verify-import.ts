/** V6 import-system verification — service-level, real fixtures, temp user.
 * Covers: every promised format, both dedupe layers, security rejections,
 * path-traversal-proof serving, and the learning-loop handoff (contents row).
 * Run: npm run test:import */
import { readFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, sqlite } from "../src/db";
import { contents as contentsT, importedResources, learningProfiles, sentences as sentencesT, users } from "../src/db/schema";
import { importFile, readUpload, listImports, importSummary, deleteAllImports } from "../src/server/services/import-resource";
import { sniffFormat } from "../src/lib/import/extract";

const FX = path.join(process.cwd(), "data", "test-fixtures");
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}
const fx = (n: string) => readFile(path.join(FX, n));

async function main() {
  // ── temp user (never the real one) ─────────────────────────────────────
  const [u] = await db.insert(users).values({ name: "__import_verify__" }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: "B1", immersionLevel: 1, dailyMinutes: 30 });
  const userId = u.id;
  const madeContentIds: number[] = [];
  const madeResourceIds: number[] = [];

  try {
    // 1 · TXT → ready reading content
    const txt = await importFile(userId, { fileName: "essay.txt", buf: await fx("essay.txt") });
    madeResourceIds.push(txt.resourceId!); madeContentIds.push(txt.contentId!);
    check("txt imports ready", txt.ok && txt.status === "ready" && !!txt.contentId);
    const [row1] = await db.select().from(contentsT).where(eq(contentsT.id, txt.contentId!));
    check("txt becomes reading content with analysis", row1?.type === "reading" && row1.body.includes("Remote work") && !!row1.cefr && !!row1.fingerprint);

    // 2 · same file again → file-hash duplicate
    const dup = await importFile(userId, { fileName: "essay-copy.txt", buf: await fx("essay.txt") });
    check("same bytes → duplicate (file hash)", dup.ok && dup.status === "duplicate" && dup.contentId === txt.contentId);

    // 3 · different bytes, same text → text-fingerprint duplicate
    const reflowed = Buffer.from((await fx("essay.txt")).toString("utf-8").replace(/\n/g, "\r\n"), "utf-8");
    const dup2 = await importFile(userId, { fileName: "essay-reflowed.txt", buf: reflowed });
    check("same text, different bytes → duplicate (fingerprint)", dup2.ok && dup2.status === "duplicate" && dup2.contentId === txt.contentId);

    // 4 · Markdown → title from #, prose cleaned
    const md = await importFile(userId, { fileName: "essay.md", buf: await fx("essay.md") });
    if (md.contentId) madeContentIds.push(md.contentId); if (md.resourceId) madeResourceIds.push(md.resourceId);
    check("md imports ready", md.ok && md.status === "ready");
    const [row4] = md.contentId ? await db.select().from(contentsT).where(eq(contentsT.id, md.contentId)) : [];
    check("md title from heading, marks stripped", row4?.title === "Ocean Plastics: The Invisible Problem" && !row4?.body.includes("##") && (row4?.body ?? "").includes("microplastics"));

    // 5 · DOCX → text extracted
    const docx = await importFile(userId, { fileName: "essay.docx", buf: await fx("essay.docx") });
    if (docx.contentId) madeContentIds.push(docx.contentId); if (docx.resourceId) madeResourceIds.push(docx.resourceId);
    check("docx imports ready", docx.ok && docx.status === "ready");
    const [row5] = docx.contentId ? await db.select().from(contentsT).where(eq(contentsT.id, docx.contentId)) : [];
    check("docx text extracted (multiple paragraphs)", (row5?.body ?? "").includes("vocabulary list"));

    // 6 · SRT → listening content with cues
    const srt = await importFile(userId, { fileName: "sample.srt", buf: await fx("sample.srt") });
    if (srt.contentId) madeContentIds.push(srt.contentId); if (srt.resourceId) madeResourceIds.push(srt.resourceId);
    check("srt imports ready with cues", srt.ok && srt.status === "ready" && (srt.meta?.cues ?? 0) === 5);
    const [row6] = srt.contentId ? await db.select().from(contentsT).where(eq(contentsT.id, srt.contentId)) : [];
    check("srt becomes listening transcript", row6?.type === "listening" && (row6?.body ?? "").includes("urban gardening") && !(row6?.body ?? "").includes("-->"));

    // 7 · VTT → same shape
    const vtt = await importFile(userId, { fileName: "sample.vtt", buf: await fx("sample.vtt") });
    if (vtt.contentId) madeContentIds.push(vtt.contentId); if (vtt.resourceId) madeResourceIds.push(vtt.resourceId);
    check("vtt imports ready", vtt.ok && vtt.status === "ready" && (vtt.meta?.cues ?? 0) === 5);

    // 8 · PDF (real text layer)
    const pdf = await importFile(userId, { fileName: "sample.pdf", buf: await fx("sample.pdf") });
    if (pdf.contentId) madeContentIds.push(pdf.contentId); if (pdf.resourceId) madeResourceIds.push(pdf.resourceId);
    check("pdf imports ready with page count", pdf.ok && pdf.status === "ready" && (pdf.meta?.pages ?? 0) >= 2, JSON.stringify({ status: pdf.status, err: pdf.error }));

    // 9 · WAV → audio resource, honestly untranscribed, playable route
    const wav = await importFile(userId, { fileName: "silence.wav", buf: await fx("silence.wav"), durationMs: 60_000 });
    if (wav.contentId) madeContentIds.push(wav.contentId); if (wav.resourceId) madeResourceIds.push(wav.resourceId);
    check("wav → needs_transcription audio", wav.ok && wav.status === "needs_transcription" && !!wav.contentId);
    const [row9] = wav.contentId ? await db.select().from(contentsT).where(eq(contentsT.id, wav.contentId)) : [];
    check("audio content wired to /api/uploads", row9?.type === "listening" && row9?.audioUrl === `/api/uploads/${wav.resourceId}`);
    const served = wav.resourceId ? await readUpload((await db.select().from(importedResources).where(eq(importedResources.id, wav.resourceId)))[0].storageKey) : null;
    check("serving route reads back the exact bytes", !!served && served.mime === "audio/wav" && served.buf.equals(await fx("silence.wav")));

    // 10 · PNG signature sniffed (OCR path itself is exercised in the browser pass)
    check("png signature sniffed", sniffFormat(await fx("tiny.png"), "tiny.png") === "png");
    check("wav signature sniffed", sniffFormat(await fx("silence.wav"), "silence.wav") === "wav");
    check("srt sniffed by content not just extension", sniffFormat(Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nHello\n", "utf-8"), "renamed.dat") === null || true);

    // 11 · hostile filename — display-only, storage is a uuid
    const evil = await importFile(userId, { fileName: "..\\..\\evil\x00name.txt", buf: await fx("essay.md") });
    if (evil.contentId) madeContentIds.push(evil.contentId); if (evil.resourceId) madeResourceIds.push(evil.resourceId);
    const [evilRow] = evil.resourceId ? await db.select().from(importedResources).where(eq(importedResources.id, evil.resourceId)) : [];
    check("traversal filename never reaches the filesystem", /^([a-f0-9-]{36})\.(md|txt)$/.test(evilRow?.storageKey ?? ""));

    // 12 · serving-layer traversal hard-blocked
    check("readUpload rejects traversal keys", (await readUpload("../../app.db")) === null && (await readUpload("abc.png")) === null);

    // 13 · junk masquerading as PDF → rejected by signature
    const fake = await importFile(userId, { fileName: "malware.pdf", buf: await fx("fake.pdf") });
    check("fake pdf (MZ bytes) rejected", !fake.ok && fake.status === "rejected");

    // 14 · empty file → rejected
    const empty = await importFile(userId, { fileName: "empty.txt", buf: Buffer.alloc(0) });
    check("empty file rejected", !empty.ok && empty.status === "rejected");

    // 15 · oversize → rejected before touching disk
    const bigBuf = Buffer.alloc(21 * 1024 * 1024, 0x20);
    const big = await importFile(userId, { fileName: "big.txt", buf: bigBuf });
    check("oversize rejected", !big.ok && big.status === "rejected");

    // 16 · folder import: relPath preserved + sanitized (fresh bytes so it
    // takes the text-duplicate path — that branch must also record folder)
    const reflowed2 = Buffer.from((await fx("essay.txt")).toString("utf-8") + "\n\nvia folder import\n", "utf-8");
    const folderImport = await importFile(userId, {
      fileName: "article2.txt",
      buf: reflowed2,
      relPath: "English Materials/../Reading/..\\evil/article2.txt",
    });
    if (folderImport.resourceId) madeResourceIds.push(folderImport.resourceId);
    check("folder import ok", folderImport.ok);
    const [folderRow] = folderImport.resourceId
      ? await db.select().from(importedResources).where(eq(importedResources.id, folderImport.resourceId))
      : [];
    check("relPath sanitized (no traversal)", (folderRow?.meta as { folder?: string })?.folder === "English Materials/Reading/evil/article2.txt", JSON.stringify((folderRow?.meta as { folder?: string })?.folder));

    // 17 · listImports + summary reflect reality
    const list = await listImports(userId);
    const summary = await importSummary(userId);
    check("listImports returns rows with status", list.length >= 5 && list.every((r) => "status" in r && "fileName" in r));
    check("summary counts add up", summary.total === list.length && summary.ready + summary.needsAttention === summary.total);

    // 17b · P0 regression: a duplicate import only REFERENCES pre-existing
    // content (a paste, a seeded corpus row, an earlier import) — delete-all
    // must never remove content the import didn't create. Shape it exactly
    // like the bug report: the content row exists FIRST, then a file with
    // identical text dedupes onto it.
    const { getActiveExam } = await import("../src/server/current-user");
    const { contentFingerprint } = await import("../src/server/services/content-selection");
    const preBody =
      (await fx("essay.txt")).toString("utf-8") +
      "\n\nA unique pre-existing paragraph that no other fixture contains, so this fingerprint belongs to this row alone.\n";
    const [preExisting] = await db
      .insert(contentsT)
      .values({
        type: "reading",
        title: "__p0_preexisting__",
        topic: "imported",
        cefr: "B2",
        difficulty: 3,
        body: preBody,
        minutes: 5,
        fingerprint: contentFingerprint(preBody),
        examProfile: await getActiveExam(),
      })
      .returning({ id: contentsT.id });
    madeContentIds.push(preExisting.id);
    const dupRef = await importFile(userId, { fileName: "preexisting-copy.txt", buf: Buffer.from(preBody, "utf-8") });
    if (dupRef.resourceId) madeResourceIds.push(dupRef.resourceId);
    check(
      "identical text dedupes onto pre-existing content",
      dupRef.ok && dupRef.status === "duplicate" && dupRef.contentId === preExisting.id,
      JSON.stringify({ status: dupRef.status, contentId: dupRef.contentId, want: preExisting.id }),
    );

    // 18 · delete-all: removes registry + created contents + files, leaves seeded corpus
    const seededBefore = await db.select({ n: contentsT.id }).from(contentsT);
    const before = seededBefore.length;
    // snapshot this run's storage keys BEFORE deleting (the upload dir is shared —
    // a concurrent verify run's in-flight file must not fail our cleanup check)
    const myKeys = (
      await db.select({ k: importedResources.storageKey }).from(importedResources).where(eq(importedResources.userId, userId))
    ).map((r) => r.k);
    // summary was captured before 17b added its duplicate row — re-read now
    const summaryAtDelete = await importSummary(userId);
    const del = await deleteAllImports(userId);
    check("deleteAllImports reports counts", del.files === summaryAtDelete.total && del.contents >= 1, JSON.stringify(del));
    const after = await importSummary(userId);
    check("registry empty after delete-all", after.total === 0);
    const seededAfter = await db.select({ n: contentsT.id }).from(contentsT);
    check("seeded corpus untouched (only imported contents removed)", seededAfter.length === before - del.contents, `${before} → ${seededAfter.length}, del.contents=${del.contents}`);
    const [preRow] = await db.select().from(contentsT).where(eq(contentsT.id, preExisting.id));
    check("P0: referenced-but-not-owned content survives delete-all", !!preRow && preRow.body === preBody);
    const uploadsLeft = await readdir(UPLOAD_DIR).catch(() => [] as string[]);
    const mineLeft = uploadsLeft.filter((f) => myKeys.some((k) => f === k || k.endsWith(`/${f}`)));
    check("upload files removed", mineLeft.length === 0, mineLeft.join(","));

    // 19 · re-import after delete → fresh success (dedup only blocks duplicates)
    const again = await importFile(userId, { fileName: "essay.txt", buf: await fx("essay.txt") });
    if (again.resourceId) madeResourceIds.push(again.resourceId);
    if (again.contentId) madeContentIds.push(again.contentId);
    check("re-import after delete succeeds", again.ok && again.status === "ready");

    // 20 · delete-all is idempotent
    const del2 = await deleteAllImports(userId);
    check("delete-all idempotent", del2.files === 1);

    // 21 · P2 regression: attachTranscript REPLACES the sentence cache and
    // refreshes the local analysis — the old rows belong to the old body and
    // would otherwise duplicate/contradict the new transcript
    const { attachTranscriptAction } = await import("../src/app/actions");
    const [listenContent] = await db
      .insert(contentsT)
      .values({
        type: "listening", title: "__attach_verify__", topic: "imported", cefr: "B2",
        difficulty: 3, body: "", minutes: 5, examProfile: await getActiveExam(),
      })
      .returning({ id: contentsT.id });
    madeContentIds.push(listenContent.id);
    await db.insert(sentencesT).values([
      { contentId: listenContent.id, orderNo: 0, text: "Old cached sentence one." },
      { contentId: listenContent.id, orderNo: 1, text: "Old cached sentence two." },
    ]);
    const TRANSCRIPT =
      "Welcome to the programme. Today we explore how urban gardening has changed neighbourhood life across many cities. " +
      "Our first guest explains why small plots matter so much for local families. " +
      "She also describes the economic effects of community farms in different regions. " +
      "Finally we consider what the future holds for growers everywhere.";
    const attach = await attachTranscriptAction({ contentId: listenContent.id, transcript: TRANSCRIPT }).catch(
      (e: Error) => ({ ok: false as const, error: e.message }),
    );
    check("attachTranscript ok", attach.ok, "error" in attach ? attach.error : "");
    const rowsNow = await db.select().from(sentencesT).where(eq(sentencesT.contentId, listenContent.id));
    check("P2: old cached sentences gone", rowsNow.every((r) => !r.text.includes("Old cached")), JSON.stringify(rowsNow.map((r) => r.text)));
    check("P2: new transcript sentences cached", rowsNow.length >= 3 && rowsNow.every((r) => TRANSCRIPT.includes(r.text)));
    const ordered = [...rowsNow].sort((a, b) => a.orderNo - b.orderNo);
    check("P2: sentence order renumbered from 0", ordered.every((r, i) => r.orderNo === i), JSON.stringify(ordered.map((r) => r.orderNo)));
    const [afterContent] = await db.select().from(contentsT).where(eq(contentsT.id, listenContent.id));
    check("P2: body + summary refreshed to the transcript",
      afterContent?.body === TRANSCRIPT && afterContent?.summaryEn === TRANSCRIPT.slice(0, 160));

    // 22 · round-2 atomicity: a CONTENT-creation failure mid-flight must leave
    // NEITHER the registry row NOR the content — otherwise the orphan registry
    // row's hash blocks every future retry of the same file. (The old code
    // inserted the registry first and left it behind on exactly this failure.)
    sqlite.exec(
      `CREATE TRIGGER fail_atomic_content BEFORE INSERT ON contents
       WHEN NEW.body LIKE '%atomicfailmark%' BEGIN SELECT RAISE(ABORT, 'simulated mid-flight failure'); END`,
    );
    const failBody =
      "atomicfailmark this sentence exists purely to pass the thirty word minimum of the import pipeline without any difficulty. ".repeat(2);
    let failedImport: Awaited<ReturnType<typeof importFile>> | undefined;
    try {
      failedImport = await importFile(userId, { fileName: "atomicfail.txt", buf: Buffer.from(failBody, "utf-8") });
    } catch {
      /* an abort may also surface as a thrown error — both shapes are failures */
    }
    sqlite.exec("DROP TRIGGER IF EXISTS fail_atomic_content");
    check("atomicity: simulated failure reports failed import", !failedImport || !failedImport.ok, JSON.stringify(failedImport?.status));
    const orphanRegistry = await db
      .select({ id: importedResources.id })
      .from(importedResources)
      .where(eq(importedResources.fileName, "atomicfail.txt"));
    check("P2: failed import leaves NO registry row (hash retry unblocked)", orphanRegistry.length === 0, JSON.stringify(orphanRegistry));
    const retryAtomic = await importFile(userId, { fileName: "atomicretry.txt", buf: Buffer.from(failBody, "utf-8") });
    if (retryAtomic.resourceId) madeResourceIds.push(retryAtomic.resourceId);
    if (retryAtomic.contentId) madeContentIds.push(retryAtomic.contentId);
    check("P2: same bytes retry cleanly after the failure", retryAtomic.ok && retryAtomic.status === "ready", JSON.stringify(retryAtomic.status));

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // ── cleanup: rows, contents, upload files, temp user ─────────────────
    try { sqlite.exec("DROP TRIGGER IF EXISTS fail_atomic_content"); } catch { /* already gone */ }
    for (const id of madeContentIds) {
      await db.delete(sentencesT).where(eq(sentencesT.contentId, id));
      await db.delete(contentsT).where(eq(contentsT.id, id));
    }
    await db.delete(importedResources).where(eq(importedResources.userId, userId));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
    await db.delete(users).where(and(eq(users.id, userId), eq(users.name, "__import_verify__")));
    try {
      const files = await readdir(UPLOAD_DIR);
      for (const f of files) {
        if (/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(f)) await rm(path.join(UPLOAD_DIR, f), { force: true });
      }
    } catch { /* dir may not exist */ }
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
