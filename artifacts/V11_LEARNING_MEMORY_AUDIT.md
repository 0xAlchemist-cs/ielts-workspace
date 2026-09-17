# V11 Learning Memory Audit

Date: 2026-09-17 · What evidence exists, what it can support, what it cannot.

## Existing evidence (verified in code)

| Source | Fields | Learner-level signal it can support |
|---|---|---|
| `retrieval_items` | successCount/failCount per item; 7-state ladder (`exposure…retention`); `forgettingDetected`; `retentionScore`; `intervalDays`; contexts[] | weak-vs-strong populations; recognition-vs-production gaps; forgetting-prone populations; cross-module usage |
| `review_history` | every attempt: mode, correct, quality, timestamp | before/after accuracy windows; delayed-vs-immediate success; per-item trajectories |
| `errors` | category, wrongForm, occurrenceCount, status | recurring-error challenges by category; resolution trends |
| `chunk_events` | typed behaviour stream (guess/analysis/generation/listen_*/shadow/ielts_use) | noticed-vs-produced; writing/speaking usage preceding retrieval success (pattern P1) |
| `writing_attempts` / `speaking_attempts` / `external_sessions` | text/feedback/meta | output-module evidence |
| `user_progress` (trend14) | produced/accuracy per day | day-level improvement curves |
| `computeFullProfile` | weakestLink, errorPatterns, per-skill dimensions | already-computed aggregates (reused, not duplicated) |
| V10.1 need-overlap inputs | mid-ladder chunk texts + active-error forms | memory→content link is ALREADY closed (`test:need` proves it) |

## What can reliably support insights

- **Challenges**: error categories with occurrenceCount ≥2; item populations with productionMisses > productionHits; forgetting-detected clusters; recognition-strong+production-weak gaps (needs ≥5 items with attempts).
- **Improvements**: review_history split into early vs last-14d windows (≥3 attempts each side) with accuracy rising ≥20pts; errors whose recent 3 attempts are all successful; items reaching `retention` state.
- **Still unstable**: improvement signal + forgettingDetected on the same population ("getting better, but drops after days").
- **Patterns** (thresholds documented, no pattern below them):
  - P1 writing-then-remember: ≥3 distinct items with a `generation`/`ielts_use` event followed within 7d by successful retrieval, AND the same items' no-writing baseline not contradicting (or simply ≥60% post-writing success with ≥3 samples).
  - P2 fade-after-gap: ≥3 items, each with early success then a fail after ≥7 days.
  - P3 recognise-but-not-produce: ≥5 items attempted in both recognition and production modes with recognition success ≥60% and production success ≤40%.

## What is NOT sufficient (will not be inferred)

- Time-of-day / personality / learning-style traits (no evidence structure).
- "Visual learner" style claims — forbidden.
- Any insight from a single event (minimum evidence counts above).

## Already-closed V11 links (reuse, don't rebuild)

- memory→content: V10.1 need-overlap (challenge sources ARE the overlap inputs).
- memory→planner: V10 `readMemoryPressure` already consumes due/atRisk/recentFailures; V11 adds a human `memoryNote` on the plan when a pattern flips the balance.
- memory→Speaking (IELTS only): external card already weaves the learner's top weak expression; V11 adds challenge-aware task selection (a reason/explanation challenge biases toward reason-type questions).
- Exam isolation: memory is built per-profile user (V8 identity isolation) — nothing to add.

## Storage decision

**Derived memory only** — `buildLearningMemory(userId)` computes from the tables above on demand; no new persistent tables, no duplicate truth. Developer explanations are computed alongside (evidence counts + confidence), never rendered raw.
