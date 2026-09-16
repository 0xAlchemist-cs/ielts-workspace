# V8 Exam Profile Plan

Date: 2026-09-16 · One product, three learning goals (IELTS / CET-4 / CET-6), independent corpora + learning memory.

## Architecture decision (the load-bearing one)

**Each exam profile owns its own `users` row.** `getCurrentUser()` resolves the active exam (from `app_config.activeExam`, default `"ielts"`) and returns THAT profile's user. Every per-user engine — retrieval queue, error bank, missions, progress, chunk events, vocab bank, saved expressions, listening profile — already keys on `userId`, so exam isolation is total with **zero engine changes**, and no `examProfile` column is needed on any learning-memory table.

| Layer | Isolation mechanism |
|---|---|
| Learning memory (retrieval/errors/missions/progress/vocab/chunks/events) | per-exam `users` row (new rows: CET-4, CET-6) |
| Corpus (`contents`, `imported_resources`) | new `exam_profile` column; every corpus query filters by the active exam; existing 657 rows default `"ielts"` (deterministic migration — nothing is ever auto-classified as CET) |
| Import | inherits the active exam at import time (`exam_profile` on the contents row + registry row) |
| Dedup | file-hash unique per (userId, hash) → already per-exam; text-fingerprint lookup gains `exam_profile` filter |
| Delete-all | deletes the active profile's registry + contents only — other profiles' users have different registry rows, and the seeded corpus has none |
| AI | prompt profile selected by active exam (`src/lib/ai/prompts/`) |
| IELTS-only engines (IELTS practice, Mock, Writing-lab flow, Mock paper) | navigation entries hidden outside IELTS mode — no pretending CET engines exist |

## Schema changes

- `users.exam_profile` text notNull default "ielts" (migration creates two sibling users "Learner (CET-4)" / "Learner (CET-6)" + default learning_profiles)
- `contents.exam_profile` text notNull default "ielts"
- `imported_resources.exam_profile` text notNull default "ielts"
- `app_config` gains key `activeExam` (no schema change; defaults to "ielts" when absent)

## Switching UX

- Topbar: `[ IELTS ▾ ]` always visible → menu: IELTS / CET-4 / CET-6. Feels like choosing a learning goal ("Current exam"), never a database.
- Switch = server action (update `app_config.activeExam`) + full client refresh — all pages are dynamic, so Today/Practice/Library/Progress reload against the new profile with zero stale content.
- Sidebar: IELTS / Mock exam / Writing entries render only in IELTS mode (those are IELTS-format engines; hiding beats faking CET variants).

## Query touch-points (complete list, to be filtered by active exam)

1. `library/page.tsx` contents list (+ admit-uploaded-audio rule keyed to same profile)
2. Homepage `recentContents` (Continue Learning)
3. `content-selection.ts` rotating-content queries (mission reading/listening picks)
4. `import-resource.ts` text-fingerprint duplicate lookup + insert (writes active exam)
5. `importContentAction` paste import (writes active exam)
6. `welcome/loop` material query (tour stays exam-agnostic but material should match)

## AI prompts

`src/lib/ai/prompts/`: `base.ts` (shared honesty + structure rules — never claim "definitely CET-4 vocabulary"; prefer "useful for CET-4-level learning"), `ielts.ts` (unchanged priorities), `cet4.ts` (practical high-frequency university English, reuse value over difficulty), `cet6.ts` (nuanced academic English, complex structures, precise meaning differences). Injected into: sentence analysis (`/api/ai/sentence`) + tutor context. Default output discipline: lead with a few things worth learning, full detail behind disclosure (existing labs already render this way — we enforce "3 things" on the analysis summary level).

## Font-size control

Topbar `Aa` control: 90 / 100 / 115 / 130 / 145%, applied as `body { zoom }` (the codebase sizes text in px classes, so rem scaling would be a no-op; zoom scales layout-correctly in every modern engine). Persisted in localStorage with a pre-paint restore script (same pattern as theme). Validated at 1440/1280/1024 for clipping/overflow across the five steps.

## Tests (`test:exam`, wired into verify:all)

Switching IELTS→CET4→CET6→IELTS resolves three distinct users; corpus isolation (contents per profile, no cross-leak); import inherits active exam (unit + fingerprint dedupe not blocking across exams); delete-all removes only the active profile; paste import tagged; prompt profile per exam; regression: existing suites untouched.

## Out of scope (deliberate)

No CET mock/practice engines (no question banks exist — the spec forbids pretending); no changes to IELTS engine behavior; no cross-profile sharing of vocab (spec mandates independent memory; switching profiles switches memory, which is the point).
