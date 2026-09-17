# V12.1 Readiness Plan

## Goal model

- `learning_profiles.target_band` (nullable, IELTS only: 5.0–8.0 in 0.5 steps). CET goals carry the exam name only — no score model exists, none is invented.
- Settings "Learning goal" card: exam row (always) + target picker (IELTS). Explanation: readiness compares against the target; changing it never deletes history.
- Baseline bands (`ielts_overall` etc.) remain the self-report inputs; the target is the ambition.

## Readiness states (thresholds documented)

- Evidence < 3 attempts → `none` (0) or `building` (1–2). A single success never yields "strong"; a single failure never yields "needs_work".
- ≥3 attempts → band state vs target with ±0.5 tolerance: `strong` (≥ target+0.5), `on_track` (within 0.5), `needs_work` (< target−0.5).
- Skills map: Writing = AI-banded `writing_attempts`; Reading/Listening = `ielts_attempts` (band + task-skill attribution); Speaking = banded `speaking_attempts` + logged external sessions (≥3 banded for a state, else building).
- **Language ability ≠ exam readiness** (spec P5): retrieval strength never fabricates exam states — verified by test (8/8 retrieval successes + zero exam evidence → all skills stay none/building).
- CET-4/6: session-count `building`/`none` only; every why-line avoids band vocabulary.

## Integration

- **Planner**: readiness `topGap` (largest evidence-backed gap, ≥3 evidence) biases the mission's primarySkill (engine remains the single decision-maker; gap outranks default rotation) and appends a human sentence to the plan's why-line.
- **Content**: already exam+CEFR+need-aware (V9/V10/V10.1); readiness-driven skill choice flows through the existing skill-typed content selection.
- **Speaking** (IELTS): prompt selection already CEFR- and memory-biased (V9/V11).

## UI (lightweight, per spec)

Progress page gains "Current goal + readiness" above the statements: goal line (`IELTS 6.5`), per-skill rows (label + human state + Why? → counted evidence), and "Today's priority: X — today's plan already leans this way" when a topGap exists. No scores, no radar, no second dashboard.
