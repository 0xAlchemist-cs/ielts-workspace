# V8 Exam Profile Migration

Date: 2026-09-16 · Deterministic, one-shot, already applied to the production db (idempotent by construction).

## Rules (every one explicit)

| # | Rule | Rationale |
|---|---|---|
| 1 | `contents.exam_profile` added with `DEFAULT 'ielts'` — **all 657 existing rows are IELTS** | The entire pre-V8 corpus is Cambridge IELTS material; no existing row is ever classified as CET — there is no evidence to justify it, and the spec forbids guessing |
| 2 | `imported_resources.exam_profile` added with `DEFAULT 'ielts'` — every past import stays IELTS | Same evidence rule |
| 3 | `users.exam_profile` added with `DEFAULT 'ielts'` — the existing user (id 8, "Learner") keeps ALL of its learning memory as the IELTS profile | Learning memory (retrieval items, review history, errors, missions, progress, chunk events, vocab bank, saved expressions) migrates untouched — it lives on user 8 |
| 4 | Two NEW user rows created: `Learner (CET-4)` and `Learner (CET-6)`, each with a default learning profile (B1, bilingual, 45 min) | New namespaces start EMPTY by design — no IELTS history leaks into CET |
| 5 | `app_config` gains key `activeExam` on first switch; absent key = IELTS | Zero-config default keeps the pre-V8 experience byte-identical until the user actively switches |
| 6 | No table gets an `exam_profile` column for learning-memory (retrieval_items, review_history, errors, daily_missions, user_progress, vocabularies, chunks, chunk_events, …) | Those tables are already per-user, and each exam goal IS its own user — isolation by identity, not by filter (a missed filter can never leak) |

## Roll-forward / roll-back

- Roll-forward is idempotent: re-running the migration script finds the CET users by `exam_profile` and skips creation.
- Roll-back: set `activeExam` back to `ielts` (or delete the key) — everything else is additive; the CET user rows can remain dormant with zero effect.
