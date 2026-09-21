/** Build a clean V16 release package (zip) from the git-tracked source.
 *  Excludes: .env.local, data/, node_modules/, .next/, dev caches, .git/
 *  Includes: source + configs + scripts + README + .env.local.example +
 *            eng.traineddata (OCR model, Apache 2.0) + audio download script
 *  Output: dist/ielts-workspace-v16.zip
 *  Usage: node scripts/build-release.mjs        (or: npm run release:build) */

import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const ZIP = join(DIST, "ielts-workspace-v16.zip");
const STAGE = join(DIST, "ielts-workspace-v16");

console.log("── V16 Release Packager ──────────────────────────────");

// 0) sanity: refuse to run with uncommitted changes (they'd be silently lost)
const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf-8" }).trim();
if (dirty) {
  console.error("✗ Working tree has uncommitted changes — commit or stash first:");
  console.error(dirty.split("\n").slice(0, 5).join("\n"));
  process.exit(1);
}

// 1) clean dist
execSync(`rm -rf "${DIST}"`, { cwd: ROOT });
mkdirSync(DIST, { recursive: true });
mkdirSync(STAGE, { recursive: true });

// 2) git archive → stage (clean tracked source, no .git history)
console.log("  exporting git-tracked source…");
execSync(`git archive HEAD | tar -x -C "${STAGE}"`, { cwd: ROOT, encoding: "utf-8" });

// 3) add non-tracked production assets
const extras = [
  { src: join(ROOT, "eng.traineddata"), dest: join(STAGE, "eng.traineddata"), label: "Tesseract OCR model" },
];
for (const { src, dest, label } of extras) {
  if (existsSync(src)) {
    execSync(`cp "${src}" "${dest}"`);
    const mb = (statSync(src).size / 1e6).toFixed(1);
    console.log(`  + ${label} (${mb}MB)`);
  } else {
    console.warn(`  ⚠ ${label} not found — skipping`);
  }
}

// 4) create the audio download script (Cambridge/vocab audio is 1.2GB,
//    copyrighted — the new user decides whether to download it)
const audioScript = `#!/usr/bin/env bash
# Download the Cambridge + vocabulary audio corpus (~1.2GB).
# This is OPTIONAL — the app works fully without it (listening labs simply
# won't have audio files to play). Audio is third-party educational material
# for personal use only.
#
# Source: user-provided local repos — ask the distributor for the audio archive,
# or skip this entirely and use the app with reading/writing/vocabulary only.

set -euo pipefail
echo "This script is a placeholder."
echo "The audio corpus (1.2GB) is distributed separately due to size/copyright."
echo "Place MP3 files under public/audio/ following the existing structure."
echo "See README.md for the full audio directory layout."
`;
writeFileSync(join(STAGE, "download-audio.sh"), audioScript, { mode: 0o755 });
console.log("  + download-audio.sh (audio is opt-in)");

// 5) create data/ skeleton (empty — new user's DB is created on first run)
mkdirSync(join(STAGE, "data"), { recursive: true });
console.log("  + data/ (empty — created on first run)");

// 6) zip it
console.log("  zipping…");
execSync(`cd "${DIST}" && zip -r -q ielts-workspace-v16.zip ielts-workspace-v16/`);
const size = (statSync(ZIP).size / 1e6).toFixed(1);
console.log(`\n✓ ${ZIP} (${size}MB)`);

// 7) verify: no secrets in the package
const zipContents = execSync(`unzip -l "${ZIP}"`, { encoding: "utf-8" });
const leaks = [".env.local\n", "app.db", "node_modules/", ".next/", "api_key", "sk-"];
const found = leaks.filter((l) => zipContents.toLowerCase().includes(l.split("\n")[0]));
if (found.length) {
  console.error(`\n✗ SECURITY: package contains excluded items: ${found.join(", ")}`);
  process.exit(1);
}
console.log("  ✓ secret scan clean (no .env.local, no app.db, no node_modules, no .next)");
console.log("\n── Done. Package ready for distribution. ─────────────");
