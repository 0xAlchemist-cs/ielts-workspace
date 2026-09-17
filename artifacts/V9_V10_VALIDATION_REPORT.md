# V9 + V10 Validation Report

Date: 2026-09-17 · Validator: independent QA line (scripts/verify-v9v10.ts, sim-v10.ts,
perf-bench-v10.ts — all committed for regression). Every verdict below is backed by
DB rows / live API calls / browser interactions produced by THIS validation, not by
the implementing agent's suites.

## Executive summary

V9 (CEFR personalization) and V10 (adaptive planner) are **behaviorally verified**.
The system demonstrably adapts: intervals grow with success and collapse with
failure, forgetting is detected and forgiven, budgets fit minutes, modes escalate
with pressure, CEFR level measurably changes both recommendations and speaking
prompts, and CET profiles see none of the IELTS layer. **Two confirmed bugs were
found and fixed** (planner budget floors, classifier confidence floor); both have
live-verified fixes. Full regression green.

## Static validation (Phase 1) — exact commands & exits

| Command | Result |
|---|---|
| `npm run verify:all` (lint+tsc+smoke 25/pm 27/engine 18/rotation 9/loop 25/writing-gate/input-gates 15/import 33/exam/planner 18) | exit 0 |
| `npm run verify:product` | exit 0 |
| `npm run test:data` | exit 0 — DATA INTEGRITY OK (2 advisory: 15 orphaned error items, 583 historical chunk_events — pre-existing, documented) |
| `npm run test:security` | exit 0 — 3/3 probes |
| `npm run build` | passes (initial failure was QA's own in-progress script — build type-checks scripts/, now clean) |

## The 12 verdicts

1. **Does CEFR actually change IELTS recommendations? — PASS**
   Isolated learners, same corpus: A2 profile → 6/6 picks `B1`; C1 profile → 6/6
   picks `B2` (avg level-rank 1.0 vs 2.0). Soft range, not hard filter — confirmed.
2. **Does imported IELTS content receive a useful difficulty level? — PASS**
   Live classifier API: A2 text→A2 (0.97), B1→B1 (0.85), C1→C1 (0.98), each
   persisted with evidence summary in `cefr_meta`. B2 probe→C1 (0.80) — one-step
   over-grading on genuinely boundary-dense academic prose; acceptable spread.
   Bug found & fixed: pure-Chinese text returned placeholder A2@0.1 and was
   PERSISTED — now confidence < 0.4 → `level:"unknown"`, nothing persisted
   (re-verified live: cefr untouched, `notPersisted:true`).
3. **Does CEFR actually change IELTS Speaking Prompts? — PASS**
   B2 card: "Argue a position with reasons, comparisons, and consequences" +
   B2-calibrated question — a real difficulty profile, not a string swap
   (B1 profile card = opinions/experiences/reasons per level descriptors).
4. **Are CET-4/CET-6 isolated from IELTS CEFR/Speaking logic? — PASS**
   With `activeExam=cet4` (DB-set, full reload): external speaking card GONE,
   settings Learning-level card GONE (screenshots cet4-external/cet4-settings).
   All 657 contents carry exactly one exam tag. Note: switching exam via the
   sidebar can leave a client-rendered page stale until reload — UX observation,
   not a data leak (fresh load always gates correctly).
5. **Does retrieval failure bring an item back sooner? — PASS**
   interval → 1d, ease −0.2, repeated failure keeps easing down (2.80→2.30→2.10
   observed); due = +1 day.
6. **Does successful retrieval push it later? — PASS**
   1d → 3d → 10d through D1/D4/D11 sequence (SM-2 × ease × mode factor) —
   explicitly NOT the fixed 1/3/7 ladder.
7. **Does forgetting trigger earlier review? — PASS**
   Strong item + 30d gap + failure → `forgettingDetected=1`, interval ≤3d,
   priority re-boosted; subsequent success recovers normally (no permanent loss).
8. **Does retention success extend future review? — PASS**
   interval 10d → grows on retention success; exactly one schedule row per item
   (unique constraint holds).
9. **Does article recommendation consider learner level AND learning need? — PARTIAL**
   Level: proven (verdict 1). Need-reinforcement: `selectNextContent` carries
   weak-chunk reinforcement + human reasons (`reasonHuman`) and the planner
   surfaces reinforcement reasons in the sim, but this validation did not build
   an isolated A/B weakness experiment for the ranking itself — covered by
   `test:planner`'s reinforcement checks; recommend a dedicated regression case.
10. **Does today's behavior change tomorrow's plan? — PASS**
    `projectTomorrow` differs by today's risk (3 vs 3+5 risk items → different
    struggle counts); homepage shows planner why-line; sim shows day-over-day mode
    shifts driven by prior results.
