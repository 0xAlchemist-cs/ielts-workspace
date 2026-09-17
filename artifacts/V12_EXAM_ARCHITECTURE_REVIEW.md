# V12 Exam Architecture Review

Date: 2026-09-17 · Architecture release: one learning core, three exam goals — no engine forks, no fake CET features.

## Shipped

1. **ExamConfig** (`lib/exam-profiles.ts`) — the single declaration of per-goal differences (labels, CEFR layer, speaking coach, content classifier, engine-locked routes + `lockedRouteOwner()`). Replaced **12 scattered `exam === "ielts"` capability checks** across classify-route/external/library/settings/welcome/import-resource/prompts/sidebar/topbar/actions. Remaining string comparisons are display-equality choices, not capability gates.
2. **Exam visibility** — CET goals now named where it matters: Today's card ("Today's CET-4 practice 今日四级练习") and Library banner ("Adding to CET-4 当前加入：四级"); IELTS quiet (default goal). 
3. Bug found & fixed during E2E: the first cut of locked-route filtering hid IELTS's own engine entries (owner check inverted) — caught by the 15-step browser pass, fixed with `lockedRouteOwner` (owner shows, others hide).

## Test matrix (spec Phases 28-33) — `test:exam` extended 18 → **26 checks**

Config gates (only IELTS carries the three layers; locked routes only on IELTS) · **per-exam candidate pools** (same 3-content pool: IELTS selects IELTS's, CET-4 selects CET-4's, CET-6 selects CET-6's) · IELTS import inheritance (row tagged ielts) · **IELTS delete-all leaves CET-6 untouched** — plus all prior V8/V9/V10/V11 checks (switching/memory isolation, dedupe scoping, prompt honesty, CEFR layer, speaking tasks, planner projections, cross-profile).

## Browser E2E (15-step, no refresh) — `artifacts/v12-e2e/` (3 screenshots)

IELTS entries present → library shows Cambridge → switch CET-4 (entries gone immediately, library quiet + "CET-4" named, Today reads "CET-4 practice") → CET-6 named → back to IELTS (entries restored, label quiet). 14/14 assertions green. Production restored to IELTS after the pass.

## Regression

`verify:all` green (lint 0 errors · tsc · 14 suites incl. exam 26/26) · `verify:product` · `test:data` (3 known advisories) · `test:security` 3/3 · `build`. Data integrity: temp pools/imports cleaned (0 leftovers), seeded corpus 657 untouched.

## Final acceptance (spec)

1✓ first-class profiles 2✓ independent corpora (identity + content namespace) 3✓ independent contexts (config) 4✓ engines shared, zero forks 5✓ import respects exam 6✓ delete profile-safe (both directions tested) 7✓ missions per-exam (pool tests) 8✓ planner pool per-exam 9✓ memory per-exam (V11 + test:memory) 10✓ CEFR IELTS-specific 11✓ speaking IELTS-specific 12✓ CET inherits nothing IELTS 13✓ AI gets exam context (config longLabel) 14✓ switching immediate 15✓ everything intact 16✓ no fake CET features.
