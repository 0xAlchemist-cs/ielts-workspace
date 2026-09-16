# V9 CEFR Review

Date: 2026-09-16 · **IELTS-only personalization layer** — CET-4/CET-6 deliberately untouched.

## Shipped

| Surface | Behavior |
|---|---|
| First-time level step | IELTS welcome's primary CTA is "Let's find your starting level" → four described self-assessment cards → `Continue with B2` saves the level (server action) and enters the guided loop. Honest choice: the project has NO external level-test link, so none was invented (spec: reuse or don't fake). CET profiles skip the step entirely (primary stays "Start your first session"). |
| Settings · Learning level | New card (IELTS only): current level + `Change level` → four options → deliberate confirm ("materials and speaking practice will adapt. Your learning history stays exactly as it is.") → applied. |
| Progress | CEFR editing removed from the profile form — shown read-only with a pointer to Settings. |
| Content recommendation | Already CEFR-aware before V9 (`selectNextContent` scores ±1-level tolerance at 20% weight alongside weakness/rotation/novelty) — verified, unchanged; no second engine. |
| Import classification | IELTS imports with live AI get one classification call per new content (fingerprint dedup prevents repeats); level + evidence (`cefr_meta`) stored. Without AI or on failure: import completes, UI shows "Level not analyzed yet 难度未分析" + `[Analyze with AI]` (calls the endpoint on demand). Result rows show `B1 · Reading`; ≥2 levels above the learner adds "· 略高于你的水平". CET imports: no classification, no level UI. |
| Classifier | One master prompt (`ielts-content-level`): classifies the whole material's language (vocabulary/syntax/grammar/collocation/abstraction/cohesion/burden), never the learner, never topic prestige; uncertain → lower confidence. Zod-validated; invalid output never persisted. Mock provider returns a deterministic labelled B1 offline. |
| Speaking task | External Speaking page (IELTS only): "Today's speaking practice" card — CEFR-level task pool (A2 familiar/everyday → C1 nuance/qualification), day-rotated, woven with the learner's top weak expression from their own practice queue ("Try to naturally use … if it fits"); `[Copy prompt]` + `[Open Speaking Coach]`. Human words only. |

## Verification

- `test:exam` extended 14 → **18 checks** (in `verify:all`): speaking tasks differ per level; weak-expression weaving; classifier honesty rules in prompt; classification round-trips through the provider (mock labelled).
- Full battery: `verify:all` (lint 0 errors · tsc · 9 suites) · `verify:product` · `test:data` · `test:security` · `build` — all green.
- Browser walkthrough (production): welcome level step → save B2 → guided loop entry ✓; Settings card shows B2, change flow with history-preserving confirm → C1 → back to B1 (user's original level restored) ✓; Speaking card renders B1 badge, B1 question, copy + open buttons ✓.
- Fixed during walkthrough: welcome chooser had reintroduced a nested `<main>` (regression from the V7 a11y rule) — back to div.

## CET isolation

Every V9 surface is gated on `activeExam === "ielts"`: welcome level step (`needsLevel` prop), Settings card (`learningLevel` undefined for CET), import classification (`exam === "ielts"` in the service), classify endpoint (400 for non-IELTS), Speaking card (`speaking = null`). CET behavior is byte-identical to V8.
