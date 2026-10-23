/* ── Step-13 FINAL ACCEPTANCE: the real learning loop, end to end ────────────
 * Independent acceptance pass over the 12-step chain (bd341ad…e45b327).
 * Tests and timing only — no refactoring here.
 *
 * Matrix (fresh isolated DB; mock-AI fallback stands in for the live AI —
 * exactly the FallbackProvider path steps 01/06 hardened):
 *  E1  material import incl. same-prefix/different-ending pair  (step 05)
 *  E2  reading exposure recorded                                 (baseline)
 *  E3  chunk extraction into the personal bank                   (baseline)
 *  E4  retrieval ladder recognition → … → transfer with served-mode
 *      credentials and an honest event ledger                    (steps 02/03)
 *  E5  error revenge: banked mistake requeued after failure      (baseline)
 *  E6  writing AI: mock fallback vs real band across the evidence
 *      policy                                                    (steps 01/06/07)
 *  E7  snapshot + verified metrics under mixed real/mock data     (steps 01/07)
 *  E8  today's mission + lite/full round-trip keeps progress     (step 04)
 *  E9  next-day and cross-week scheduling (time-travel on dueAt) (steps 02/03)
 *  E10 boundary: 1000+ personal chunks, forged submissions       (steps 02/03)
 *  E11 counters consistency after the whole loop                 (step 08)
 *  P*  timing records — recorded, never optimized here
 *
 * Run: npx tsx scripts/verify-final-acceptance.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "final-acceptance.db");
process.env.IELTS_DB_PATH = ISO_DB;

const DEFAULT_DB = path.join(ROOT, "data", "app.db");
if (!fs.existsSync(DEFAULT_DB)) {
  console.error("data/app.db not found — run `npm run db:push` first.");
  process.exit(1);
}
for (const p of [ISO_DB, `${ISO_DB}-wal`, `${ISO_DB}-shm`]) {
  if (fs.existsSync(p)) fs.rmSync(p);
}
const schemaSource = new Database(DEFAULT_DB, { readonly: true });
try {
  const ddl = schemaSource
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL " +
      "AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { sql: string }[];
  const iso = new Database(ISO_DB);
  try {
    iso.pragma("foreign_keys = OFF");
    for (const { sql } of ddl) iso.prepare(sql).run();
  } finally {
    iso.close();
  }
} finally {
  schemaSource.close();
}

let pass = 0;
let fail = 0;
const findings: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    findings.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t0 = Date.now();
  const r = await fn();
  console.log(`  [timing] ${label}: ${Date.now() - t0} ms`);
  return r;
};
const DAY = 86_400_000;
const latin = (w: string) =>
  `Long English prose about ${w}, with varied sentence structure for readability. `.repeat(40);

async function main() {
  const { db } = await import("../src/db");
  const {
    contents, contentHistory, chunks, retrievalItems, reviewHistory, chunkEvents,
    speakingAttempts, dailyMissions, users, learningProfiles, appConfig,
  } = await import("../src/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { importContentAction } = await import("../src/app/actions");
  const { importFile } = await import("../src/server/services/import-resource");
  const { markContentUsed } = await import("../src/server/services/content-selection");
  const { generateReviewQueue } = await import("../src/server/services/retention");
  const { addError, saveCustomChunk } = await import("../src/server/services/bank");
  const { ensureRetrievalItem } = await import("../src/server/services/retrieval");
  const { POST: answerPost } = await import("../src/app/api/review/answer/route");
  const { computeFullProfile } = await import("../src/server/services/learning-profile");
  const { computeMissionDecision } = await import("../src/server/services/priority-engine");
  const { generateTodayMission, getTodayMission } = await import("../src/server/services/mission");
  const { buildReadiness } = await import("../src/server/services/readiness");
  const { takeDailySnapshot } = await import("../src/server/services/trajectory");
  const { getTodayFunnel } = await import("../src/server/services/progress");

  const [u] = await db.insert(users).values({ name: "__acceptance__" }).returning({ id: users.id });
  const uid = u.id;
  await db.insert(learningProfiles).values({ userId: uid, dailyMinutes: 45 });
  await db.insert(appConfig).values({ key: "activeExam", value: "ielts" });

  /* ── E1 · material import (incl. the step-05 prefix pair) ── */
  const prefix = ("Urban planning history reveals persistent tensions worldwide. ".repeat(70)).slice(0, 2600);
  const a1 = await importContentAction({ text: prefix + " Green space must win.", title: "Prefix A" });
  const a2 = await importContentAction({ text: prefix + " Transit must win.", title: "Prefix B" });
  check("E1: same-prefix pair coexists as two materials",
    a1.ok && a2.ok && a1.id !== a2.id && (a2 as { duplicate?: boolean }).duplicate !== true,
    `a1=${a1.id} a2=${a2.id}`);
  const again = await importContentAction({ text: prefix + " Green space must win.", title: "Prefix A retry" });
  check("E1: exact re-import resolves to the original (duplicate)",
    (again as { duplicate?: boolean }).duplicate === true && again.id === a1.id);
  const f1 = await importFile(uid, { fileName: "notes.txt", buf: Buffer.from(latin("renewable energy"), "utf-8") });
  check("E1: file import creates ready content", f1.ok === true && f1.status === "ready", `${f1.status} ${f1.error ?? ""}`);
  void contents;

  /* ── E2 · reading exposure ── */
  await markContentUsed(uid, a1.id!);
  await markContentUsed(uid, a2.id!);
  const exposures = await db.select().from(contentHistory).where(eq(contentHistory.userId, uid));
  check("E2: content exposure recorded for both opened materials",
    exposures.length === 2 && new Set(exposures.map((e) => e.contentId)).size === 2);

  /* ── E3 · chunk extraction ── */
  const ladderChunk = await saveCustomChunk(uid, { text: "as a result", meaningEn: "consequently", meaningZh: "结果" });
  await ensureRetrievalItem(uid, "chunk", ladderChunk.id);
  const [ladderItem] = await db.select().from(retrievalItems)
    .where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "chunk"), eq(retrievalItems.itemId, ladderChunk.id)));
  check("E3: chunk extraction creates chunk + retrieval item at exposure",
    ladderChunk.id > 0 && ladderItem != null && ladderItem.learningState?.state === "exposure",
    `state=${ladderItem?.learningState?.state}`);

  /* ── E4 · retrieval ladder with served credentials + honest ledger ──
   * Chunk rotation (antiPatternMode) serves production at slot 0, cloze at
   * 1, context_transfer at 2; advancement follows the SERVED format
   * (step-02): production success → usage, transfer serve success →
   * transfer. The ladder is climbed via what was actually completed. */
  const post = (body: unknown) =>
    answerPost(new Request("http://localhost/api/review/answer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
  const mkDue = async (id: number) =>
    db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.id, id));

  await mkDue(ladderItem.id);
  let queue = await generateReviewQueue(uid, 10);
  let served = queue.find((q) => q.retrievalItemId === ladderItem.id);
  check("E4: fresh chunk item served its rotation slot 0 (production)", served?.mode === "production", `mode=${served?.mode}`);
  let res = await post({ retrievalItemId: ladderItem.id, mode: served!.mode, response: "as a result" });
  let item = (await db.select().from(retrievalItems).where(eq(retrievalItems.id, ladderItem.id)))[0];
  check("E4: completed production advances by what was done (→ usage)",
    res.status === 200 && item.learningState.state === "usage", `state=${item.learningState.state}`);
  const hitsAfterProduction = item.learningState.productionHits;

  await mkDue(ladderItem.id);
  queue = await generateReviewQueue(uid, 10);
  served = queue.find((q) => q.retrievalItemId === ladderItem.id);
  check("E4: next serve is the rotation slot 1 format (cloze)", served?.mode === "cloze", `mode=${served?.mode}`);
  res = await post({ retrievalItemId: ladderItem.id, mode: served!.mode, response: "as a result" });
  item = (await db.select().from(retrievalItems).where(eq(retrievalItems.id, ladderItem.id)))[0];
  check("E4: cloze success counts in the contextual bucket (not production)",
    item.learningState.contextualHits === 1 && item.learningState.productionHits === hitsAfterProduction,
    `ctx=${item.learningState.contextualHits} prod=${item.learningState.productionHits}`);

  await mkDue(ladderItem.id);
  queue = await generateReviewQueue(uid, 10);
  served = queue.find((q) => q.retrievalItemId === ladderItem.id);
  check("E4: usage-state item reaches the transfer format (rotation slot 2)", served?.mode === "context_transfer", `mode=${served?.mode}`);
  res = await post({ retrievalItemId: ladderItem.id, mode: "context_transfer", response: "As a result of the storm, the flight was delayed." });
  item = (await db.select().from(retrievalItems).where(eq(retrievalItems.id, ladderItem.id)))[0];
  check("E4: genuine transfer success → state transfer",
    res.status === 200 && item.learningState.state === "transfer", `state=${item.learningState.state}`);
  const useEvents = await db.select().from(chunkEvents)
    .where(and(eq(chunkEvents.userId, uid), eq(chunkEvents.chunkId, ladderChunk.id)));
  check("E4: review rounds fabricate NO production-use events (honest ledger)",
    useEvents.filter((e) => ["speaking_use", "ielts_use"].includes(e.type)).length === 0);

  /* ── E5 · error revenge ── */
  const err = await addError(uid, { category: "preposition", wrongForm: "capable to", correctForm: "capable of", sourceModule: "review", source: "manual" });
  const [errItem] = await db.select().from(retrievalItems)
    .where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, err.id)));
  await db.update(retrievalItems).set({ dueAt: Date.now() - 1000 }).where(eq(retrievalItems.id, errItem.id));
  const q5 = await generateReviewQueue(uid, 20);
  const errServed = q5.find((q) => q.retrievalItemId === errItem.id);
  check("E5: banked error surfaces in the queue as production", errServed?.mode === "production", `mode=${errServed?.mode}`);
  await post({ retrievalItemId: errItem.id, mode: "production", response: "I am capable to do it wrongly." });
  const errAfter = (await db.select().from(retrievalItems).where(eq(retrievalItems.id, errItem.id)))[0];
  check("E5: failed error item rescheduled (interval reset)", errAfter.failCount >= 1 && errAfter.intervalDays <= 1.01,
    `fails=${errAfter.failCount} interval=${errAfter.intervalDays}`);

  /* ── E6 · writing AI: mock fallback vs real band ──
   * The route-level persistence of the isMock stamp is locked by the
   * verify-mock-bypass and verify-evidence-policy gates (in verify:all);
   * revalidatePath needs the real server runtime, so this harness pins the
   * same shapes at the service layer. */
  const { mockProvider } = await import("../src/lib/ai/providers/mock");
  const mockFb = await mockProvider.writing({
    prompt: "Some task", text: "My essay uses as a result correctly. ".repeat(20), targetChunks: [],
  });
  const { writingAttempts } = await import("../src/db/schema");
  await db.insert(writingAttempts).values({
    userId: uid, taskType: "task2", prompt: "Some task", text: "essay",
    feedback: mockFb as unknown as object, ieltsScores: mockFb.ielts, usedChunkIds: [],
  });
  check("E6: offline fallback stamps isMock on the persisted feedback", mockFb.isMock === true);
  await db.insert(speakingAttempts).values({
    userId: uid, prompt: "p", transcript: "t",
    feedback: { overallEstimate: 6.5, isMock: false }, ieltsScores: { fluency: 6.5 },
    usedChunkIds: [ladderChunk.id], round: 1,
  });
  const profile = await computeFullProfile(uid);
  check("E6: real speaking band drives dimensions; mock writing does not",
    profile.speaking.find((d) => d.key === "fluency")?.score === 72 &&
      profile.writing.every((d) => typeof d.score !== "number"),
    `fluency=${profile.speaking.find((d) => d.key === "fluency")?.score}`);
  const readiness = await buildReadiness(uid, "ielts");
  check("E6: readiness counts the real band row, mock contributes none",
    (readiness.skills.find((s) => s.skill === "speaking")?.devExplanation.evidence ?? []).join(" ").includes("1"));

  /* ── E7 · snapshot + verified metrics under mixed evidence ── */
  const decision = await computeMissionDecision(uid);
  const snap = await timed("takeDailySnapshot", () => takeDailySnapshot(uid));
  check("E7: snapshot.estimatedIelts present with 1 real sample", typeof snap.estimatedIelts === "number");
  check("E7: verified transfer metric reflects the ledger (0 use events → null)",
    profile.overall.find((d) => d.key === "transfer_rate")?.score == null);
  check("E7: decision is explainable (headline + factors)",
    (decision.rationale.headline ?? "").length > 0 && decision.factors.length === 6);

  /* ── E8 · today's mission + lite round-trip ──
   * (service-layer calls: the action wrappers add revalidatePath, which
   * needs the real Next runtime — their no-op/permission contracts are
   * locked by verify-actions-contract) */
  const { markStepDone, toggleTodayLite } = await import("../src/server/services/mission");
  const mission = await generateTodayMission(uid);
  await markStepDone(uid, "retrieval");
  await toggleTodayLite(uid);
  await toggleTodayLite(uid);
  const m8 = await getTodayMission(uid);
  const p8 = (m8?.plan ?? {}) as { retrieval?: { status?: string }; lite?: boolean };
  check("E8: lite round-trip keeps the completed step and row identity",
    m8?.id === mission.id && p8.retrieval?.status === "done",
    `id ${mission.id}→${m8?.id} retrieval=${p8.retrieval?.status}`);

  /* ── E9 · next-day / cross-week scheduling (time travel) ── */
  await db.update(retrievalItems).set({ dueAt: Date.now() + 3 * DAY }).where(eq(retrievalItems.id, ladderItem.id));
  const futureQ = await generateReviewQueue(uid, 20);
  check("E9: item not yet due stays out of today's queue",
    !futureQ.some((q) => q.retrievalItemId === ladderItem.id));
  await db.update(retrievalItems)
    .set({
      learningState: { ...item.learningState, state: "retention" },
      lastRetentionCheckAt: Date.now() - 10 * DAY, retentionCheckInterval: 7,
    })
    .where(eq(retrievalItems.id, ladderItem.id));
  const retentionQ = await generateReviewQueue(uid, 20, "retention");
  const rserved = retentionQ.find((q) => q.retrievalItemId === ladderItem.id);
  check("E9: cross-week retention check due → served as retention_check",
    rserved?.mode === "retention_check", `mode=${rserved?.mode}`);

  /* ── E10 · boundary: 1000 chunks, forged submissions ── */
  const t0 = Date.now();
  db.transaction((tx) => {
    for (let i = 0; i < 1000; i++) {
      const c = tx.insert(chunks).values({
        userId: uid, text: `stress chunk ${i}`, meaningEn: "e", meaningZh: "z",
        pattern: "p", examples: [], retrievalStrength: 10 + (i % 60),
      }).returning({ id: chunks.id }).all()[0];
      tx.insert(retrievalItems).values({
        userId: uid, itemType: "chunk", itemId: c.id, dueAt: Date.now() - ((i % 30) * DAY),
        successCount: i % 3, failCount: i % 2, retentionScore: i % 100,
        learningState: {
          state: "exposure", achievedAt: {}, contexts: [],
          productionHits: 0, productionMisses: 0, contextualHits: 0, contextualMisses: 0,
        },
      }).run();
    }
  });
  const insertMs = Date.now() - t0;
  console.log(`  [timing] bulk insert 1000 chunks+items: ${insertMs} ms`);
  const qBig = await timed("generateReviewQueue(30) under 1000+ items", () => generateReviewQueue(uid, 30));
  check("E10: queue under 1000+ items stays correct and bounded",
    qBig.length === 30 && new Set(qBig.map((q) => q.retrievalItemId)).size === 30, `len=${qBig.length}`);
  await timed("computeMissionDecision under 1000+ items", () => computeMissionDecision(uid));
  await timed("computeFullProfile under 1000+ items", () => computeFullProfile(uid));
  const forged = await post({ retrievalItemId: ladderItem.id, mode: "context_transfer", response: "anything" });
  check("E10: uncredentialed privileged submission rejected (409)", forged.status === 409, `status=${forged.status}`);

  /* ── E11 · counters consistency ── */
  const funnel = await getTodayFunnel(uid);
  const graded = await db.select().from(reviewHistory).where(eq(reviewHistory.userId, uid));
  check("E11: funnel 'retrieved' count matches graded successes in history",
    funnel.retrieved === graded.filter((r) => r.quality >= 3).length,
    `funnel=${funnel.retrieved} history=${graded.filter((r) => r.quality >= 3).length}`);

  /* ── integrity of the acceptance DB + a snapshot restore drill ── */
  const iso = new Database(ISO_DB);
  const integ = iso.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const snapPath = ISO_DB + ".acceptance-snapshot";
  iso.prepare("vacuum into ?").run(snapPath);
  iso.close();
  check("INTEG: acceptance DB integrity_check ok", integ.length === 1 && integ[0].integrity_check === "ok");
  const restored = new Database(snapPath, { readonly: true });
  const rCount = restored.prepare("SELECT count(*) n FROM chunks").get() as { n: number };
  restored.close();
  fs.rmSync(snapPath);
  const liveCount = (await db.select().from(chunks).where(eq(chunks.userId, uid))).length;
  check("INTEG: snapshot restore drill preserves data", rCount.n === liveCount, `snapshot=${rCount.n} live=${liveCount}`);
  void dailyMissions;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nFAILURES:");
    for (const f of findings) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
