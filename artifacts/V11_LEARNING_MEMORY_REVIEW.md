# V11 Learning Memory Review

Date: 2026-09-17 · Audit: `V11_LEARNING_MEMORY_AUDIT.md` · Derived memory only — zero new tables.

## What shipped

| Piece | Detail |
|---|---|
| `learning-memory.ts` | `buildLearningMemory(userId)` derives from real evidence: challenges (recurring-error categories ≥2 slips; recognised-but-not-produced ≥3 items; forgetting cluster ≥2), improvements (early-vs-recent ≥20pt accuracy windows with ≥3 attempts each side; error corrected ×3 in a row; retention reached ≥2), still-unstable (improving + forgetting nuance), patterns with enforced thresholds (writing-helps ≥3 items; fade-after-gap ≥3 items; recognise-not-produce ≥5 items & 60/40 rates), recently-strengthened (with cross-module notes), this-week timeline, per-insight `devExplanation` (evidence list + confidence, never user-rendered). |
| `/memory` page | Five quiet sections, human words only (zero scores/formulas — verified by regex in E2E); every claim opens **Why?** (counted evidence) → **See examples** (date · item · activity · result rows); honest empty state below the evidence threshold. Sidebar gains a fifth primary destination: Memory 学习记忆. |
| memory → planner | `buildDailyPlan` appends the pattern-grounded sentence to the plan's why-line (fade-after-gap → "lean toward keeping things fresh"; writing-helps → "transfer step worth finishing"); budget numbers remain exactly the V10 evidence-driven ones. |
| memory → content | Already closed by V10.1 need-overlap (challenge sources ARE the overlap inputs; `test:need` proves ranking changes) — reused, not rebuilt. |
| memory → IELTS Speaking | Recognise-not-produce pattern biases task selection to reason-type questions ("Explain why…"); CET profiles untouched (page renders no speaking card, memory stays per-profile). |
| Isolation | Memory is per-profile by construction (V8 user identity); CET challenge keys never appear in the IELTS memory (asserted in tests). |

## Tests (`test:memory`, 12 checks, in `verify:all` — now 13 suites)

Empty state (no fabricated insight) · challenge appears after repeated failure → **disappears after sustained success** · single success does NOT create improvement (threshold enforced) · sustained success does · fade-after-gap pattern (3 items) + memory evolves on contradiction · writing-helps pattern (3 items) · planner why-line carries the pattern · recognise-not-produce (5 items) → reason-biased speaking prompt differs · per-profile isolation.

## Verification

- `verify:all` green (lint 0 errors · tsc · 13 suites incl. memory 12/12) · `verify:product` · `test:data` (3 known advisories) · `test:security` 3/3 · `build` ✓.
- Browser E2E (`artifacts/v11-e2e/memory-real.png`): real user's memory renders "What you're working on / Recently strengthened / This week" with evidence-backed Why? drill-down; zero score/engine-word leaks; nav shows the new destination.
- 7-day and 14-day simulations documented from the seeded evidence chains (insights appear, retire, and get replaced as behaviour changes).
- Data integrity: all tests on temp `__mem_*` users, surgically cleaned (0 leftovers, seed corpus 657 unchanged).

## Acceptance checklist (spec Phase 41)

1✓ challenges 2✓ improvements 3✓ patterns 4✓ evidence-backed (counted) 5✓ insights retire/replace (D8/D9 in 14-day sim) 6✓ progressive disclosure 7✓ memory→planner why-line 8✓ memory→content (V10.1 link, proven) 9✓ memory→IELTS speaking (reason-bias) 10✓ CET isolated 11✓ honest empty state 12✓ not a dashboard (5 sections, 0 scores) 13✓ 7-day 14✓ 14-day 15✓ browser E2E 16✓ all suites green.
