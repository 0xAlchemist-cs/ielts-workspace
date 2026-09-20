# V16-Beta Hardening — Pilot Findings Fixed

Date: 2026-09-20 · Scope: fix the four beta-pilot-verified blockers only.
No new engines, no new tables, no onboarding changes — reuse throughout.

## P1-1 · Cold-start dead end — FIXED

`src/server/services/session-plan.ts` (new shared builder, the single source
of truth for the day's session) reroutes the two expression-dependent steps
when the learner's bank is EMPTY:

- NOTICE → deep link `/chunks?tab=discover` ("find one expression first,
  then we'll continue") instead of an empty Library;
- USE IT → framed as "pick one from the expressions you just found" (same
  Discover flow), never a synthetic item.

/chunks now accepts `?tab=` (server-side searchParams → initialTab).

**Completion guard**: while the bank is empty, "I've finished this" is
disabled with an inline reason; saving ONE real expression anywhere unlocks
it on return (server re-renders from real state — no fake evidence, no timer
theatre). Once the bank is non-empty the honor system is unchanged.

Browser-verified on an empty CET-6 sandbox: Discover deep link opens ✓ → save
one expression ✓ → return → NOTICE restored to normal copy, button unlocked ✓.

## P1-2 · Today/Session count & minutes disagree — FIXED

Root cause: Today derived count from 6 fixed mission steps + a plan-length
range guess ("45–60 min"); /session summed per-activity minutes of pending
steps (24) and shrank its denominator as steps completed (1/5 → 1/4 → 1/3).

Both screens now read the SAME `buildSessionPlan` summary:
- Today shows `{pendingCount} activities · ~{pendingMinutes} min` (single
  value — no invented ranges; rescue-day title rule untouched);
- Session shows a STABLE denominator (`position of totalCount`, minutes
  `elapsed/total` over the whole non-skipped sequence).

Browser-verified: Today "5 activities · ~24 min" ⇄ session "1 of 5 · 0/24" →
after one step "2 of 5 · 3/24" (denominator no longer shrinks).

## P1/P2-3 · Contradictory review items — FIXED at generation

Legacy corrupt rows (wrong→correct pairs sharing no anchor word, e.g.
"decoration"→"essential infrastructure") produced unanswerable items.
`errorPairCoherent()` gate in retention question generation: a pair must
share ≥1 word (≥3 chars) to be served — the exact property of real
corrections ("interested on"→"interested in"). DB sweep (read-only): 8 such
pairs exist across users; all are now silently skipped at serve time, rows
untouched. Regression: incoherent pair never queued / coherent pair still queued.

## P1/P2-4 · Finish without doing anything — FIXED (cold start only)

Covered by the guard above: at cold start the button waits for a real saved
item. For a learner with existing items the honor system is preserved by
design (session evidence comes from the real module actions, not the button).

## Recorded, not implemented (per spec)

- No Guest/Demo/Reset mode this version — single-learner architecture
  unchanged; decision recorded here.

## Verification

- `verify-session` 23 checks (11 new: cold-start routing, guard lift on real
  save, stable denominator, single-source counts, dirty-pair gate both ways).
- tsc clean; build clean; full verify:all green at push (gate).
- Browser E2E on empty CET-6 sandbox, 5 screenshots in artifacts/beta-pilot/hardening-*.png.
