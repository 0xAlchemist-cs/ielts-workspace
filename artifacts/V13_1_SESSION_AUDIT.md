# V13.1 Session Audit

Date: 2026-09-18 · What exists, what can be reused, what's new.

## Existing learning flows (all working, all reusable)

| Activity | Route | Completion signal | Evidence writes |
|---|---|---|---|
| Reading | `/read/{id}` | reading-lab DoneSummary (phase=done) → markStepDone("reading") | chunk_events, content_history, retrieval items |
| Listening | `/listen/{id}` | listening-lab flow → markStepDone("listening") | chunk_events (listen_*), content_history |
| Notice | `/read/{id}` (same article, chunk save) | markStepDone("notice") | chunks, chunk_events (understood) |
| Deep processing | `/chunks` (Language bank work) | markStepDone("deep") | chunk_events (analysis/generation) |
| Retrieval | `/review` (ReviewSession) | queue clear / next batch → markStepAction("retrieval") | review_history, retrieval_items |
| Speaking | `/external` (IELTS: prompt + copy + open) | logged session → markStepDone("speaking") | external_sessions, recordEvent |
| Transfer | `/ielts` or `/cet` | task submitted → markStepDone("transfer") | ielts_attempts / cet_attempts |
| CET Practice | `/cet` | task submitted → cet_attempts | cet_attempts, errors |

**Every activity already has: a route, a completion signal, and evidence writes.** The Session layer only needs to orchestrate the SEQUENCE.

## Existing completion states

- `daily_missions.plan.{step}.status`: `pending | done | skipped` — mission already tracks per-step state
- `markStepDone(userId, step)` / `markStepAction(step)` — server actions already exist
- Mission regenerates if user opens Today with no mission for today

## What can be reused (nearly everything)

- **Mission** = the session plan (7 steps with content/chunk/item references)
- **markStepDone/markStepAction** = completion tracking
- **All module routes** — session embeds/redirects to them
- **Evidence pipeline** — unchanged; activities write through existing mechanisms
- **Planner** — mission generation IS the planner output

## What's NEW (the only build)

1. **`/session` route** — a focused shell that:
   - Loads today's mission
   - Builds an ordered activity sequence from non-done, non-skipped steps
   - Shows ONE activity at a time (embedded module or link)
   - Transition screen between activities ("Nice. Next: Read this article. [Continue]")
   - Completion screen with summary
2. **Today page upgrade** — Start button launches `/session`
3. **Session completion service** — derived from mission status (no new tables)

## What stays unchanged

Planner, Learning Memory, Readiness, Evidence, all module internals, CET exam timer, AI architecture (V13.0).
