# V12.2.1 CET Completion Review

## CET-4 / CET-6 Writing AI Practice Feedback — shipped

- **Prompt**: `src/lib/ai/prompts/cet-writing-feedback.ts` — CET-specific master prompt (CET-4 practical / CET-6 academic context; NEVER IELTS prompts). Output: Strengths / Problems / Suggestions / Revision Targets (simple JSON, zod-validated).
- **Provider wiring**: `cetWritingFeedback` optional method on `AIProvider` — implemented in openai-compat (live) and mock (offline fallback labelled honestly), proxied through FallbackProvider.
- **API**: `POST /api/cet/writing-feedback` — exam-gated (CET goals only), task must belong to active exam, answer ≥10 chars, section must be writing/translation.
- **UI flow** (`/cet` writing/translation task, learning mode): Write → Submit → task result note → **AI Practice Feedback panel** (4 guidance sections + "practice guidance — not an official score" label) → **Revise textarea** (pre-filled with the draft) → Submit revised draft (re-enters the loop). "Official Score / 官方成绩" never appears (tested).
- **Learning loop**: writing/translation submissions already go through `submitCetAttempt` → `recordEvent` + `addError` (V12.2) — this version adds the AI feedback layer on top; evidence thresholds unchanged.

## CET Exam-Mode Section Timer — shipped

- **Official durations**: `EXAM_SECTION_MINUTES` — CET-4: 30/25/40/30 (125 total), CET-6: 30/30/40/30 (130 total), per the official spec in `V12_2_CET_OFFICIAL_SPEC.md`. **Test mode** (`TEST_SECTION_SECONDS`): 30/20/20/20 seconds so tests never wait.
- **Data model**: `cet_exam_sessions` table — `examStartTime`, `sectionStartTime`, per-section `answers` with `sectionEndTime` + `timedOut`, `submittedAt`. All truth in the DB: refresh/back/remount/tab-switch **cannot** reset or add time (server recomputes remaining from immutable timestamps).
- **Service**: `src/server/services/cet-exam-timer.ts` — `startExamSession` (resumes live session), `advanceSection` (idempotent: double-advance is a no-op; submitted sessions reject further advance; answers preserved per section).
- **API**: `GET/POST /api/cet/exam` (phase=start|advance; testMode flag for short timers).
- **UI**: `SectionTimer` component — section name + countdown, warn at ≤5min, danger at ≤1min, "00:00" at exhaustion → auto-advance fires `onExhausted`. Exam mode: official section order enforced (Writing → Listening → Reading → Translation → End), no section cards, no hints/explanations/retry; auto-submit at final section timeout; result page shows timed-out sections. Manual submit ("Submit & next section") also advances.
- **Learning mode unchanged**: transcripts + retry + reference translation still available.

## Tests (`test:cet-completion`, 20 checks, in `verify:all`)

Writing AI: CET-4 feedback round-trips (4 guidance sections); CET-6 translation feedback; honest mock label; no official score language; structural fallback. Timer: CET-4 official 30/25/40/30=125; CET-6 30/30/40/30=130; test-mode seconds. Flow: session starts at writing; resume = same session (refresh-safe); writing→listening advance with timedOut recorded; double-advance idempotent; full sequence ends submitted; all answers preserved; submittedAt immutable; submitted session rejects advance; CET-6 independent; IELTS untouched.

## Browser E2E (`artifacts/v1221-e2e/`, 3 screenshots)

Writing: submit → AI Practice Feedback panel renders (verified: "AI Practice Feedback / AI 练习反馈", no "Official Score"), revise textarea appears. Exam: timer visible counting down (00:19 in test mode), exam mode active. (CET-6 verified via service tests.)

## Known limitations

- The exam timer runs in test mode (seconds) in the current build for practical E2E; the real-minute durations are the asserted official values in `EXAM_SECTION_MINUTES` (service-level tests verify both).
- Pre-existing test isolation issue: `test:pm` → `test:loop` sequential run causes 5 loop failures (verified pre-existing by stashing V12.2.1 and reproducing). All suites pass individually. This is a pm-suite state leak, not a V12.2.1 regression.
