# V16 Release Audit — Project Structure

Date: 2026-09-22 · Purpose: determine what ships in the standalone release
package vs what stays local-only.

## Audit table

| Item | Purpose | Production required? | Safe to distribute? | Reason |
|---|---|---|---|---|
| **src/** (277 files) | Application source code | ✅ YES | ✅ YES | The product |
| **scripts/** (69 files) | Importers, verify suites, CI gate | ✅ YES (verify) / optional (importers) | ✅ YES | All self-cleaning; importers are idempotent and opt-in |
| **package.json + package-lock.json** | Dependencies | ✅ YES | ✅ YES | `npm ci` needs both |
| **tsconfig.json / next.config.ts / eslint.config.mjs / postcss.config.mjs** | Build configs | ✅ YES | ✅ YES | Required to build |
| **drizzle.config.ts** | DB schema push config | ✅ YES | ✅ YES | First-run needs `npm run db:push` |
| **.gitignore** | Version control hygiene | ✅ YES | ✅ YES | — |
| **.githooks/pre-push** | CI gate hook | ✅ YES | ✅ YES | Quality assurance |
| **README.md** | Documentation | ✅ YES | ✅ YES | Install + usage instructions |
| **AGENTS.md / CLAUDE.md** | AI agent instructions | Optional | ✅ YES | Developer docs, no secrets |
| **.env.local.example** | Template for AI config | ✅ YES | ✅ YES | Contains only placeholder values, no real keys |
| **docs/** | Design docs | Optional | ✅ YES | — |
| **artifacts/** (1.9MB) | Audit reports, simulations, screenshots | Optional | ✅ YES | All markdown/PNG, no user data |
| **public/ (5 SVGs)** | UI icons | ✅ YES | ✅ YES | Static assets |
| **public/audio/ (1.2GB)** | Cambridge + vocab + 179 audio | ✅ YES for full experience | ⚠️ EXCLUDE from source package | Copyrighted third-party audio — distribute separately or via download script |
| **eng.traineddata (5.2MB)** | Tesseract OCR English model | ✅ YES (import OCR) | ✅ YES | Open source (Apache 2.0) |
| | | | | |
| **❌ .env.local** | Real FIRECRAWL_API_KEY | NO | **❌ NEVER** | Contains a live API key |
| **❌ data/app.db** (33.6MB) | Production SQLite | NO | **❌ NEVER** | Contains real user learning data, AI API key (app_config), all evidence |
| **❌ data/app.db-shm / -wal** | SQLite WAL files | NO | **❌ NEVER** | May contain recent uncheckpointed data |
| **❌ data/app.db.backup-*** | Manual backups | NO | **❌ NEVER** | Historical production data |
| **❌ data/ (all subdirs, 241MB total)** | Corpus banks, staging, fixtures | NO (regenerable via importers) | **❌ EXCLUDE** | Source data for importers; new user regenerates their own |
| **❌ node_modules/** (~500MB) | Dependencies | NO (npm ci regenerates) | **❌ EXCLUDE** | Platform-specific binaries |
| **❌ .next/ (119MB)** | Build output | NO (npm run build) | **❌ EXCLUDE** | Regenerable; contains compiled code with potential data remnants |
| **❌ .mimosa/ / .playwright-mcp/** | Dev tooling artifacts | NO | **❌ EXCLUDE** | Local development only |
| **❌ tsconfig.tsbuildinfo / next-env.d.ts** | TS incremental cache | NO | **❌ EXCLUDE** | Build artifacts |
| **❌ .git/** | Version history | NO | **❌ EXCLUDE** | Contains full history; git archive handles this |

## Key findings

1. **app_config contains the real AI API key** — the #1 reason `data/app.db` must never ship. New users configure their own key via Settings UI or .env.local.
2. **public/audio is 1.2GB** of copyrighted Cambridge/educational audio — too large for a source package and legally sensitive. The release should note it's optional (app works without it; listening labs degrade gracefully) or provide a separate download path.
3. **eng.traineddata (5.2MB)** is needed for the OCR import path — Apache 2.0 licensed, safe to include.
4. **All corpus data is regenerable**: new users run `npm run db:seed` (core corpus) and optionally `db:dict` (ECDICT), `db:vocab`, etc. for the full experience.
5. **Git-tracked surface = 433 files, ~1MB** — this is the clean source. `git archive` produces exactly this.

## Release package contents (what we'll ship)

From `git archive HEAD` (433 files, ~1MB) + `eng.traineddata` (5.2MB) +
optional `public/audio` download script. Everything else is regenerable or excluded.
