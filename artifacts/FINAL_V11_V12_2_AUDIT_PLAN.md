# Final V11→V12.2 Audit Plan

Date: 2026-09-18 · Independent QA line. Method: code→data→runtime→browser chain
per claim; existing suites treated as claims, cross-checked by drivers/E2E here.

## Execution map

| Phases | Method | Artifacts |
|---|---|---|
| 0–1 docs+commits | read V11/V12.x artifacts; map features→commits→files | this doc + report §1 |
| 2 regression | verify:all/product/data/security/build + individual suites | baseline exposed Finding 1 (fixed) |
| 3 memory claims | scripts/verify-final-audit.ts P3.1–P3.6 (isolated learners, real services) | report §1 |
| 4 exam isolation | same driver P4 (three profiles, same-named evidence, data-level) | report §2 |
| 5/25 switching+E2E | browser master scenario in segments (IELTS surfaces → CET-4 → CET-6 → restore) | artifacts/final-audit-e2e/*.png |
| 6/7/22 import | test:exam (26) + test:import (33) rerun in gate | report §2 |
| 8 readiness | driver P8.1–P8.4 (no-false-high, 0/1/2/3 thresholds, topGap→mission, target) | report §3 |
| 9 official spec | V12_2_CET_OFFICIAL_SPEC.md vs implementation (sections/weights/honesty) | report §4 |
| 10–15 CET engine | driver P10 (data diff 4v6, grading honesty, attempt flow) + browser practice shell | report §4 |
| 16/33 AI prompts | injection probe (adversarial import text → classifier) + classifier re-test | report §5 |
| 17 classification | live API re-test of the round-16 confidence-floor fix | report §5 |
| 18 chain | piecewise: test:import + test:need + ranking checks | report §6 |
| 19 determinism | driver P19 | report §6 |
| 20 simulation | scripts/sim-final-14d.ts → artifacts/FINAL_14DAY_SIMULATION.md | report §6 |
| 23/24 integrity | test:data + destructive-ops sweep of V11+ scripts | report §7 |
| 26–28 UX | visible-text terminology sweep (11 pages), score-honesty sweep, beginner copy | report §8 |
| 29 a11y/readability | 145% overflow spot-check (full matrix descoped, noted) | report §8 |
| 30 performance | memory aggregation + readiness at 3000-attempt scale (+ round-16 planner numbers) | report §9 |
| 31–32 failure/AI cost | classifier 502 honesty (round-16), fingerprint dedup, mock badges | report §5/§10 |
| 34–37 suites/claims/limits | suite-quality notes + claim matrix + known-limitations recheck | report §10–§12 |
