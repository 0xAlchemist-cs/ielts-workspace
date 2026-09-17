# V12.2 CET Plan

## Architecture

- **One shared engine** (`cet-engine.ts`): loading (exam+section filtered), objective grading, attempt persistence, evidence emission. CET-4 and CET-6 differ only by data + ExamConfig (`practiceRoute: /cet`, no locked routes) — zero engine forks.
- **`cet_tasks` table** (separate from `ielts_tasks` — no cross-contamination): `exam_profile, section(writing|listening|reading|translation per official syllabus), task_type, prompt, content(passage/transcript/reference), questions(json), reference_answer(translation), source(official|synthetic_test|user_imported), audio_url, duration_minutes`.
- **`cet_attempts` table**: real evidence rows (responses, freeText, correct/total) → feed readiness directly.

## Source honesty

- Fixtures are `synthetic_test` labeled (`npm run db:cetfixtures`, 8 tasks: 4 sections × 2 exams, CET-6 versions genuinely harder — longer passage, lecture format, longer translation). UI shows "practice material (not an official exam question)" on every task. **No official CET questions exist in this repo** — none fabricated.
- Score honesty: results are raw counts ("3/3 correct — practice performance 非官方分数"); readiness why-lines carry the same label; no 710-scale conversion anywhere.

## Practice shell (`/cet`, CET goals only — hidden from IELTS nav)

- Section cards (Listening/Reading/Writing/Translation with counts), Learning/Exam mode toggle (learning = transcripts + retry + reference translation; exam = no hints, one submission — constraints live in the UI layer, grading is shared).
- Reading: passage + MCQ grid → submit → raw score + wrong-item review (learning mode).
- Listening: prompt + MCQ, transcript behind a details toggle (learning only).
- Writing: prompt → textarea → save + honest note.
- Translation: Chinese passage → English textarea → save + reference translation reveal (learning mode).

## Integration

- **Error Bank**: wrong objective answers banked with CET context (`explanation` carries exam+section; category vocabulary; sourceModule `cet_<section>`).
- **Learning Memory**: attempts emit progress events; per-profile by construction.
- **Readiness**: CET branch now aggregates `cet_attempts` per section — ≥3 objective tasks → accuracy state (≥70% on_track, ≤50% needs_work), honest counts in why-lines, never official scores.
- **Planner**: readiness topGap (V12.1) now has real CET gap data to bias the mission's primary skill.

## Testing (`test:cet`, 23 checks, in `verify:all` — 16 suites)

The spec's 20-item matrix: route loading per exam, official 4-section coverage, exam+section filtering, source honesty, perfect/wrong grading, score-language honesty, translation flow, Error Bank with CET context, attempt records, readiness accuracy states + no-official-claims, topGap from real gaps, exam-mode parity, import inheritance (covered in test:exam), delete safety (test:exam), switching, CET-4/CET-6 mutual isolation, IELTS untouched.
