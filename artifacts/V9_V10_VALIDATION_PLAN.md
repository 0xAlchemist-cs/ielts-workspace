# V9 + V10 Validation Plan

Date: 2026-09-17 · Validator: independent QA line (not the implementing agent)
Principle: never trust a suite's self-description — every verdict needs DB rows,
API responses, or browser evidence produced by THIS validation. Existing suites
(test:exam / test:planner / test:import / test:data) are treated as claims to
cross-check, not as evidence.

## Phase → execution map

| Phase | Method | Evidence |
|---|---|---|
| 0 plan | this doc | — |
| 1 static | verify:all / verify:product / test:data / test:security / build, exact exits | captured output |
| 2 CEFR model | direct action/service calls + DB reads; invalid values (A1/A3/B3/C2/null/''/'b1 ') must be rejected, valid A2–C1 persist through reload | DB rows before/after |
| 3 onboarding CEFR | browser (folded into Phase 28 E2E) | screenshots |
| 4 settings CEFR | browser (Phase 28) + service persistence; history preserved (evidence rows unchanged) | DB counts |
| 5 exam separation | service-level: CET-4/CET-6 profile rows expose no CEFR surfaces; classifier + speaking personalization gated by activeExam=ielts | API/DB |
| 6 classifier | live API: controlled A2/B1/B2/C1 texts; edge: empty/short/non-English/mixed/very long; honesty on failure (unknown, never fake) | API JSON |
| 7 import classify | service import flow with AI live → level stored; AI off path → unknown persisted | DB contents.cefr + cefr_meta |
| 8 recommendation | two temp learners (A2 vs C1) → selectNextContent ranking + reason differs by level (soft range not hard filter) | returned reason/rank |
| 9 reinforcement | learner with failing target vs without → candidate containing weak target outranks | ranking delta |
| 10/11 speaking prompt | per-CEFR prompt profiles differ structurally (not string swap); weak expression woven naturally, no engine jargon | prompt text |
| 12 scheduling | INDEPENDENT driver: D1/D4/D11/D25 successes → intervals grow (SM-2 adaptive, NOT fixed 1/3/7/14/30); D1 fail → earlier return; repeated fail → intensified; delayed fail → forgetting flag | retrieval_items rows |
| 13 retrieval failure | stable item → fail: priority up, due sooner, plan changes; then success: due later, priority down | queue + plan diff |
| 14 forgetting | strong item + gap + fail → forgettingDetected, returns to attention, not permanent loss | retention fields |
| 15 retention | success lengthens, failure shortens; no duplicate schedule rows | unique constraints |
| 16 time budget | allocateBudget 10/15/20/30/45/60 × pressure levels: plan fits budget (no 45min for 15min learner); graceful degradation | planner output |
| 17 overdue load | 50 overdue → mission shows capped subset (priority/failure/forgetting-aware); rest remain scheduled | queue counts |
| 18 balance | 0/3/10/30/50 overdue → new-vs-review balance shifts monotonically | balance modes |
| 19 missed days | 0/3/7/14 missed → rescue mode, manageable subset, never full dump | plan shape |
| 20 level×level matrix | 4 learners × 4 content levels: same-level preferred, ±1 possible, far-level not dominant | selection tallies |
| 21 rotation | rerun test:rotation + repeat-selection check | suite + spot |
| 22 why-this honesty | reasons map to real evidence; never-failed item must NOT say "struggled" | reason strings vs DB |
| 23 tomorrow-difference | fail vs success on D0 → projectTomorrow outputs differ in the right direction | projections |
| 24 7-day sim | isolated learner, scripted days, artifacts/V10_7_DAY_SIMULATION.md | per-day snapshots |
| 25 14-day sim | extended with missed day + CEFR change mid-week, artifacts appended | stability check |
| 26 chaos | 0/1/1000 items; all overdue; all fail/succeed; AI off; malformed AI JSON; mid-week CEFR/exam switch | no crashes, honest degradation |
| 27 integrity | test:data + post-sim sweeps (dupes, orphans, negative intervals, cross-exam/user leakage, seed protection) | SQL counts |
| 28 browser E2E | Playwright 20-step scenario (fresh user→B1→learn→fail→react→B2→speaking→CET-4→back) | artifacts/v9-v10-e2e/ |
| 29 performance | planner timing at 10/100/1k/10k items; O(n²) scan | measured ms |
| 30 test-quality audit | read their suites for mocked-away logic / implementation-detail asserts | notes in report |
| 31 fixes | only confirmed bugs, smallest scope, regression test first | commits |
| 32 final regression | full verify:all + verify:product + test:data + test:security + build | exact exits |

## Verdict vocabulary

PASS (behavior proven with evidence) / FAIL (bug confirmed) /
PARTIAL (works but with caveats) / NOT VERIFIED (could not exercise honestly).
