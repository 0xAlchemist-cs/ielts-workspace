# V7 Beginner-First Review

Date: 2026-09-15 · Commit follows `e4f8102` (V6). Plan: `V7_BEGINNER_FIRST_PLAN.md`.

## 1. What V7 actually changed (Phase-0 gap analysis first)

V5/V6 had already shipped most of the spec (4-link nav, one-card Today, Prompt→Answer→Feedback→Next practice, staged import copy, bilingual modes, primary-surface terminology sweep, onboarding loop + category tour). V7 fixed the five remaining gaps:

| Gap | Change |
|---|---|
| G1 Welcome entry | `/welcome` is now a chooser: **[Start your first session]** → guided loop (primary), "Look around first (30s)" → category tour, quiet **Skip** → Today (sets tour_done). Loop is no longer buried behind the tour; skipping is finally possible. |
| G2 Chunk bank | Strength numbers (badges + progress bars) → human states: **Ready to use 可以用了 / Getting stronger 越来越熟 / Needs practice 需要练习**. "Retrieval session" → **Practice 练习**. Detail drawer keeps one labeled bar ("How well you know it"). Backend 7-state model untouched. |
| G3 Reading header | `topic · C1 · ●●●○○` → `topic`. CEFR/difficulty never guided a next action. |
| G4 Library entry | h1 "Content & Input" → **Library**; banner "Real English input → analysis → LanguageItems → Retrieval…" → **"Bring your English materials — we'll turn them into learning."**; tabs "📚 My Content / ＋ Add Content" → **My materials / ＋ Import**. |
| G5 Progress | Statements + "What to focus on" stay; ALL numeric/chart cards (metrics row, skills grid, mistakes patterns, 14-day trend, listening misses, trajectory, efficiency, weekly, phone) collapse behind one **"Show the numbers"** toggle (persisted per browser). Default view: statements only. |

## 2. Information density (measured, production build)

| Page | Buttons | Sections | Metrics | Notes |
|---|---|---|---|---|
| `/` (Today) | 2 | 2 | ~5 (date/day/due/min) | unchanged from V5 — already minimal |
| `/review` (Practice) | 6 | 1 | 0 | one item, one action |
| `/chunks` | — | — | 0 strength numbers | content-card grid (entry count = user's own bank, not chrome); human states instead of scores |
| `/profile` default | 8 | 4 | statements' own band figures | was ~13 card sections + chart wall before; numbers now opt-in |
| `/profile` expanded | 30 | 17 | 34 | unchanged detail, behind disclosure |

## 3. Browser validation

- Welcome chooser: three doors verified (loop link / tour link / Skip button; Skip sets tour_done + lands on Today).
- Profile disclosure: default hides all charts (0 chart elements); "Show the numbers" expands everything and flips to "Fewer numbers"; persists via localStorage.
- Chunks: "Getting stronger"/"Needs practice" states render; zero numeric strength badges; "Practice 练习" CTA.
- Responsive 1440×900 / 1280×800 / 1024×768: no horizontal scroll on `/`, `/profile`, `/chunks`.

## 4. Regression

`verify:all` (lint 0 errors · tsc · smoke 25 · pm 27 · engine 18 · rotation 9 · loop 25 · writing-gate · input-gates · **import 23**) ✓ · `verify:product` ✓ · `test:data` OK (2 known historical advisories) ✓ · `test:security` 3/3 ✓ · production `build` ✓. V6 import pipeline, dedupe, OCR/PDF/DOCX/audio paths untouched and re-tested.

## 4b. Terminology machine re-scan (post-sweep commit d4b5b32)

Full-site visible-text scan (11 routes × 13-term dictionary): every route **CLEAN**. Fixes in the sweep: "IELTS Engine"→"IELTS Practice", the "engine reads your Weakest Link, Error Bank, Retrieval Queue, and LanguageItem strength" sentence→"picked for you based on what you've been getting wrong…", chunk-bank header, writing "Transfer/迁移" stage→"Use it again 再用一次", home expression tag "Due for retrieval"→"Time to review 该复习了". Deliberately kept: CEFR in the profile baseline form (user config, not surfaced learning state).

## 4c. Fresh-user 9-step pass (final build)

welcome chooser → loop entry → Today (1 primary button, human tags) → Library ＋Import → open material (/read/1) → Practice item renders — all ✓, 0 console errors.

## 5. Remaining complexity (deliberate)

- `/chunks` and `/library` show many cards — that's the learner's own material volume, not UI noise.
- Statements on `/profile` intentionally contain band figures ("your listening leads at 7.0") — evidence, not dashboards.
- Advanced detail (trajectory, efficiency, weekly) remains one click away for the data-curious learner.
