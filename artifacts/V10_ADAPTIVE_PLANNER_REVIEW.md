# V10 Adaptive Planner Review

Date: 2026-09-17 · One quiet planner layer above existing engines — no second review engine, no rebuilt scheduler, no new tables.

## Architecture shipped

| Piece | What it does |
|---|---|
| `planner.ts` (pure core) | `allocateBudget(dailyMinutes, pressure)` → review/new/transfer minute split + review-count cap (3–24) + balance mode (`new-heavy / balanced / review-heavy / rescue`) with a bilingual data-backed why-line; `projectTomorrow()` → deterministic two-scenario preview (all-success vs slipped-today, because failures schedule to tomorrow by the engine's interval=1 rule); missed-day (≥3d) → rescue mode: small highest-value subset, welcoming tone, no guilt. |
| Pressure input | `readMemoryPressure()` reads real evidence only: due count, forgetting-detected count, failed retrievals (7d), days since last study. |
| Mission consumption | `generateTodayMission` now calls the planner: retrieval batch capped by `budget.reviewCount`, rescue forces lite mode, and `rationale.planWhy` carries the balance line — the homepage practice card leads with it. |
| Why-this for articles | `selectNextContent` returns `reasonHuman` (bilingual) built from the actual winning factors — reinforcement hits ("naturally re-uses 3 expressions you're still learning"), first read + level fit, re-read value. Dev-facing `reason` retained (P23 observability). |
| End-of-session | Review session keeps its tally across batch rollovers (`load(mode, {keepStats})`); on queue clear it shows: "6 answered · 0 recalled successfully · Your next review has been scheduled" + both tomorrow scenarios. |

## Bug found & fixed during walkthrough (real, pre-existing)

**Orphan review items starved the queue**: historical `retrieval_items` rows pointing at deleted chunks/errors sat at the TOP of the priority order (274 days overdue); `buildEntry` returned null for each, so a learner with "52 overdue" could get an EMPTY queue forever. Fix: over-fetch candidates (`limit × 3`), skip orphans, fill the real quota — verified: the same user went from queue 0 → 6 real items.

## Verification

- `test:planner` (new, **18 checks**, in `verify:all`): budgets across 15–240 min × pressure levels (incl. cap-at-24 and 15-min-fit), bilingual why always present; tomorrow projection arithmetic + human lines; **interval evolution on a simulated learner** (first success → future due; failure → tomorrow; recovery → grows again; never negative); plan flips review-heavy under a fabricated 20-item backlog; selection returns human reason; A2-vs-C1 ranks differently; schedule rows unique.
- Full battery green: `verify:all` (lint 0 errors · tsc · 10 suites) · `verify:product` · `test:data` · `test:security` · `build`.
- Browser (production): homepage practice card leads with the planner line; full review session → end panel shows answered count, scheduling confirmation, and both tomorrow scenarios in bilingual human words.

## What deliberately did NOT change

Engine intervals (SM-2 + retention 7→30→90 stay), priority weights, content-score weights, CET profiles (planner is exam-agnostic and reads only per-profile evidence — V8 isolation intact), mission step structure.
