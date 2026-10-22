/* ── Step-05 regression: full-text fingerprint — same prefix, different
 * endings must coexist ──────────────────────────────────────────────────────
 *
 * contentFingerprint hashed only the FIRST 2000 normalized chars, so two
 * articles sharing a 2000-char prefix but differing at the end collided:
 * the second import was silently reported as a "duplicate" of the first and
 * its distinct body never entered the library.
 *
 * Fix: hash the FULL normalized body. Historical rows still carry legacy
 * (prefix) fingerprints — dedup lookups read BOTH (dual-read): a re-import
 * of pre-fix material still resolves to the old row, no backfill needed,
 * reversible by reverting this file.
 *
 * Runs on an ISOLATED database; production app.db only opened READ-ONLY.
 *
 * Run: npx tsx scripts/verify-fulltext-fingerprint.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "fingerprint-test.db");
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
// ≥ 2000 normalized chars shared, then diverging endings
const sharedPrefix = ("The history of urban planning reveals a persistent tension. ".repeat(60)).slice(0, 2400);
const articleA = sharedPrefix + " In conclusion, cities must prioritize green space above all else.";
const articleB = sharedPrefix + " In conclusion, public transport remains the decisive factor.";

async function main() {
  const { db } = await import("../src/db");
  const { users, learningProfiles, appConfig, contents } = await import("../src/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { importContentAction } = await import("../src/app/actions");
  const { importFile, deleteAllImports } = await import("../src/server/services/import-resource");
  const { contentFingerprint } = await import("../src/server/services/content-selection");

  const [u] = await db.insert(users).values({ name: "__fingerprint__" }).returning({ id: users.id });
  const uid = u.id;
  await db.insert(learningProfiles).values({ userId: uid });
  await db.insert(appConfig).values({ key: "activeExam", value: "ielts" });

  /* ── F1 · same 2000-char prefix, different endings → both live ── */
  const a = await importContentAction({ text: articleA, title: "Prefix article A" });
  const b = await importContentAction({ text: articleB, title: "Prefix article B" });
  check("F1: first import created content", a.ok === true && a.duplicate !== true, JSON.stringify(a).slice(0, 80));
  check("F1: second (same prefix, different ending) is NOT a duplicate",
    b.ok === true && b.duplicate !== true && b.id !== a.id, `ok=${b.ok} dup=${(b as { duplicate?: boolean }).duplicate}`);
  const rowsA = await db.select().from(contents).where(eq(contents.examProfile, "ielts"));
  const bodies = rowsA.filter((c) => c.body.includes("In conclusion"));
  check("F1: both distinct bodies exist in the library", bodies.length === 2, `rows=${bodies.length}`);

  /* ── F2 · whitespace/case variants of the SAME text still dedupe ── */
  const messy = articleA.toUpperCase().replace(/ /g, "   \n\t ") + "  ";
  const c = await importContentAction({ text: messy, title: "Same text, messy" });
  check("F2: case/whitespace variant resolves to the original (duplicate)",
    c.ok === true && c.duplicate === true && c.id === a.id, `dup=${(c as { duplicate?: boolean }).duplicate} id=${(c as { id?: number }).id}`);

  /* ── F3 · identical text in ANOTHER exam's corpus is not a duplicate ── */
  const [u4] = await db.insert(users).values({ name: "__fingerprint_cet__", examProfile: "cet4" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u4.id });
  await db.update(appConfig).set({ value: "cet4" }).where(eq(appConfig.key, "activeExam"));
  const d = await importContentAction({ text: articleA, title: "Same text, other exam" });
  const cetRows = await db.select().from(contents).where(eq(contents.examProfile, "cet4"));
  check("F3: same body in the CET corpus is its own material (no duplicate)",
    d.ok === true && d.duplicate !== true && cetRows.length === 1, `ok=${d.ok} cetRows=${cetRows.length}`);
  await db.update(appConfig).set({ value: "ielts" }).where(eq(appConfig.key, "activeExam"));

  /* ── F4 · file import dedupes by text fingerprint (and repeat import) ── */
  const fileBody = ("Renewable energy policy differs sharply across regions. ".repeat(80)) +
    " Solar leads in one region; wind dominates another.";
  const mkTxt = (text: string, name: string) => ({ fileName: name, buf: Buffer.from(text, "utf-8") });
  const f1 = await importFile(uid, mkTxt(fileBody, "energy.txt"));
  check("F4: file import created ready content", f1.ok === true && f1.status === "ready", `${f1.status} ${f1.error ?? ""}`);
  const f2 = await importFile(uid, mkTxt(fileBody, "energy-copy.txt"));
  check("F4: re-import of the same text is a duplicate pointing at the content",
    f2.ok === true && f2.status === "duplicate" && f2.contentId === f1.contentId, `status=${f2.status}`);

  /* ── F5 · ownership: deleting imports never removes referenced content ── */
  // paste-created content + a file import that merely REFERENCES it
  const pasted = await importContentAction({
    text: ("Language transfer research shows remarkable patterns. ".repeat(90)) + " Conclusion follows here.",
    title: "Pasted original",
  });
  const pastedBody = (await db.select().from(contents).where(eq(contents.id, (pasted as { id: number }).id)).limit(1))[0].body;
  const ref = await importFile(uid, mkTxt(pastedBody, "pasted-copy.txt"));
  check("F5: file import referencing pasted content is a duplicate (ownsContent false)",
    ref.status === "duplicate" && ref.contentId === (pasted as { id: number }).id, `status=${ref.status}`);
  await deleteAllImports(uid);
  const survivor = await db.select().from(contents).where(eq(contents.id, (pasted as { id: number }).id)).limit(1);
  check("F5: pasted original survives import deletion (ownership respected)",
    survivor.length === 1 && survivor[0].body === pastedBody);
  const importedOnes = await db.select().from(contents).where(and(eq(contents.examProfile, "ielts"), eq(contents.type, "reading")));
  check("F5: import-CREATED contents were removed by the same delete",
    !importedOnes.some((c) => c.body === fileBody));

  /* ── F6 · legacy-prefix rows still dedupe (dual-read) ──
   * A row written before the fix carries the OLD fingerprint (hash of the
   * first 2000 normalized chars). Re-importing that exact text must still
   * resolve to the legacy row. */
  const legacyBody = (" Maritime trade shaped the modern economy in countless ways. ".repeat(80)) +
    " The final chapter discusses containerization.";
  const legacyFp = contentFingerprint(legacyBody); // = new full-text hash after the fix
  // emulate the pre-fix writer: hash only the first 2000 normalized chars
  const { createHash } = await import("node:crypto");
  const legacyPrefixHash = createHash("sha256")
    .update(legacyBody.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 2000))
    .digest("hex");
  const [legacyRow] = await db.insert(contents).values({
    type: "reading", title: "Legacy row (pre-fix fingerprint)", topic: "imported", cefr: "B2",
    body: legacyBody, fingerprint: legacyPrefixHash, examProfile: "ielts",
  }).returning({ id: contents.id });
  void legacyFp;
  const g = await importContentAction({ text: legacyBody, title: "Re-import of legacy material" });
  check("F6: re-import of a legacy-fingerprint row resolves to it (dual-read)",
    g.ok === true && g.duplicate === true && g.id === legacyRow.id,
    `ok=${g.ok} dup=${(g as { duplicate?: boolean }).duplicate} id=${(g as { id?: number }).id} want=${legacyRow.id}`);
  // and a same-prefix-different-ending variant must NOT match the legacy row
  const legacyVariant = legacyBody.slice(0, 2200) + " A different ending entirely.";
  const h = await importContentAction({ text: legacyVariant, title: "Prefix variant of legacy" });
  check("F6: prefix variant of a legacy row is NOT swallowed by it",
    h.ok === true && h.duplicate !== true && h.id !== legacyRow.id, `dup=${(h as { duplicate?: boolean }).duplicate}`);

  /* ── F7 · same-prefix pair never shares a fingerprint value ── */
  const fpA = contentFingerprint(articleA);
  const fpB = contentFingerprint(articleB);
  check("F7: distinct endings produce distinct full-text fingerprints", fpA !== fpB);
  const dupeFp = contentFingerprint(messy);
  check("F7: normalized variants produce identical fingerprints", dupeFp === fpA);

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
