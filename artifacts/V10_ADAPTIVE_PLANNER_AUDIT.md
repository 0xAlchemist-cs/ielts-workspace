# V10 Adaptive Planner Audit

Date: 2026-09-17 · Goal: connect existing systems into one adaptive planner — no second review engine, no rebuilt scheduler.

## Already satisfies the spec (verified in code)

| Spec phase | Existing implementation | Verdict |
|---|---|---|
| P4 adaptive intervals | SM-2 variant in `submitReview`/`submitRetentionReview`: success → `interval × ease` (ease grows to 2.8), failure → interval reset to 1 + ease −0.2; NOT a fixed 1/3/7 ladder | keep |
| P5 forgetting | `detectForgetting` (was-successful + delayed fail) → retention score ×0.5 + interval 1 + priority boost | keep |
| P3 hierarchy | `computeReviewPriority` (overdue 35 / failRate 25 / low-retention 20 / importance 10 / cross-module 5 / forgetting 5) + queue categories — matches the suggested ordering | keep, extend consumption |
| P6 load control | queue is batch-limited by session mode (5/10/30) — 50 overdue never dump | keep |
| P8/9/10/11 content choice | `selectNextContent`: CEFR ±1 tolerance (soft), novelty, cooldown/anti-repeat, mission topic, and **weak-chunk reinforcement** (`weakByContent`: items whose ladder is mid-flight sourced from that content) | keep, add reason string |
| P26 data model | schedule reconstructs from evidence (`retrieval_items`); no new tables needed | keep |
| P25 integrity | unique (user,item), interval ≥1 enforced, V8 exam/profile isolation | keep |
| P14 (partial) | `getTomorrowPreview` (due-tomorrow count) exists | extend with scenario projection |

## Gaps → what V10 builds

1. **Time budget is decorative** (P1/P2/P15): `dailyMinutes` exists but `recommendedLength` (quick/standard/deep) never reads it and the mission shape is fixed. → `planner.ts`: `allocateBudget(minutes, pressure)` pure function → review/new/transfer minute split + review-count cap + balance mode (new-heavy / balanced / review-heavy / rescue); mission consumes it (retrieval batch size, est minutes, rationale line).
2. **No why-this for articles** (P13/P24): selection records no reason. → `selectNextContent` returns a human `reason` built from the *actual* winning factors (reinforcement hits / first read / level fit), never fabricated.
3. **No tomorrow projection** (P14/P21): → `projectTomorrow()` deterministic two-scenario preview (all-success vs some-failure), shown at session end alongside "Your next review has been scheduled".
4. **Missed-day handling** (P16): planner detects >3-day absence → rescue mode (small highest-value subset, welcoming tone, no guilt).

## Test plan (P27/P28/P30, service-level `test:planner`)

Budget allocation across 15–60 min × pressure levels; interval evolution over a simulated D0→D7 learner (success growth, failure reset, forgetting pull-forward); plan adapts with pressure; article choice differs by CEFR (A2 vs C1); reasons present and truthful; integrity invariants (no negative/impossible intervals, monotone due updates); cross-profile isolation untouched (covered by test:exam, asserted once).

## Out of scope

New scheduling tables, a calendar UI, changing engine weights blindly, CET behavior changes.
