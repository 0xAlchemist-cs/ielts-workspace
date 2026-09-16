# V9 CEFR Migration

Date: 2026-09-16 · Deterministic and additive.

## Rules

| # | Rule | Rationale |
|---|---|---|
| 1 | New column `contents.cefr_meta` (JSON: `{confidence?, summary?}`) defaults `{}` — no existing row changes | Evidence storage for AI classification; empty = never AI-classified |
| 2 | Existing `contents.cefr` values are **pre-existing corpus annotations and are kept as-is** — nothing is silently re-classified | The seeded corpus was hand-annotated during corpus construction; overwriting with model output would destroy human labels |
| 3 | Imported material: the local heuristic estimate still fills `contents.cefr` at insert, but it participates in **ranking only** — the UI never displays a level that lacks `cefr_meta` evidence (shows "Level not analyzed yet" + `[Analyze with AI]` instead) | Honest display without schema churn (the column is NOT NULL and four-valued); documented deliberately |
| 4 | AI classification (auto on IELTS import with live AI, or on-demand) writes `cefr` + `cefr_meta` together — a validated level replaces the heuristic | One source of truth: `cefr_meta` present = analyzed |
| 5 | Failure paths: no AI configured / API failure / malformed output → no write, level stays unanalyzed; the endpoint returns a clear error and the UI keeps the `[Analyze with AI]` affordance | Never persist an invalid classification; never block import |
| 6 | Learner level (`learning_profiles.cefr`) is untouched by migration; per-exam isolation from V8 already gives each profile its own level row | No cross-profile contamination possible |

## Roll-back

Drop `cefr_meta` (or ignore it) — everything else is additive. No data was rewritten.
