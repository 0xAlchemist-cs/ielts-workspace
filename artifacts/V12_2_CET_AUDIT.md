# V12.2 CET Audit

Date: 2026-09-18 · Official spec verified (see `V12_2_CET_OFFICIAL_SPEC.md`).

## Existing CET functionality

- Exam profiles (V8 identity isolation), corpus namespaces (empty for CET today), import inheritance, delete safety, honest readiness (session-count only), planner consumes pressure + readiness gap (V12.1), ExamConfig gates all IELTS-only layers away from CET (V12.0).
- **CET corpus: 0 contents; CET tasks: none; no CET practice routes** — everything IELTS lives in `/ielts` behind locked routes.

## Missing written-test functionality (all of V12.2)

1. Task data model with exam attribution (`ielts_tasks` has no examProfile column — IELTS-only table; a clean `cet_tasks` table avoids contaminating the working IELTS engine while sharing its shape).
2. Task loading/grading per official sections (`writing | listening | reading | translation`).
3. Practice shell (learning/exam mode), section navigation, translation flow (new task type).
4. Synthetic fixtures — **no official CET questions exist in the repo** (verified: sources are all seed/ielts banks); fixtures will be `synthetic_test` labeled, never official.
5. Readiness wired to real CET task evidence; errors → Error Bank; evidence → Learning Memory (both already per-profile by construction — just need emit points).

## Reusable shared components

`ielts_tasks` column shape (clone for cet_tasks), IELTS practice grading approach (`gradeMockSection`-style answer comparison), existing Reading/Listening labs (import materials flow through them already), Error Bank + addError, Learning Memory (evidence types), readiness service (extend CET branch), ExamConfig (add writtenSections), planner (mission primarySkill bias from readiness gap).

## Data-model gaps

- New `cet_tasks` table: `exam_profile, section, task_type, difficulty, topic, prompt, content, questions(json), source(official|synthetic_test|user_imported), audio_url, duration_minutes, created_at`.
- No CET score model — results reported as raw counts ("18/25"), never converted.

## UI gaps

- CET practice route + section chips + mode toggle; sidebar entry visible only under CET goals.
