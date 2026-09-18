# V13.1 Learning Session — Plan + Review

## Architecture (shipped)

**Planner decides WHAT → Session decides HOW → Existing modules do the learning → Existing evidence records what happened.**

The `/session` route is a **pure orchestration layer** — zero new engines, zero new tables, zero new evidence paths.

## Session model

Derived from today's `daily_missions` row (no new persistence). The page server-component:
1. `getOrCreateTodayMission(userId)` — the Planner output
2. Builds an ordered activity sequence from pending steps (lite mode respects existing skip rules)
3. Finds the current activity (first non-done step; mission `status=completed` → complete screen)

## Activity sequence (from Mission)

Standard order: **Reading → Listening → Notice → Use-it → Recall → Speaking → Apply** (lite mode: Reading + Recall only + any content-based steps). Each activity carries `{key, type, title, desc, href, minutes}` — an adapter to the existing module.

## UI (spec: "one activity at a time, minimal controls")

Three screens, at most one primary action each:
1. **Activity**: icon + type label + title + instruction + `[Start · N min]` (goes to the existing module route) + "I've finished this →" (returns to session) + "Exit session"
2. **Transition**: ✓ "Nice." + "Next: [activity name]" + `[Continue]` (marks the step done via existing `markStepDone` server action, advances)
3. **Complete**: "Today's learning complete." + per-activity checklist + "Tomorrow's plan has been updated." + `[Done]`

Progress: "3 of 7 · 12/25 min" — quiet, just direction. Never the full sequence as a checklist.

## Today page

The primary button now reads **"Start today's learning"** and navigates to `/session` (was: direct link to the first incomplete module). Partial sessions show **"Continue today's learning"**.

## Completion semantics

- Activity completion = existing `markStepDone(userId, step)` — the same signal every module already writes
- Opening a module ≠ completing it: the learner returns to the session and explicitly confirms "I've finished this"
- `markStepDone` is idempotent — duplicate clicks, refresh, back-navigation cannot create duplicate evidence
- Partial sessions resume from the first incomplete activity; completed activities are never repeated

## Evidence

Each activity runs inside its existing module (Reading Lab, Listening Lab, Review Session, External Speaking, CET Practice, Writing Lab). All evidence flows through the existing pipelines (chunk_events, review_history, ielts_attempts, cet_attempts, external_sessions) — the session layer never touches evidence directly.

## Exam isolation

The session is built from the per-profile user's mission (V8 identity isolation). CET sessions get CET content/routes; IELTS sessions get IELTS. The transfer step routes to `/cet` for CET goals, `/ielts` for IELTS.

## Tests (`test:session`, 13 checks, in `verify:all` — 19 suites)

Planner→session conversion; retrieval included; completion advances sequence; completed removed from remaining; partial completion (≥2 done) tracked; resume shows only remaining; all-done marked completed; duplicate mark-done safe; CET-4 session independent; CET readiness unaffected; lite mode strips notice/deep/speaking but keeps reading+retrieval; planner adapts next cycle (existing V10).

## Limitations (honest)

- The "I've finished this" is learner-confirmed (not module-auto-detected) — this is deliberate: opening a module ≠ completing it, and the existing modules' completion criteria vary. A future version could add per-module completion callbacks.
- Dynamic re-planning mid-session is NOT implemented — the session completes the planned sequence; the next planner cycle adapts (V10 behavior).
