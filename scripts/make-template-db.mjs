// Builds setup/app-template.db for the standalone distribution:
// a consistent snapshot of the production corpus with ALL personal data and
// AI credentials removed. The production database is opened read-only —
// this script never writes to it.
//
//   node scripts/make-template-db.mjs <destPath>
//
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dest = process.argv[2];
if (!dest) {
  console.error("usage: node scripts/make-template-db.mjs <destPath>");
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data", "app.db");

fs.mkdirSync(path.dirname(dest), { recursive: true });
for (const p of [dest, `${dest}-wal`, `${dest}-shm`]) {
  if (fs.existsSync(p)) fs.rmSync(p);
}

const CORPUS_KEEP = [
  "contents",
  "sentences",
  "listening_clips",
  "vocabularies",
  "dictionary",
  "word_lemmas",
  "lexical_relations",
  "grammar_patterns",
  "ielts_tasks",
  "cet_tasks",
];

const PERSONAL_WIPE = [
  "users",
  "learning_profiles",
  "chunk_events",
  "content_history",
  "daily_missions",
  "errors",
  "retrieval_items",
  "review_history",
  "user_progress",
  "user_sentences",
  "ielts_skill_profiles",
  "ielts_attempts",
  "ielts_results",
  "writing_attempts",
  "speaking_attempts",
  "shadow_attempts",
  "listening_misses",
  "learning_snapshots",
  "progress_events",
  "learning_sessions",
  "external_sessions",
  "wrong_practice_log",
  "cet_attempts",
  "cet_exam_sessions",
  "imported_resources",
  "ieltscb_imports",
];

const src = new Database(SRC, { readonly: true });
src.pragma("wal_checkpoint(TRUNCATE)"); // snapshot includes everything committed
src.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`);
src.close();

const tpl = new Database(dest);
const before = {};
for (const t of [...CORPUS_KEEP, ...PERSONAL_WIPE]) {
  before[t] = tpl.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
}

const wipe = tpl.transaction(() => {
  for (const t of PERSONAL_WIPE) tpl.prepare(`DELETE FROM ${t}`).run();
  // user-saved chunks go; seed-library chunks (user_id IS NULL) stay
  tpl.prepare("DELETE FROM chunks WHERE user_id IS NOT NULL").run();
  // keep only the exam selector — never ship ai_base_url/ai_api_key/ai_model
  tpl.prepare("DELETE FROM app_config WHERE key <> 'activeExam'").run();
  tpl.prepare("UPDATE app_config SET value = 'ielts' WHERE key = 'activeExam'").run();
});
wipe();
tpl.pragma("wal_checkpoint(TRUNCATE)");
tpl.close();

// verify: no personal rows, no ai_* keys, corpus intact
const check = new Database(dest, { readonly: true });
const problems = [];
for (const t of PERSONAL_WIPE) {
  const c = check.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  if (c !== 0) problems.push(`${t} still has ${c} rows`);
}
for (const t of CORPUS_KEEP) {
  const c = check.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  if (c !== before[t]) problems.push(`${t} shrank ${before[t]} -> ${c}`);
}
const userChunks = check
  .prepare("SELECT COUNT(*) c FROM chunks WHERE user_id IS NOT NULL")
  .get().c;
if (userChunks !== 0) problems.push(`chunks: ${userChunks} user rows remain`);
const secretKeys = check
  .prepare("SELECT key FROM app_config WHERE key LIKE 'ai_%'")
  .all()
  .map((r) => r.key);
if (secretKeys.length) problems.push(`app_config leaks: ${secretKeys.join(", ")}`);
check.close();

if (problems.length) {
  console.error("TEMPLATE DB FAILED VERIFICATION:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(
  `template db OK -> ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)\n` +
    `  kept: ${CORPUS_KEEP.map((t) => `${t}=${before[t]}`).join(", ")}\n` +
    `  wiped: ${PERSONAL_WIPE.length} personal tables + user chunks + ai_* config`,
);
