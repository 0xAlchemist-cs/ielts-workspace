# V10.1 Validation

## Issue 1 — Learning Need Recommendation

Status: **PASS**

Evidence: controlled experiment on isolated temp users with a self-built candidate pool (`artifacts/V10_1_LEARNING_NEED_EXPERIMENT.md`, suite `npm run test:need`, 7/7, wired into `verify:all`).

- **Baseline (before)**: same-CEFR learners with different weaknesses produced IDENTICAL rankings (all 0.77) — learning need had zero behavioural effect; the only weakness signal was chunk *provenance*, which never applies to a different article. Gap confirmed, not assumed.
- **Mechanism (smallest possible)**: the existing `itemValue` factor (weight 0.1, unchanged) now takes `max(provenance, need-overlap)` — need-overlap counts the learner's mid-ladder chunk texts and active-error correct forms (≥4 chars) occurring in the candidate's body (normalised at 3 hits). No new engine, no new weight, no hard "matching weakness always wins".
- Experiment A (same B1, reason-weak vs comparison-weak): rankings flip exactly with the weakness (0.837 vs 0.770 in both directions).
- Experiment B (preposition vs article recurring error): the error-relevant article wins for each learner (+0.033).
- Experiment C (level + need, 5 candidates): B1-relevant 0.803 > B1-unrelated 0.770; B2-relevant 0.723 survives as controlled challenge above A2 0.690; C1 0.653 stays penalised — need never overrides level sanity.
- Experiment D (remove the need): advantage collapses +0.067 → +0.000.
- Explainability: every pick's reason states the counted in-text hits ("contains 2 expressions you're currently weak on") — evidence-backed, never fabricated.

## Issue 2 — Exam Switching UX

Status: **FIXED**

Reproduction (real browser, no refresh at any stage): sidebar/topbar/labels/data updated correctly on all four switches (IELTS→CET-4→CET-6→IELTS) — the report's "stale sidebar" observation was **not reproducible** in the current build (V8's layout-level revalidation already covers the shell). The genuinely stale surface found: **sitting inside an IELTS article and switching exam left the old exam's content on screen** (direct-link access is deliberate, but the visible context lingered).

Fix (smallest scope, in `Topbar.switchExam`): after the profile action resolves, context pages of the old exam (`/read/* /listen/* /ielts/* /writing/*`) navigate to Today — the navigation itself pulls the fresh tree for the new exam; shell pages (settings/profile/etc.) refresh in place. The initial `refresh()+push()` combination raced (refresh could swallow the pending push) — made the branches mutually exclusive. No full-page reload, no duplicated state store, no data reset (CEFR/history/queue/progress all live per-profile and were untouched).

Browser evidence (`artifacts/v10.1-e2e/`): `cet4-after-switch.png` (switched from inside an article: lands on Today, IELTS-only nav gone), `ielts-restored.png` (back to IELTS: entries restored). Assertions: read→CET-4 url `/` + nav clean ✓; →IELTS switcher/entries restored ✓; CET-4→CET-6→IELTS loop all immediate ✓.

## Regression

- verify:all: **green** (lint 0 errors · tsc · 12 suites: smoke/pm/engine/rotation/loop/writing-gate/input-gates/import 33/exam 18/planner 18/need 7/v9v10)
- verify:product: **green**
- test:data: **OK** (3 advisory — pre-existing historical notes)
- test:security: **3/3 pass**
- build: **pass** (production running)

## Data Integrity

Production data untouched: **YES** (experiments used temp users `__need_*` + self-built `topic='experiment'` contents)
Test data cleaned: **YES** (0 leftover test users, 0 leftover test contents; seeded corpus count unchanged at 657; no delete-all run against the real db)

## Final Verdict

V10.1: **PASS**
