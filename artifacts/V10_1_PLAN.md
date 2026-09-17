# V10.1 Plan (narrow scope — two gaps only)

Date: 2026-09-17 · No redesign, no V11, planner model untouched unless the experiment exposes a missing mechanism (which counts as a confirmed gap to close minimally).

## Issue 1 — Experimentally prove learning-need affects article ranking

**Hypothesis to test (behaviour, not code):** two same-CEFR learners with different weaknesses rank the same B1 candidate pool differently; removing the weakness removes the advantage.

**Expected finding from a pre-experiment audit:** `selectNextContent`'s only weakness signal is `weakByContent` — an article is boosted only if it is the **source** of the learner's own mid-ladder chunks. There is no content-level signal (the learner's weak expressions/errors appearing in a *different* article's text). If the controlled experiment confirms this, the gap is closed with the **smallest mechanism**: extend the existing `itemValue` factor with a *need-overlap* term — count matches of the learner's active weak chunk texts / recurring-error correct forms inside the candidate's body — no new weight, no new engine, reasons updated to match evidence.

**Experiment design (isolated temp users, self-built candidate contents, full cleanup):**
- **A (different weakness)**: two B1 learners, one holding reason/explanation chunks mid-ladder, one holding comparison chunks; pool = three self-built B1 articles (reason-rich / comparison-rich / neutral, matched length & topic family). Expect: rank order flips between learners.
- **B (different recurring error)**: preposition vs article-usage error patterns; pool contains pattern-dense articles. Expect: relevance moves the score.
- **C (level + need together)**: candidates A2-unrelated / B1-unrelated / B1-relevant / B2-relevant / C1-relevant for a B1 learner. Expect: B1-relevant clearly beats B1-unrelated; ±1-level relevant stays usable (controlled challenge), C1 penalised.
- **D (strongest control)**: same learner, same pool; weakness removed (chunks/errors deleted) → the relevant article loses its advantage (score delta collapses).
- **Explainability**: every pick records evidence-backed reasons (level fit, need-overlap hits, novelty).

Output: `artifacts/V10_1_LEARNING_NEED_EXPERIMENT.md` with real scores/rankings before & after; verdict PASS only if behaviour changes; if the mechanism stays absent after the minimal fix, report PARTIAL with the exact missing piece.

## Issue 2 — Stale sidebar after exam switch

Reproduce first (real browser, IELTS→CET-4→CET-6→IELTS, no manual refresh): inspect sidebar, header switcher label, IELTS-only entries (Writing/IELTS/Mock), Today/Library/Progress content at every step. The validation report's own note says data isolates correctly and the observation is a client-render race — root-cause it (`revalidatePath("/", "layout")` + `router.refresh()` ordering vs client nav), apply the smallest fix (likely: `router.refresh()` after the action resolves — already present — or extending revalidation to the current route), never a forced full reload, never duplicated state stores. Acceptance = user-visible correctness across the four-switch loop without refresh.

## Regression & integrity

Full battery (`verify:all` incl. import/exam/planner suites, `verify:product`, `test:data`, `test:security`, `build`); experiments run on temp users + self-built contents and are cleaned surgically (no delete-all, no seed corpus mutation, no real-history writes). Report: `artifacts/V10_1_REVIEW.md`.
