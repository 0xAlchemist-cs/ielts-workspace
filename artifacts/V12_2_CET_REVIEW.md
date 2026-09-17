# V12.2 CET Review

Date: 2026-09-18 · First real CET written-test layer — one shared engine, two exam configs, zero IELTS contamination.

## Shipped

| Piece | Detail |
|---|---|
| Official spec verified | `V12_2_CET_OFFICIAL_SPEC.md` — structure from cet.neea.edu.cn (2016-revision syllabus + 2026 schedule): 写作15% · 听力35% · 阅读35% · 翻译15%, sections are the engine's source of truth |
| Data model | `cet_tasks` (exam/section/source-classified, separate from ielts_tasks) + `cet_attempts` (real evidence rows) |
| Shared engine | `cet-engine.ts`: exam+section filtered loading, objective grading, attempt persistence, error banking with CET context |
| Fixtures | 8 synthetic tasks (`db:cetfixtures`) — 4 sections × 2 exams, CET-6 genuinely harder (longer passage, lecture vs conversation, longer translation), all labeled `synthetic_test`, UI shows "not an official exam question" |
| Practice shell `/cet` | CET-only route (nav hidden under IELTS): section cards with counts, Learning/Exam mode toggle, reading MCQ flow with wrong-item review, listening with learning-mode transcript, writing save, translation flow with reference-translation reveal |
| Readiness | CET branch aggregates real `cet_attempts` accuracy (≥3 tasks → on_track/needs_work by 70%/50% thresholds); "practice performance 非官方分数" on every number |
| Error Bank | wrong answers banked with exam+section context into the existing (per-profile) bank |
| Planner | readiness topGap now has real CET gaps to bias mission skill priority (V12.1 link, unchanged mechanics) |

## Honesty guarantees (tested)

- No official questions fabricated (fixtures `synthetic_test`; repo contains no official CET material — reported as the gap it is).
- No official score estimation anywhere — raw counts only, labeled in both languages.
- Exam mode has no transcripts/references/retry (UI constraints); learning mode has all three.

## Tests (`test:cet`, 23 checks, in `verify:all` — now **16 suites**)

Spec's 20-item matrix all green: loading/filtering/sections/source honesty/perfect+wrong grading/score language/translation/Error-Bank context/attempt records/readiness accuracy+no-official-claims/topGap/exam-mode parity/import+delete (test:exam)/switching/mutual CET isolation/IELTS untouched.

## Regression

`verify:all` green (lint 0 errors · tsc · 16 suites) · `verify:product` · `test:data` (3 known advisories) · `test:security` 3/3 · `build`.

## Browser E2E (`artifacts/v12.2-e2e/`, 4 screenshots)

CET-4 selected → `/cet` renders 4 sections + honesty copy → reading task completed (3/3, "practice performance 非官方分数") → translation submitted + reference revealed → switch CET-6 (`/cet` names 六级, harder fixtures) → back IELTS (nav restored, CET entry hidden). No refresh at any stage.

## Known limitations (honest)

- 1 fixture task per section per exam (engine supports unlimited; real material imports via the existing V7 pipeline land in the CET corpus, and future official/licensed banks slot in with their own `source` label).
- Writing/translation free-text is saved for review but AI practice assessment is not yet wired (existing writing AI infrastructure is IELTS-task-shaped; a CET-specific prompt profile is future work).
- No exam-mode timer (official total durations recorded in the spec; per-section timing is not officially broken out).
