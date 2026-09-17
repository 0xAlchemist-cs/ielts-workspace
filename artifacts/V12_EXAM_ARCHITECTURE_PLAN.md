# V12 Exam Architecture Plan + Migration

## Plan (shipped)

One learning core, three exam goals — formalized as configuration, not forks:

| Decision | Implementation |
|---|---|
| ExamContext | `EXAM_CONFIG[activeExam]` — engines ask config, not strings. `getActiveExam()` remains the single resolution point (V8). |
| ExamConfig fields | id/label/zh/longLabel (UI+AI), hasCefrLayer (V9 difficulty layer), hasSpeakingCoach (IELTS speaking card), hasContentClassifier (import classification), examLockedRoutes (engine routes locked to an owner exam) |
| Locked routes | `lockedRouteOwner(path)` — owner shows, others hide. Replaces duplicated `ieltsOnly` flags on sidebar MORE and topbar SECTION_MAP. |
| Prompt composition | BASE (honesty rules) + EXAM (per-goal priorities + `longLabel` from config) + task prompt — unchanged structure, label now config-sourced |
| Visibility | CET goals named on Today's card + Library banner; IELTS quiet by default |
| Shared engines | untouched — Retrieval/Retention/Planner/Rotation/Mission/Memory remain single implementations keyed on the per-exam user |
| No fake CET features | CET configs declare `false` for every IELTS-only layer; nothing invented |

## Migration

**No data migration required.** V8's migration (users/contents/imported_resources `exam_profile`, all pre-existing rows = IELTS) already established the exam data model; V9-V11 added only derived/optional columns. V12.0 changes are code-layer only (config object + check replacement + two labels).

Deterministic guarantees unchanged: no ambiguous historical rows exist (V8 rule: nothing auto-classified as CET); switching exams never mutates data (only `app_config.activeExam`).
