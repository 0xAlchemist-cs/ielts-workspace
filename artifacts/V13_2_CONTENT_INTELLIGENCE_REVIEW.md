# V13.2 Content Intelligence — Plan + Review

## What was already done (verified — no changes needed)

The existing infrastructure from V8-V13.1 covers most of the spec:

| Spec requirement | Implementation | Verified by |
|---|---|---|
| CEFR fit (soft, controlled challenge) | selectNextContent cefrMatch ±1 at 0.6 | test:exam, test:v9v10 |
| Learning-need match | V10.1 need-overlap (mid-ladder chunks + error forms in body) | test:need 7 checks |
| Exam isolation | exam_profile column + ExamConfig | test:exam per-exam pools |
| Novelty / cooldown | content history anti-repeat graduated + <24h −0.25 | test:rotation |
| Selection score (6 factors) | weighted: skill 30% / cefr 20% / ieltsRel 15% / novelty 15% / itemValue 10% / missionTopic 10% + penalties | test:rotation T8 deterministic |
| Imported content pipeline | V6/V7 extract→analyze→level→library; unknown shows "not analyzed" + [Analyze] | test:import 33 checks |
| Why-this explanations | SelectedContent.reasonHuman (bilingual, from actual winning factors) | test:need |
| Manual override | Library lists all exam-scoped content; any article openable | browser |
| Prompt injection | V13 BASE_PROMPT UNTRUSTED CONTENT GUARD | test:ai |
| CEFR change → recommendation change | cefrMatch weight responds | test:need Experiment C |

## What V13.2 added (three targeted extensions)

### 1. Topic diversity (Phase 11)
`selectNextContent` now counts same-topic uses in the last 7 days from `content_history`; ≥2 → −0.1 score penalty. **Waived when itemValue ≥0.9** (spec: "diversity where learning value is comparable" — a max-value need-overlap article earns its reinforcement).

### 2. Quality gate (Phase 2/P13/P23)
Local heuristic (no AI needed): body <120 words or <5 sentences → −0.15 score penalty. Content is deprioritized, never blocked — Library access stays unrestricted (spec Phase 24). Thin/imported content stays visible and manually openable.

### 3. Strength labels (Phase 21)
`SelectedContent.strength` derived from CEFR distance: exact level → "Good fit 正合适", +1 above → "Stretching you a little 稍有挑战", +1 below → "Comfortable 轻松复习", ≥2 → null (no misleading label). From real CEFR distance, never fabricated.

## Tests (`test:content-intelligence`, 11 checks, in `verify:all` — 20 suites)

Topic diversity (tech preferred over 3× env fatigue); strong need waives penalty; quality gate (thin content deprioritized); B1 learner gets B1 article; strength labels (Good fit / Stretching); A2 prefers A2 / C1 prefers C1; reasonHuman always present; strength null only at ≥2 distance; IELTS learner never gets CET content.

## Design decisions documented

- Topic penalty is **conditional on learning value** (itemValue <0.9) — not absolute (spec Phase 20: "same weak target can still be selected if reinforcement value is high").
- Quality gate uses **local computation** (body length + sentence count), not AI — the existing V9 classifier handles difficulty; this handles "is it learnable text?"
- No new AI prompt needed — the spec's Content Quality prompt (Phase 5) is future work if local heuristics prove insufficient.
- Zero new tables; all signals computed from existing `content_history` + content body.
