/* ── Step-02 regression: served mode must equal graded mode must equal the
 * mode that advances the learning state ────────────────────────────────────
 *
 * Reproduces two integrity gaps in the review chain
 *   decideFormat → antiPatternMode → generateReviewQueue → POST /api/review/
 *   answer → submitRetentionReview → advanceState:
 *
 *  1. STATE ADVANCEMENT IGNORES THE SERVED FORMAT. The queue serves a format
 *     chosen by antiPatternMode rotation (e.g. "production" at attempt 0),
 *     but submitRetentionReview re-runs decideFormat() on the CURRENT state
 *     and advances with THAT format's stateAfterSuccess. A usage-state item
 *     served a plain production card therefore jumps straight to "transfer"
 *     on success — ordinary production masquerading as cross-context
 *     transfer. (Same bug family in /api/ai/writing: producing a chunk in an
 *     essay advances with decideFormat(usage)=context_transfer.)
 *  2. THE HTTP BOUNDARY TRUSTS THE CLIENT'S CLAIMED MODE. retention_check /
 *     context_transfer / audio_retrieval carry privileged semantics
 *     (interval escalation, delayed-recall credit, transfer advancement);
 *     any client can POST those modes without the server having served them.
 *
 * Runs on an ISOLATED database (data/test-fixtures/review-mode-test.db); the
 * production app.db is only opened READ-ONLY for schema DDL. All src imports
 * are dynamic and happen AFTER IELTS_DB_PATH is set.
 *
 * Run: npx tsx scripts/verify-review-mode-integrity.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "review-mode-test.db");
process.env.IELTS_DB_PATH = ISO_DB;

const DEFAULT_DB = path.join(ROOT, "data", "app.db");
if (!fs.existsSync(DEFAULT_DB)) {
  console.error("data/app.db not found — run `npm run db:push` first (CI does this before verify:all).");
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

async function main() {
  const { db } = await import("../src/db");
  const { users, learningProfiles, appConfig, chunks, retrievalItems, reviewHistory } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { generateReviewQueue, submitRetentionReview } = await import("../src/server/services/retention");
  const { POST: answerPost } = await import("../src/app/api/review/answer/route");

  // getCurrentUser resolves the FIRST user of the active exam with a profile
  // row — give our test user both so route handlers authenticate.
  const [u] = await db.insert(users).values({ name: "__mode_integrity__" }).returning({ id: users.id });
  const uid = u.id;
  await db.insert(learningProfiles).values({ userId: uid });
  await db.insert(appConfig).values({ key: "activeExam", value: "ielts" });

  const mkItem = async (opts: {
    text: string; state: string; successes?: number; fails?: number;
    productionHits?: number; contextualHits?: number; contextualMisses?: number;
    lastRetentionCheckAt?: number | null; interval?: number;
  }) => {
    const [c] = await db.insert(chunks).values({
      userId: uid, text: opts.text, meaningEn: `en:${opts.text}`, meaningZh: `zh:${opts.text}`,
      pattern: "pattern", examples: [`An example with ${opts.text} inside.`],
    }).returning({ id: chunks.id });
    const [it] = await db.insert(retrievalItems).values({
      userId: uid, itemType: "chunk", itemId: c.id,
      dueAt: Date.now() - 1000,
      successCount: opts.successes ?? 0, failCount: opts.fails ?? 0,
      learningState: {
        state: opts.state as never, achievedAt: {}, contexts: [],
        productionHits: opts.productionHits ?? 0, productionMisses: 0,
        contextualHits: opts.contextualHits ?? 0, contextualMisses: opts.contextualMisses ?? 0,
      },
      ...(opts.lastRetentionCheckAt !== undefined ? { lastRetentionCheckAt: opts.lastRetentionCheckAt } : {}),
      ...(opts.interval !== undefined ? { retentionCheckInterval: opts.interval } : {}),
    }).returning({ id: retrievalItems.id });
    return { chunkId: c.id, itemId: it.id };
  };
  const itemState = async (itemId: number) =>
    (await db.select().from(retrievalItems).where(eq(retrievalItems.id, itemId)).limit(1))[0];

  /* ── R1 · usage-state item served plain production must NOT reach transfer ──
   * chunk rotation[0] = "production" (0 prior attempts) while decideFormat
   * (usage) = context_transfer — the exact masquerade from the audit. */
  const r1 = await mkItem({ text: "as a result", state: "usage" });
  const q1 = await generateReviewQueue(uid, 30);
  const s1 = q1.find((x) => x.retrievalItemId === r1.itemId);
  check("R1: queue serves plain production for usage-state item (rotation)", s1?.mode === "production", `served=${s1?.mode}`);
  const g1 = await submitRetentionReview(uid, r1.itemId, s1?.mode ?? "production", "as a result");
  const st1 = await itemState(r1.itemId);
  check("R1: successful production keeps the item at usage (no fake transfer)",
    st1.learningState.state === "usage" && g1?.quality === 5,
    `state=${st1.learningState.state} q=${g1?.quality}`);
  check("R1: production evidence counted in the production bucket",
    (st1.learningState.productionHits ?? -1) === 1, `hits=${st1.learningState.productionHits}`);

  /* ── R2 · a genuinely served context_transfer DOES advance to transfer ──
   * retrieval-state item with 2 prior attempts → chunk rotation[2] =
   * "context_transfer". Old code advances with decideFormat(retrieval)=
   * production → usage, discarding real transfer evidence. */
  const r2 = await mkItem({ text: "crucial role", state: "retrieval", successes: 2, productionHits: 1 });
  const q2 = await generateReviewQueue(uid, 30);
  const s2 = q2.find((x) => x.retrievalItemId === r2.itemId);
  check("R2: queue serves context_transfer at rotation slot 2", s2?.mode === "context_transfer", `served=${s2?.mode}`);
  await submitRetentionReview(uid, r2.itemId, s2?.mode ?? "context_transfer", "crucial role");
  const st2 = await itemState(r2.itemId);
  check("R2: genuine served context_transfer advances to transfer",
    st2.learningState.state === "transfer", `state=${st2.learningState.state}`);

  /* ── R3 · cloze served → contextual bucket + usage (not production bucket) ── */
  const r3 = await mkItem({ text: "in the long run", state: "retrieval", successes: 1 });
  const q3 = await generateReviewQueue(uid, 30);
  const s3 = q3.find((x) => x.retrievalItemId === r3.itemId);
  check("R3: queue serves cloze at rotation slot 1", s3?.mode === "cloze", `served=${s3?.mode}`);
  await submitRetentionReview(uid, r3.itemId, s3?.mode ?? "cloze", "in the long run");
  const st3 = await itemState(r3.itemId);
  check("R3: cloze success counts in the contextual bucket",
    (st3.learningState.contextualHits ?? -1) === 1, `ctxHits=${st3.learningState.contextualHits}`);
  check("R3: cloze success advances to usage",
    st3.learningState.state === "usage", `state=${st3.learningState.state}`);

  /* ── R4 · failure demotion stays uniform (one level down, no mode games) ── */
  const r4 = await mkItem({ text: "without a second thought", state: "usage" });
  await submitRetentionReview(uid, r4.itemId, "production", "no idea");
  const st4 = await itemState(r4.itemId);
  check("R4: failed production demotes exactly one level (usage → retrieval)",
    st4.learningState.state === "retrieval", `state=${st4.learningState.state}`);

  /* ── R5 · error items keep their own ladder (production → retrieval) ── */
  const { addError } = await import("../src/server/services/bank");
  const err = await addError(uid, {
    category: "preposition", wrongForm: "interested on", correctForm: "interested in",
    sourceModule: "review", source: "manual",
  });
  const { and } = await import("drizzle-orm");
  const [errorRow] = await db.select().from(retrievalItems)
    .where(and(eq(retrievalItems.userId, uid), eq(retrievalItems.itemType, "error"), eq(retrievalItems.itemId, err.id)))
    .limit(1);
  check("R5: error has a retrieval item", errorRow != null);
  if (errorRow) {
    await submitRetentionReview(uid, errorRow.id, "production", "I am interested in music.");
    const st5 = await itemState(errorRow.id);
    check("R5: error production success lands on retrieval (error ladder), not usage",
      st5.learningState.state === "retrieval", `state=${st5.learningState.state}`);
  }

  /* ── R6 · HTTP: privileged modes without a served credential → 409 ──
   * retention_check escalates intervals and credits delayed recall; the
   * client must not be able to claim it out of thin air. */
  const r6 = await mkItem({ text: "a double-edged sword", state: "retention", successes: 3, lastRetentionCheckAt: Date.now() - 10 * 86_400_000, interval: 7 });
  const post = (body: unknown) =>
    answerPost(new Request("http://localhost/api/review/answer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
  const res6 = await post({ retrievalItemId: r6.itemId, mode: "retention_check", response: "a double-edged sword" });
  check("R6: uncredentialed retention_check claim rejected (409)", res6.status === 409, `status=${res6.status}`);
  const st6 = await itemState(r6.itemId);
  check("R6: rejected claim changed nothing (no success, no interval escalation)",
    st6.successCount === 3 && st6.retentionCheckInterval === 7, `ok=${st6.successCount} interval=${st6.retentionCheckInterval}`);

  /* ── R7 · HTTP: submitting a different mode than served → 409 ── */
  const r7 = await mkItem({ text: "a blessing in disguise", state: "usage" });
  const q7 = await generateReviewQueue(uid, 30);
  const s7 = q7.find((x) => x.retrievalItemId === r7.itemId);
  check("R7: queue served production for the item", s7?.mode === "production", `served=${s7?.mode}`);
  const res7 = await post({ retrievalItemId: r7.itemId, mode: "context_transfer", response: "a blessing in disguise" });
  check("R7: mode-swapped submission rejected (409)", res7.status === 409, `status=${res7.status}`);
  const st7 = await itemState(r7.itemId);
  check("R7: rejected swap did not advance the item",
    st7.learningState.state === "usage" && st7.successCount === 0, `state=${st7.learningState.state}`);

  /* ── R8 · HTTP: plain production without a credential stays allowed ──
   * (labs/welcome embed production cards outside the queue — compatibility) */
  const r8 = await mkItem({ text: "on the verge of", state: "retrieval" });
  const res8 = await post({ retrievalItemId: r8.itemId, mode: "production", response: "on the verge of" });
  const st8 = await itemState(r8.itemId);
  check("R8: uncredentialed production accepted (lab path, 200)", res8.status === 200, `status=${res8.status}`);
  check("R8: production success advances to usage only",
    st8.learningState.state === "usage", `state=${st8.learningState.state}`);

  /* ── R8b · a queued card with a DIFFERENT served format still accepts a
   * lab-style production submission: read/listen embeds must never be
   * locked out by a leftover queue credential, and production only ever
   * advances conservatively (→ usage). */
  const r8b = await mkItem({ text: "against all odds", state: "usage", successes: 1 });
  const q8b = await generateReviewQueue(uid, 30);
  const s8b = q8b.find((x) => x.retrievalItemId === r8b.itemId);
  check("R8b: queue served a non-production format for the item", s8b?.mode !== "production" && s8b != null, `served=${s8b?.mode}`);
  const res8b = await post({ retrievalItemId: r8b.itemId, mode: "production", response: "against all odds" });
  const st8b = await itemState(r8b.itemId);
  check("R8b: lab production over a cloze credential accepted (200)", res8b.status === 200, `status=${res8b.status}`);
  check("R8b: advanced conservatively to usage (not transfer)",
    st8b.learningState.state === "usage", `state=${st8b.learningState.state}`);

  /* ── R9 · HTTP: served retention_check through the real queue works ──
   * the guard must not break legitimate retention checks. */
  const q9 = await generateReviewQueue(uid, 30, "retention");
  const s9 = q9.find((x) => x.retrievalItemId === r6.itemId);
  check("R9: retention queue serves retention_check for the due item", s9?.mode === "retention_check", `served=${s9?.mode}`);
  const res9 = await post({ retrievalItemId: r6.itemId, mode: "retention_check", response: "a double-edged sword" });
  const st9 = await itemState(r6.itemId);
  check("R9: credentialed retention_check accepted (200)", res9.status === 200, `status=${res9.status}`);
  check("R9: interval escalated 7 → 30 on success",
    st9.retentionCheckInterval === 30 && st9.lastRetentionCheckAt != null,
    `interval=${st9.retentionCheckInterval}`);

  /* history integrity: every recorded row's mode matches what was graded */
  const hist = await db.select().from(reviewHistory).where(eq(reviewHistory.userId, uid));
  check("H: review history rows recorded with their graded modes",
    hist.length >= 5 && hist.every((h) => typeof h.mode === "string" && h.mode.length > 0), `rows=${hist.length}`);

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
