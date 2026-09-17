# V10.1 Learning-Need Experiment (Issue 1)

Date: 2026-09-17 · Controlled experiment, isolated temp users + self-built candidate contents (examProfile ielts, topic "experiment"), surgical cleanup after every run. Real learner data and seed corpus untouched.

## Setup

- Candidates (all B1-compatible, matched length family, same topic family "experiment"):
  - **Why People Change Careers** (B1, reason/explanation-dense: because / that's why / as a result / the reason is / therefore / due to / consequently …)
  - **Two Cities Two Rhythms** (B1, comparison-dense: compared with / whereas / on the other hand / in contrast / similarly / unlike …)
  - **A Quiet Morning Routine** (B1, neutral — no signal patterns)
  - **A Letter About a Flat** (B1, preposition-pattern dense: *arrive at the station*, *at the number*, *reply to*, *from the first of June* …)
  - **Rules of a Small Library** (B1, article-usage dense: *a member*, *the library*, *the information you need* …)
  - C-pool extras: **Simple Daily List (A2, unrelated)**, **Why Careers Shift (B2, reason-relevant)**, **On Rethinking Work (C1, reason-relevant)**
- Weakness injection: mid-ladder chunks (learningState=retrieval) as the learner's live weak expressions; recurring errors (occurrenceCount≥3, active) as error needs.
- Ranking obtained deterministically via successive exclusion (`restrictToIds` + `excludeContentIds`).

## Baseline (BEFORE the fix) — the gap was real

Same-CEFR learners with different weaknesses produced **identical rankings** (all 0.77; tie-broken by content id). Only CEFR level moved scores (A2 0.69 / B2 0.69 / C1 0.62 in pool C). Learning need had **zero** behavioural effect — `selectNextContent`'s only weakness signal was provenance (`weakByContent`), which never applies to a *different* article.

## Mechanism added (smallest possible, no new weight)

The existing `itemValue` factor (weight 0.1, unchanged) now takes `max(provenance, need-overlap)`, where need-overlap = the learner's mid-ladder chunk texts + active-error correct forms (≥4 chars, so bare prepositions can't match everywhere) occurring in the candidate's body, normalised at 3 hits. `reason`/`reasonHuman` report the actual hit count as evidence.

## AFTER — results (real scores)

**Experiment A — same CEFR (B1), different weak chunks**
- Learner A (weak: *as a result*, *the reason is*): 1. Careers **0.837** 2. Cities 0.770 3. Routine 0.770 — reason: "contains 2 expressions you're currently weak on"
- Learner B (weak: *in contrast*, *on the other hand*): 1. Cities **0.837** 2. Careers 0.770 3. Routine 0.770
- **Preference flips exactly with the weakness** (+0.067 for the matching article in each learner).

**Experiment B — same CEFR, different recurring error**
- Preposition-error learner (*arrive at*): Letter **0.803** > Routine 0.770 = Library 0.770
- Article-error learner (*the information*): Library **0.803** > Letter 0.770 = Routine 0.770
- Error relevance moves both rankings in the matching direction.

**Experiment C — level + need together (B1 learner, 5 candidates)**
1. B1 reason-relevant **0.803** · 2. B1 neutral 0.770 · 3. B2 reason-relevant 0.723 · 4. A2 unrelated 0.690 · 5. C1 reason-relevant 0.653
- B1+relevant clearly beats B1+unrelated (+0.033); B2-relevant survives as controlled challenge above A2; C1 stays penalised — need never overrides level sanity.

**Experiment D — strongest control (remove the need)**
- Same learner, same pool: reason-article advantage **+0.067 (with need) → +0.000 (need removed)** — the advantage collapses exactly as required.

## Explainability

Every pick's reason corresponds to counted evidence ("contains 2 expressions you're currently weak on" = 2 literal in-text matches); no fabricated explanations.

## Conclusion

**Issue 1: PASS.** CEFR affects ranking (baseline + pool C), learning need affects ranking (A/B), they combine sensibly (C), and the effect disappears when the need is removed (D). Suite: `npm run test:need` (7 checks, wired into `verify:all`).
