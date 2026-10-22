/* ── Step-11 regression: server-actions module split keeps the API contract ──
 *
 * src/app/actions.ts (~850 lines, 33 exports) is modularized by domain into
 * src/app/actions/{profile,learning,import,bank,attempts,ai-settings}.ts.
 * The original module stays as a thin re-export layer so EVERY existing
 * import (UI components, scripts, tests) keeps working unchanged.
 *
 * This suite locks the contract BEFORE and AFTER the move:
 *  A1 the export surface is exactly the expected 33 names — no lost or
 *     renamed actions;
 *  A2 every export is an async function (a valid server action shape);
 *  A3 the split modules individually export their domain slice and every
 *     original name resolves to the SAME function object through the
 *     compatibility layer (no accidental duplicates);
 *  A4 behavior spot-checks on an isolated DB: unauthenticated calls are
 *     silent no-ops returning safe defaults (permission contract), and a
 *     real call persists data as before.
 *
 * Runs on an ISOLATED database; production app.db only opened READ-ONLY.
 *
 * Run: npx tsx scripts/verify-actions-contract.ts   */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const ISO_DB = path.join(ROOT, "data", "test-fixtures", "actions-contract-test.db");
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

const EXPECTED = [
  // profile
  "setExamProfileAction", "setImmersionLevelAction", "setDailyMinutesAction",
  "setLearningLevelAction", "setTargetBandAction", "quickStartAction",
  "onboardAction", "updateProfileAction",
  // learning events / mission
  "recordExposureAction", "markStepAction", "toggleLiteAction", "logEventAction",
  "logExternalSessionAction", "getExternalSessionsAction", "registerPatternAction",
  "saveMissAction", "saveShadowAction", "attachTranscriptAction",
  // content import
  "assessDifficultyAction", "importContentAction",
  // bank
  "saveCorpusChunkAction", "saveCustomChunkAction", "saveVocabAction",
  "saveSentenceAction", "addErrorAction", "toggleErrorAction",
  // attempts
  "saveWritingAction", "saveWritingRevisionAction", "saveSpeakingAction",
  // AI settings
  "saveAIProviderConfigAction", "clearAIProviderConfigAction",
  "addWordTargetAction", "testAIProviderConfigAction",
] as const;

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
  /* ── A1 · the export surface is exactly the expected contract ── */
  const actionsApi = await import("../src/app/actions");
  const exported = Object.keys(actionsApi).sort();
  const expected: string[] = [...EXPECTED].sort();
  check("A1: export surface matches the 33-action contract exactly",
    JSON.stringify(exported) === JSON.stringify(expected),
    exported.length === expected.length
      ? `diff: ${exported.filter((k) => !expected.includes(k)).concat(expected.filter((k) => !exported.includes(k))).join(",")}`
      : `got ${exported.length}, want ${expected.length}`);

  /* ── A2 · every export is an async function (server-action shape) ── */
  const nonAsync = EXPECTED.filter((k) => {
    const fn = (actionsApi as Record<string, unknown>)[k];
    return typeof fn !== "function" || fn.constructor?.name !== "AsyncFunction";
  });
  check("A2: all exports are async functions", nonAsync.length === 0, nonAsync.join(","));

  /* ── A3 · split modules exist and the compat layer forwards identity ── */
  const domains: Record<string, string[]> = {
    profile: ["setExamProfileAction", "updateProfileAction", "quickStartAction"],
    learning: ["markStepAction", "toggleLiteAction", "logExternalSessionAction"],
    import: ["importContentAction", "assessDifficultyAction"],
    bank: ["saveVocabAction", "addErrorAction", "saveCustomChunkAction"],
    attempts: ["saveWritingAction", "saveSpeakingAction"],
    "ai-settings": ["saveAIProviderConfigAction", "testAIProviderConfigAction"],
  };
  const splitMissing: string[] = [];
  const identityBroken: string[] = [];
  for (const [domain, names] of Object.entries(domains)) {
    let mod: Record<string, unknown> | null = null;
    try {
      mod = (await import(`../src/app/actions/${domain}`)) as Record<string, unknown>;
    } catch {
      mod = null;
    }
    if (!mod) {
      splitMissing.push(domain);
      continue;
    }
    for (const n of names) {
      if (mod[n] !== (actionsApi as Record<string, unknown>)[n]) identityBroken.push(`${domain}/${n}`);
    }
  }
  check("A3: all six domain modules exist (src/app/actions/<domain>.ts)",
    splitMissing.length === 0, `missing: ${splitMissing.join(",")}`);
  check("A3: the compat layer forwards the SAME function objects (no duplicates)",
    identityBroken.length === 0, identityBroken.join(","));

  /* ── A4 · behavior spot-checks (isolated DB) ── */
  const { db } = await import("../src/db");
  const { users, learningProfiles, appConfig, errors } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.insert(appConfig).values({ key: "activeExam", value: "ielts" });

  // unauthenticated calls are silent no-ops (permission contract)
  const beforeUsers = await db.select().from(users);
  await (actionsApi as unknown as Record<string, (n: number) => Promise<unknown>>).markStepAction(999);
  await (actionsApi as unknown as Record<string, (i: { category: string; wrongForm: string; correctForm: string }) => Promise<unknown>>).addErrorAction({ category: "grammar", wrongForm: "a b", correctForm: "a c" });
  const afterUsers = await db.select().from(users);
  check("A4: unauthenticated mutations create no rows (silent no-op)",
    beforeUsers.length === afterUsers.length && (await db.select().from(errors)).length === 0);
  const sessions = await (actionsApi as unknown as Record<string, () => Promise<unknown>>).getExternalSessionsAction();
  check("A4: unauthenticated reads return safe defaults", sessions != null, `got ${JSON.stringify(sessions)?.slice(0, 40)}`);

  // an authenticated call persists as before
  const [u] = await db.insert(users).values({ name: "__contract__" }).returning({ id: users.id });
  await db.insert(learningProfiles).values({ userId: u.id });
  const saved = await (actionsApi as unknown as Record<string, (w: string, c?: string) => Promise<void>>).saveVocabAction("persuade", "He persuaded me.");
  void saved;
  const { vocabularies } = await import("../src/db/schema");
  const words = await db.select().from(vocabularies).where(eq(vocabularies.userId, u.id));
  check("A4: authenticated saveVocabAction persists through the split module",
    words.length === 1 && words[0].headword === "persuade",
    `words=${words.length}`);

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
