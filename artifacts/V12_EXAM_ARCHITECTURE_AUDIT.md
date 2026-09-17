# V12 Exam Architecture Audit

Date: 2026-09-17 · Verified against the live tree (V8 identity isolation + V9 CEFR layer + V10/V11 shared engines).

## Current architecture (as built, not as designed)

| Layer | State |
|---|---|
| Exam profile | `ExamProfile` union + `users.exam_profile` + `app_config.activeExam`; `getCurrentUser()` resolves the active goal's user row — **isolation by identity** (V8). Single source of truth ✓ |
| Corpus | `contents.exam_profile` — seeded 657 rows all IELTS (deterministic); queries filter at content-selection, Library, welcome-loop. No cross-exam leakage (tested) |
| Import | inherits active exam at import time (`imported_resources.exam_profile`); fingerprint dedup is exam-scoped; delete-all per-profile |
| Learning core | Retrieval/Retention/Planner/Rotation/Mission/Memory all key on userId — automatically per-exam with **zero engine forks** ✓ |
| IELTS-specific | CEFR layer (welcome step, Settings card, classifier), Speaking prompt card, Writing/IELTS/Mock engine routes |
| CET-specific | nothing beyond isolation (by product decision — no fake engines) |

## Duplicates / risks found

1. **12 scattered `exam === "ielts"` checks** across 10 files (sidebar/topbar/settings/library/external/welcome/classify-route/import/prompts/actions) — the exact pattern Phase 26 warns about.
2. Nav route-locking was expressed as a per-item `ieltsOnly` boolean on two separate lists (sidebar MORE + topbar SECTION_MAP) — duplicated exam knowledge.
3. Exam visibility: CET goals showed no exam name anywhere — "What am I preparing for?" was only answerable from the topbar switcher.

## Schema/query/UI gaps

None for V12.0 scope: no new tables needed (derived memory, config-layer only); all corpus queries already filtered; the only UI gap is exam-name visibility (fixed here).

## Fixes applied in this release

- **`ExamConfig`** in `lib/exam-profiles.ts`: the single declaration of what differs per goal — `label/zh/longLabel`, `hasCefrLayer`, `hasSpeakingCoach`, `hasContentClassifier`, `examLockedRoutes` — plus `lockedRouteOwner(path)` (which exam owns a locked engine route). All 12 scattered checks replaced (remaining `===` uses are data-equality display choices, not capability gates; `tutor` route's `mode === "ielts"` is a task-mode string, unrelated).
- **Exam visibility**: CET goals now say their name where it matters — Today's practice card ("Today's CET-4 practice 今日四级练习") and the Library banner ("Adding to CET-4 当前加入：四级"). IELTS stays quiet (default goal doesn't shout).
