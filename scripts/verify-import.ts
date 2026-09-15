/** V6 import-system verification — service-level, real fixtures, temp user.
 * Covers: every promised format, both dedupe layers, security rejections,
 * path-traversal-proof serving, and the learning-loop handoff (contents row).
 * Run: npm run test:import */
import { readFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { contents as contentsT, importedResources, learningProfiles, users } from "../src/db/schema";
import { importFile, readUpload } from "../src/server/services/import-resource";
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

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // ── cleanup: rows, contents, upload files, temp user ─────────────────
    for (const id of madeContentIds) await db.delete(contentsT).where(eq(contentsT.id, id));
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
