# V13 AI API Review

## Gateway

The existing `getProvider() / FallbackProvider` in `src/lib/ai/index.ts` IS the AI Gateway — no new client needed. All 9 AI routes under `/api/ai/` + 3 CET routes under `/api/cet/` call `getProvider()` and never touch raw API keys or URLs. **Zero direct `fetch("https://...")` calls exist in business code** (verified by audit).

## Configuration

Centralized in `loadAIProviderConfig()` (reads `app_config` table — baseURL/apiKey/model set from Settings UI). Changing provider/model is a Settings change, not a code change. No module has its own AI config.

## API structure

- 9 IELTS/shared routes under `/api/ai/*` (word, sentence, retrieval, speaking, writing, paraphrase, tutor, drills, classify-content-level)
- 1 CET route under `/api/cet/writing-feedback` (CET-specific task; would merge into `/api/ai/cet-writing-feedback` if more CET AI tasks emerge — but the exam scoping is in the Registry, not the route)
- 2 CET practice routes (`/api/cet/tasks`, `/api/cet/exam`) — not AI routes (grading + timer are local logic)
- All POST routes input-gated (`verify:input-gates` suite)

## What changed from V12

- **EXAM_AWARE injection** → **Prompt Resolver** (`resolvePrompt` in registry.ts): every task now goes through the same composition pipeline (Module + Exam + CEFR + Base). The old scattered EXAM_AWARE boolean map is deleted.
- **CEFR level context**: previously NO AI prompt received CEFR; now word/sentence/speaking/writing/paraphrase/tutor get real CEFR-level behavioral instructions (A2-C1) under IELTS.
- **Injection guard**: previously absent; now every composed prompt includes the UNTRUSTED CONTENT GUARD.
- **Retry**: previously single-attempt; now timeout/429/5xx retry once with backoff.

## What did NOT change (by design)

- Provider interface, zod schemas, API route contracts, FallbackProvider behavior
- Learning Intelligence: Planner/Memory/Readiness/Rotation make all scheduling decisions; AI is analysis-only
- Speaking prompt generation (local template, not AI)
- Generation judging (local heuristic, not AI)

## Regression

All 18 suites individually green (smoke 25, pm 27, engine 18, rotation 9, loop 25, writing-gate, input-gates, import 33, exam 26, planner 18, need 7, memory 12, readiness 12, cet 23, cet-completion 20, **ai 31**, v9v10 57) + build + test:data + test:security + verify:product.

## Remaining notes

- Pre-existing pm→loop sequential-run isolation issue documented in V12.2.1 review (not a V13 regression).
- Caching: content-level classification deduplicates via content fingerprint at import; the classify endpoint itself doesn't cache (single content, single call — caching would be redundant).
