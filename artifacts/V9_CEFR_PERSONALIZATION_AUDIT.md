# V9 CEFR Personalization Audit (IELTS-only)

Date: 2026-09-16 · Scope: make CEFR a real personalization variable — **for the IELTS profile only**. CET-4/CET-6 keep independent corpus/profile and get NONE of this layer.

## What exists (verified)

| Area | Current state | Verdict |
|---|---|---|
| CEFR storage | `learning_profiles.cefr` (per exam-profile user row — V8 already isolates it per exam) | reuse |
| CEFR editing | Profile/Progress page "Edit profile" form (segmented A2/B1/B2/C1) | MOVE to Settings (Phase 1/17): Progress keeps read-only display |
| Content CEFR | `contents.cefr` populated on seeded corpus; imported material gets a LOCAL heuristic estimate from `analyzeContent` | reuse as the level carrier; **imports stop using the local estimate as a displayed level** — V9 classifies via AI or stores `unknown` |
| Recommendation | `selectNextContent` ALREADY scores `cefrMatch` (same level 1.0 / ±1 0.6 / ±2 0.25 at 20% weight) — exactly the "range, not hard filter" the spec asks for | reuse, no second engine; weight already balanced vs weakness/rotation/novelty |
| Speaking prompts | `speakingPromptByChunk` map (chunk→task) used by Listening Lab | extend into the external Speaking card |
| External level-test link | **none exists anywhere in the project** | per spec ("reuse it, do NOT invent a fake URL"): first-time flow uses an honest SELF-ASSESSMENT step (four described levels), not a fabricated external test |
| AI architecture | task registry + zod + mock fallback + exam-aware prompt injection (V8) | classifier becomes a new task through the same pipe |

## V9 decisions

1. **IELTS gate**: every new surface (level step in onboarding, Settings level card, classifier on import, Speaking prompt card) renders/activates only when `activeExam === "ielts"`. CET profiles see none of it.
2. **Classifier**: one master prompt (`ielts-content-level`), one endpoint `POST /api/ai/classify-content-level`, stores `level` into `contents.cefr` + `{confidence, summary}` into a new `contents.cefr_meta` JSON column. Never invents: AI failure → level stays/becomes `unknown`; mock provider returns a deterministic B1 classification for offline operation (labelled mock as everywhere).
3. **Import pipeline**: extraction/analysis unchanged; after local analysis, if AI is live AND exam is IELTS → classify (one call per new content; fingerprint dedup already prevents re-import re-calls). Result card shows `B1 · Reading` (or `Level not analyzed yet · [Analyze with AI]`).
4. **Above-level imports**: not rejected; result card adds a quiet "a little above your current level" note when classified level > learner level +1 step.
5. **Speaking card** (external page, IELTS only): today's task = CEFR-level template (A2/B1/B2/C1 prompt profiles) + the learner's top weak expression woven in; `[ Copy prompt ]` + `[ Open ChatGPT Speaking Coach ]`.
6. **Migration**: existing `contents.cefr` values are pre-existing corpus annotations — kept as-is (documented). Nothing is silently re-classified; a per-content `[Analyze with AI]` re-run overwrites with AI results. `cefr_meta` column defaults `{}`.

## Out of scope

CET-4/CET-6 anything; automatic external-test verification (integration doesn't exist); making CEFR a hard filter; classifying content for CET profiles.
