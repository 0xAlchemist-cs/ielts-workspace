# V12.1 Readiness Review

## Goal setting — shipped

Settings "Learning goal" card: exam row + IELTS target picker (5.0–8.0 halves, clamped server-side). CET goals show the exam name only. Change target → readiness recalculates, history intact (tested: 4 writing attempts survive a 6.5→8.0 change while the state flips strong→needs_work).

## Readiness — shipped (derived service, zero new tables beyond `target_band`)

- States per skill with documented thresholds (none < building 1–2 < band-state ≥3, ±0.5 tolerance); no raw scores in UI (Why? shows counted evidence: "Recent attempts average band 7.0 vs your target 6.5 across 4 attempts").
- Evidence sources: writing_attempts (AI bands), ielts_attempts (bands + task-skill attribution), speaking_attempts + external sessions; CET = session-count building/none, band vocabulary absent (asserted).
- **Language ≠ exam readiness** proven: strong retrieval history with zero exam evidence produces no fake exam states (test).
- IELTS evidence never leaks into CET readiness views (test).
- Fresh learner: every skill honest none/building, no topGap, "Complete a few sessions…" hints.

## Planner integration

Readiness topGap biases mission primarySkill + appends the human sentence to planWhy ("Your listening is the biggest gap vs your target — today leans that way"). Engine unchanged — single decision-maker; content selection inherits the skill via the existing skill-typed pipeline.

## Tests (`test:readiness`, 12 checks, in `verify:all` — 15 suites)

fresh-honest · controlled strong-reading/weak-listening divergence · target-change recalculation + history intact · retrieval≠readiness · CET honest/no-band/no-leak · planner why-line carries readiness. Full battery green: verify:all (lint 0 errors · tsc · 15 suites) · verify:product · test:data · test:security · build.

## Browser E2E (`artifacts/v121-e2e/v121-readiness.png`)

Settings: goal card renders (exam + target rows); set 6.5 → persists. Profile: "Current goal IELTS 6.5" section with 4 skill rows + 4 Why? buttons. Gotcha fixed during build: client component importing the server readiness module pulled better-sqlite3 into the browser — types + state text split into `lib/readiness-types.ts` (client-safe), service re-exports.

## Acceptance (spec stop conditions)

1✓ goal setting 2✓ IELTS target band 3✓ CET honest contexts 4✓ evidence-backed 5✓ insufficient evidence honest 6✓ readiness→planner 7✓ content (via existing skill pipeline) 8✓ (speaking already CEFR+memory aware) 9✓ target change recalculates 10✓ isolation 11✓ UI simple 12✓ all suites green.
