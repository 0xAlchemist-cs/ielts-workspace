# V16 Release Package — Verification Report

Date: 2026-09-22 · Package: dist/ielts-workspace-v16.zip (5.6MB)

## Package contents (436 files)

Git-tracked source (433) + eng.traineddata (5.2MB, Apache 2.0) +
download-audio.sh (placeholder) + data/ (empty skeleton).

## Exclusions verified

| Item | Status |
|---|---|
| .env.local (real API key) | ✓ absent |
| data/app.db (33.6MB production DB) | ✓ absent |
| data/*.backup | ✓ absent |
| node_modules/ | ✓ absent |
| .next/ (build cache) | ✓ absent |
| public/audio/ (1.2GB copyrighted) | ✓ absent (download-audio.sh placeholder) |
| .mimosa/ / .playwright-mcp/ | ✓ absent |
| tsconfig.tsbuildinfo | ✓ absent |

Built-in secret scan: exact filenames + real key shapes (sk-xxx 30+ chars,
fc-xxx 25+ chars) → **clean**.

## Fresh-install verification (Windows, desktop path)

```text
unzip → npm ci --ignore-scripts → copy prebuilt win32-x64.node →
npm run db:push → npm run db:seed → npm run build → npx next start -p 3001
```

| Step | Result |
|---|---|
| npm ci --ignore-scripts | ✓ (all JS deps) |
| better-sqlite3 prebuilt | ✓ loads (journal_mode = WAL) |
| db:push | ✓ schema created |
| db:seed | ✓ 29 corpus chunks, 8 network words, 15 relations |
| build | ✓ (Next.js 16.3.4, clean) |
| start (port 3001) | ✓ ready in 920ms |
| / → redirect | ✓ → /welcome (fresh user onboarding) |
| /welcome /settings /library /chunks /review | ✓ all 200 |
| DB contents | users: 0, contents: 10 (seed), chunks: 29 (seed), app_config: 0 (no key) |

**A brand-new user sees the welcome flow, has zero personal data, and the
app runs on a completely independent database.**

## Known friction: better-sqlite3 on Windows

`npm ci` triggers node-gyp compilation for better-sqlite3 because
prebuild-install can't reach GitHub releases (GFW). Two workarounds:

1. **With network access to GitHub**: standard `npm ci` (prebuild downloads)
2. **Without GitHub access**: `npm ci --ignore-scripts` then manually place
   `prebuilds/win32-x64.node` (documented in README)

This is an ecosystem issue (node-gyp needs Python + VS Build Tools on
Windows), not a product defect. The prebuilt binary works perfectly.

## Distribution notes

- **Audio corpus (1.2GB)**: NOT included — copyrighted Cambridge/educational
  material, personal-use only. App fully functional without it (reading,
  writing, vocabulary, grammar, review). Audio labs degrade gracefully.
  `download-audio.sh` documents the opt-in path.
- **AI provider**: new user configures their own key via Settings UI or
  `.env.local` (template in `.env.local.example`). Without a key the app
  runs in offline Mock mode — fully functional, template-grade feedback.
- **ECDICT dictionary (66MB)**: not included. Run
  `curl -L -o data/ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv`
  then `npm run db:dict` for dictionary lookups.
