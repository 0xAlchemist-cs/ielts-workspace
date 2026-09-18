# V13.2 Content Intelligence Audit

Date: 2026-09-18 · What's already built vs what's genuinely new.

## Already satisfied (verified by existing tests)

| Spec phase | Existing implementation | Test |
|---|---|---|
| P6 CEFR fit | `selectNextContent` scores cefrMatch (same=1, ±1=0.6, ±2=0.25, else=0.1) at 20% weight — soft, not a filter; controlled challenge via ±1 at 0.6 | test:exam, test:v9v10 |
| P7 Exam relevance | `contents.exam_profile` column + `selectNextContent` filters by active exam; ExamConfig drives capability gates | test:exam (per-exam pool isolation) |
| P8 Learning-need match | V10.1 need-overlap: learner's mid-ladder chunk texts + active-error forms occurring in candidate body → itemValue boost | test:need (7 checks: preference flips, error relevance, removal collapses advantage) |
| P9 Content→language target | Same mechanism — the overlap IS the language-target match (text-level, not just provenance) | test:need Experiment A-D |
| P10 Novelty | Content history anti-repeat with graduated relaxation (exclude last-3→2→1→allow); <24h cooldown −0.25; ≥3 uses in 3d −0.15 | test:rotation |
| P12 Selection score | 6-factor weighted score: skill(30%) + cefr(20%) + ieltsRel(15%) + novelty(15%) + itemValue(10%) + missionTopic(10%) + cooldown penalties | deterministic (test:rotation T8) |
| P14 Imported content | V6/V7: extract→analyze→level→library; unknown level shows "not analyzed yet" + [Analyze with AI] | test:import (33 checks) |
| P16 Today integration | Homepage practice card title + planWhy line; article why-this = reasonHuman | browser E2E |
| P18 Why-this | `SelectedContent.reasonHuman` (bilingual, from actual winning factors: need-overlap hits, first-read + level fit, re-read value) | test:need |
| P24 Manual override | Library lists ALL exam-scoped content; any article can be opened regardless of recommendation status | browser |
| P27 Prompt injection | V13 BASE_PROMPT includes UNTRUSTED CONTENT GUARD in every composed prompt | test:ai |
| P28-31 Tests | CEFR differentiation (test:exam), learning-need (test:need), memory→recommendation (test:need), exam isolation (test:exam) | all green |

## Genuinely new

1. **Topic diversity** (P11): `selectNextContent` currently REWARDS topic match (missionRel 0.3 vs 1.0) but has NO penalty for topic fatigue — 3 consecutive environment articles are not deprioritized. **Add a lightweight topic-fatigue signal.**
2. **Content quality gate** (P2/P13/P23): `isReadableContent` already rejects <800-char and archive content from the pool. But no signal for "limited learning value" (very short, mostly numbers/lists, OCR noise). **Add a local (non-AI) quality heuristic that deprioritizes without blocking.**
3. **Content strength/weakness label** (P21): show "Good fit / Stretching you a little" on recommended articles. **Derive from CEFR distance.**

## Design decisions

- Topic diversity: **local computation** from content_history (count recent uses of same topic; ≥2 in last 7d → −0.1 score penalty). No new tables, no AI. Strong learning-need overrides (itemValue is already 10% vs topic −0.1).
- Quality gate: **local heuristic** on content body (length, English ratio, sentence count). No new AI prompt needed — the existing classifier handles difficulty; this handles "is it actually learnable text?" Output: `quality` column in score (hidden), or more simply: deprioritize score by −0.15 if body <1200 chars or <8 sentences.
- Strength label: **derive from CEFR distance** — already computed in scoreOf; add to reasonHuman.

The spec says "Do NOT create a second Content Rotation Engine" and "Reuse V10.1's verified mechanism" — so I'm extending the existing score minimally, not rebuilding.