11. **Can the planner handle heavy overdue load? — PASS**
    50 overdue → queue capped at limit (≤30), rescue caps reviewCount (≤12 for
    15min), balance ratio 0.85 review-heavy, remaining items stay scheduled.
12. **Stable over 7–14 simulated days? — PASS**
    artifacts/V10_7_DAY_SIMULATION.md — 7d script (new/success/fail/retry/
    transfer/forgetting/retention) + 7d extension (missed day, fail-storm,
    recovery, overdue flood, mid-week CEFR change): modes escalate and de-escalate
    sanely (balanced → review-heavy → rescue), all intervals ≥1d, no starvation,
    no flooding. Limitation noted: absence-driven rescue verified at function
    level (`daysSinceLastStudy` input), the sim could not fabricate real absence
    timestamps.

## Phases 16/19 (budget & missed days)

18/18 budget combinations fit their minutes after the floor fix (10–60 min ×
3 pressure profiles incl. 7-day absence). Rescue mode: ≤12 review items,
welcoming copy. Missed-day path verified via `allocateBudget` pure function.

## Phase 26 (chaos) — spot coverage

0 items (fresh profile queue empty, plan builds), 50 overdue, all-fail streak,
mixed results, mid-week CEFR change: no crashes, honest degradation throughout.
1,000/10,000-item scale covered under performance below. AI-off paths covered by
existing mock-fallback badges (test:import + prior rounds). Malformed AI JSON is
zod-caught (openai-compat schema.parse → 502, nothing persisted — classifier
error path verified live).

## Phase 28 (browser E2E)

Executed against the real user (single-user app; onboarding-first-run scenario
is service-covered, browser-onboarding NOT VERIFIED — noted): level change
B1→B2 with confirm + explanation, persists across reload; planner why-line on
homepage ("Memory needs attention first: 56 items at risk…"); B2 speaking card;
CET-4 round-trip hides both IELTS surfaces; **B2 survives the round-trip**
(E2E step 20); level restored to B1, app left as found. Screenshots in
artifacts/v9-v10-e2e/ (4).

## Phase 29 (performance) — measured

| items | queue | plan |
|---|---|---|
| 10 | 6ms | 4ms |
| 100 | 15ms | 1ms |
| 1,000 | 11ms | 1ms |
| 10,000 | 71ms | 3ms |

No O(n²); 10k overdue queue builds in 71ms. No optimization needed.

## Phase 30 (test-quality audit)

Existing V9/V10 suites are behavior-oriented (drive real services, temp users,
self-clean) — no mocked-away engines found; two assertion styles noted:
verify-planner asserts projections (good); recommend adding: (a) an isolated
weakness-reinforcement ranking case (verdict 9), (b) a reload-after-exam-switch
assertion if the stale-render race matters in practice.

## Bugs found & fixed (Phase 31 protocol: reproduce → document → regression → smallest fix → re-verify)

1. **Planner budget floors overran small budgets** (planner.ts): 15-min learner
   under pressure got a 19-min plan (floors: newMin/transferMin ≥5 never
   compressed). Fix: floors scale with budget (`min(5, 12%)` etc.) + reviewMin
   capped at 80% of minutes. Regression: 18 budget-fit checks in verify-v9v10
   (were 4 fails → 18 passes). Verified in build.
2. **Classifier persisted low-confidence placeholders** (classify-content-level
   route): pure-Chinese text → A2@0.1 written to `contents.cefr` (model itself
   admitted "placeholder default"). Fix: confidence < 0.4 → return
   `level:"unknown"`, persist nothing. Live re-verified: same probe now returns
   unknown, cefr untouched.

No other confirmed defects; nothing was weakened to pass (both fixes narrow
behavior to the documented spec).

## Final regression (Phase 32)

`verify:all` (now including the new `test:v9v10` suite: 57 checks) green at
commit time — the pre-push gate re-runs it on push.

## Remaining issues / honest limitations

- Onboarding-first-run browser flow not exercised (single-user app with existing
  profile) — NOT VERIFIED in browser, service paths covered.
- Verdict 9 PARTIAL: add a dedicated reinforcement-ranking regression.
- Sidebar exam switch may show stale client-rendered page until reload (UX note).
- test:data advisories (15 orphaned error items, 583 historical chunk_events) —
  pre-existing, documented by the suite itself.
