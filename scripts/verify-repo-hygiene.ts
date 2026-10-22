/* ── Step-12 regression: tool runtime state stays OUT of the git index ─────
 *
 * The Mimosa security scanner keeps per-session runtime state under
 * src/.mimosa/ (hook-state baselines, hook-status). .gitignore ignored the
 * directory, but 112 files were tracked BEFORE the rule existed and kept
 * being committed — tool state (session snapshots of candidate source)
 * riding along in every clone. Historical acceptance documents under
 * artifacts/ are the opposite category: audit history that must stay.
 *
 * Contract:
 *  H1 no file under src/.mimosa/ is tracked (runtime state out of the
 *     index; local files untouched — the scanner keeps working);
 *  H2 the artifacts/ audit archive remains tracked (no history loss);
 *  H3 .gitignore keeps the recurrence guard;
 *  H4 no .env / credentials file is tracked.
 *
 * Run: npx tsx scripts/verify-repo-hygiene.ts   */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lsFiles = (prefix: string) =>
  execFileSync("git", ["ls-files", prefix], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

let pass = 0;
let fail = 0;
const findings: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    findings.push(name);
  }
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const mimosa = lsFiles("src/.mimosa");
check("H1: no tool runtime state tracked under src/.mimosa/", mimosa.length === 0, `${mimosa.length} files still tracked`);

const artifacts = lsFiles("artifacts");
check("H2: historical acceptance documents remain tracked (≥60 files)", artifacts.length >= 60, `${artifacts.length} files`);

const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
check("H3: .gitignore keeps the src/.mimosa recurrence guard", /src\/\.mimosa|\.mimosa\//.test(gitignore));

const envish = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) =>
    (/^\.env/.test(f) || f.endsWith(".env") || /credentials|secret/i.test(f)) &&
    !f.endsWith(".example")); // .env.local.example is the documented template — kept on purpose
check("H4: no .env / credentials-named file is tracked", envish.length === 0, envish.join(","));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFAILURES:");
  for (const f of findings) console.log(`  ✗ ${f}`);
  process.exit(1);
}
process.exit(0);
