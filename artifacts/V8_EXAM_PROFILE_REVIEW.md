# V8 Exam Profile Review

Date: 2026-09-16 · One product, three learning goals (IELTS / CET-4 / CET-6).

## Architecture shipped

- **Isolation by identity**: each exam goal IS its own `users` row (`exam_profile` column; migration created `Learner (CET-4)` / `Learner (CET-6)` with empty memory namespaces). `getCurrentUser()` resolves `app_config.activeExam` → that profile's user. Every per-user engine (retrieval, errors, missions, progress, vocab, expressions) is isolated with zero engine changes — a missed filter can never leak because there is no filter.
- **Corpus namespacing**: `contents.exam_profile` + `imported_resources.exam_profile` (all pre-V8 rows = ielts, deterministically). Filtered at: mission content selection, Library, welcome-loop material. Text-fingerprint dedup is exam-scoped — the same article under CET-4 and IELTS is two goals' material, not a duplicate; the same file twice under one exam still dedupes.
- **Import inherits the active exam** (file, folder, paste paths all tagged).
- **Delete-all is profile-safe**: deletes only the active profile's registry/contents/files; test proves CET-6 imports and the seeded IELTS corpus are untouched after a CET-4 delete.
- **Topbar switcher**: `[ IELTS ▾ ]` always visible → IELTS / CET-4 / CET-6（四级/六级）. Switch = server action + refresh; feels like choosing a goal.
- **IELTS-only engines hidden outside IELTS** (Writing lab, IELTS practice, Mock) — no fake CET exam engines; Reading/Listening/Practice/Language/Mistakes/AI Lab work for every goal, fed by that goal's corpus. First CET version = corpus management + learning + retrieval + AI analysis + import, exactly as the spec scoped it.
- **AI prompt profiles** (`src/lib/ai/prompts/`): shared honesty rules (never claim "definitely CET-4 vocabulary" — inference phrasing only; lead with a few useful things, not walls) + per-exam priorities (CET-4: practical high-frequency reusable; CET-6: nuanced academic + complex structures as reusable patterns; IELTS: unchanged). Injected into coaching tasks (word/sentence/tutor/paraphrase/speaking/writing); grading/drilling tasks stay exam-neutral.
- **Global font size**: topbar `Aa 115%` control cycling 90/100/115/130/145%, applied via `body.zoom` (px-based text classes make rem scaling a no-op; zoom scales layout coherently), persisted in localStorage with a pre-paint restore script (same pattern as theme).

## Verification

- `test:exam` (new, 14 checks, wired into `verify:all`): three profiles resolve three distinct memories; round-trip switching; import + paste inheritance; cross-exam text NOT duplicate / same-file duplicate works; corpus disjointness; CET-4 delete-all leaves CET-6 + seeded corpus intact; prompt profiles distinct + honest.
- Full battery: `verify:all` (lint 0 errors · tsc · 9 suites incl. import 33/33 + exam 14/14) · `verify:product` ✓ · `test:data` ✓ · `test:security` 3/3 ✓ · `build` ✓.
- Browser (production): switcher IELTS→CET-4 (library shows no Cambridge content, empty state; sidebar hides IELTS/Mock/Writing, keeps Speaking/Language) → back to IELTS; font zoom cycles 100→115→130 with persistence, 145% @1024px has no horizontal scroll.

## Known edges (deliberate)

- A fresh CET profile starts with an empty library and empty practice — true by design; the guided import flow ("Bring your English materials") is the intended first move.
- Direct URL access to a hidden page (e.g. /ielts under CET mode) still works — navigation hides, nothing is blocked; IELTS engines remain reachable when the user switches back.
