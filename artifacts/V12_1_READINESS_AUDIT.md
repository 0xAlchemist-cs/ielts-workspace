# V12.1 Readiness Audit

Date: 2026-09-17 · What evidence exists per skill, what's missing, what we build.

## Existing target/goal fields

- `learning_profiles`: `ielts_overall/listening/reading/writing/speaking` (self-reported baseline bands, editable in Progress form) — **this IS the target concept for IELTS** (user sets goal bands there already). No CET goal fields.
- **No separate target-band field** — the baseline scores double as targets today. V12.1 makes the goal explicit without duplicating: a `target_band` column (nullable, IELTS only).

## Existing skill evidence (verified counts, real user)

| Skill | Source | Count | Verdict |
|---|---|---|---|
| Writing | `writing_attempts` (AI band per attempt) | 14 | usable — band trajectory per attempt |
| Reading | `ielts_attempts` mode=learning/practice with band + sub_skill_results (detail/inference/etc.) + content completion | several | usable — band + sub-skill correct/incorrect |
| Listening | `ielts_attempts` (same) + listening content sessions in `content_history` (74 uses) | usable via ielts_attempts bands; listen_* events 0 | usable with honesty |
| Speaking | `speaking_attempts` (1) + `external_sessions` | thin | "not enough evidence" territory |
| Mock | `ielts_attempts` responses.type=mock_paper | 0 | none yet |

## What we build (minimal, honest)

1. **`target_band`** column (nullable text, IELTS only) + Settings goal card (exam label + current level + target picker). CET: goal card shows exam name only.
2. **`readiness.ts`** derived service — per-skill state from real evidence, thresholds documented:
   - Writing: ≥3 writing_attempts → compare mean band vs target; 1–2 = Building; 0 = Not enough evidence
   - Reading/Listening: ielts_attempts per skill-direction (task skill attribution) ≥3 → band vs target; fewer = Building/None. Listening also counts completed listening sessions toward Building.
   - Speaking: speaking_attempts + logged external sessions ≥3 → states; else Not enough evidence with the "complete a few sessions" hint.
   - States: `none | building | needs_work | on_track | strong`; needs_work = mean band < target − 0.5; on_track = within 0.5; strong = ≥ target + 0.5. No band vs target for CET → states limited to Building/None from session counts (honest: no score model).
3. **Readiness → planner**: `readiness.topGap` (largest evidence-backed gap) feeds `computeMissionDecision`'s skill priority weight (existing engine — add gap as a factor, no second planner) and the plan's why-line.
4. **Progress page**: a compact "Current goal + readiness" section above the statements block (states + Why + Today's priority link). No dashboard.
5. **Target change**: recalculates states; never touches history.

## Not built (honest)

Score prediction, CET score models, radar charts, readiness history graphs (trajectory already exists in Progress).
