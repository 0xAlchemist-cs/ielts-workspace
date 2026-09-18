# V13 AI Audit

Date: 2026-09-18 · Every AI call, prompt, schema, and endpoint in the tree.

## Inventory

| # | Module | API route | Prompt source | Exam-aware | CEFR-aware | Structured | Duplicated | Hardcoded | Migration |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Word analysis | `/api/ai/word` | `WORD_PROMPT` (tasks.ts) | ✓ via EXAM_AWARE | ✗ | ✓ zod | — | TUTOR_PERSONA embedded | → Registry |
| 2 | Sentence analysis | `/api/ai/sentence` | `SENTENCE_PROMPT` | ✓ | ✗ | ✓ | — | TUTOR_PERSONA | → Registry |
| 3 | Retrieval grading | `/api/ai/retrieval` (used via review) | `RETRIEVAL_PROMPT` | ✗ (neutral by design) | ✗ | ✓ | — | — | → Registry |
| 4 | Speaking feedback | `/api/ai/speaking` | `SPEAKING_PROMPT` | ✓ | ✗ | ✓ (IELTS bands) | — | "IELTS" in prompt | → Registry (IELTS-specific) |
| 5 | Writing evaluation | `/api/ai/writing` | `WRITING_PROMPT` | ✓ (but prompt hardcodes IELTS examiner) | ✗ | ✓ (IELTS bands) | — | "IELTS Writing examiner" | → Registry; CET writing needs own |
| 6 | Paraphrase | `/api/ai/paraphrase` | `PARAPHRASE_PROMPT` | ✓ | ✗ | ✓ | — | — | → Registry |
| 7 | AI Tutor | `/api/ai/tutor` | `TUTOR_PROMPT` | ✓ | ✗ | ✓ | — | TUTOR_PERSONA | → Registry |
| 8 | Parallel drills | `/api/ai/drills` | `DRILL_PROMPT` | ✗ (neutral) | ✗ | ✓ | — | — | → Registry |
| 9 | Content level classification | `/api/ai/classify-content-level` | `IELTS_CONTENT_LEVEL_PROMPT` | ✗ (IELTS-only by design) | ✗ | ✓ | — | — | → Registry (IELTS-specific, stays out of EXAM_AWARE) |
| 10 | CET writing/translation feedback | `/api/cet/writing-feedback` | `CET_WRITING_FEEDBACK_PROMPT` | ✗ (CET-only by design, exam passed in payload) | ✗ | ✓ | — | — | → Registry (CET-specific) |
| 11 | Generation (own-sentence judge) | `/api/ai/generation` | — (local heuristic, no AI) | n/a | n/a | n/a | — | — | stays local |
| 12 | IELTS Speaking Prompt | `/external` page | `speaking-tasks.ts` (local template, no AI call) | ✓ (IELTS only) | ✓ (A2-C1 pools) | n/a (template) | — | — | stays local template |
| 13 | Exam prompt profile | injected into EXAM_AWARE tasks | `prompts/profiles.ts` | ✓ | ✗ | n/a | — | — | → part of Resolver |

## Key findings

1. **EXAM_AWARE injection** (openai-compat.ts L56): word/sentence/tutor/paraphrase/speaking/writing get exam context appended. Retrieval/drills/classifyContentLevel stay neutral. CET writing feedback receives exam in its payload. **This IS the Prompt Resolver in embryo** — V13 formalizes it.
2. **TUTOR_PERSONA is embedded in 5 prompts** (word, sentence, speaking, tutor + paraphrase?) — shared base rules copy-pasted. V13 extracts to Base Prompt.
3. **IELTS hardcoded in WRITING_PROMPT** ("IELTS Writing examiner") even though it's EXAM_AWARE — CET learners get "IELTS examiner" + CET context appended. Needs split.
4. **SPEAKING_PROMPT uses IELTS band scoring** (4-9) — correct for IELTS; CET never calls this route (no CET speaking).
5. **No CEFR-level differentiation in any AI prompt** — the only CEFR-aware piece is `speaking-tasks.ts` (local template, not AI). V13 adds real CEFR-level prompts for IELTS tasks that need them.
6. **Structured output**: all 10 AI tasks use zod schemas — already good.
7. **Error handling**: FallbackProvider catches all live failures → mock. Good baseline; V13 adds unified error taxonomy + retry for transient failures.
8. **No prompt injection guard**: user text goes into AI payloads without "this is source content, not instructions" framing.
9. **No prompt versioning**: prompts are anonymous strings.
10. **No caching**: content-level classification re-runs on demand (import dedupes by fingerprint, but the classify endpoint doesn't cache).

## What already works well (keep)

- Single provider interface (`AIProvider`) + `getProvider()` factory + `FallbackProvider` — this IS the AI Gateway
- zod schemas on all 10 tasks — structured output already universal
- Config centralized (`loadAIProviderConfig` reads app_config, never hardcoded)
- `examPromptProfile()` in prompts/index.ts — exam layer already composable

## Migration plan

1. **Prompt Registry** (`src/lib/ai/registry.ts`): every task gets `{id, version, systemPrompt, responseSchema}` — one lookup replaces scattered string constants.
2. **Prompt Resolver** (`src/lib/ai/resolver.ts`): composes Base + Exam + CEFR (IELTS only) + Module + Injection guard. Replaces EXAM_AWARE injection.
3. **Base Prompt**: extract TUTOR_PERSONA into `prompts/base.ts` with the injection guard added.
4. **Exam layer**: keep `profiles.ts` (already good); wire into Resolver.
5. **CEFR layer** (IELTS only): new `prompts/cefr.ts` with real behavioral differences for A2/B1/B2/C1 — affects task selection (question difficulty), feedback depth, language complexity expectations.
6. **Writing split**: IELTS writing prompt stays; CET-4/CET-6 writing feedback already separate (`CET_WRITING_FEEDBACK_PROMPT`) — wire both through Registry.
7. **Error taxonomy + retry**: add to openai-compat for timeout/429/5xx.
8. **Prompt versions**: each registry entry carries `v1` suffix.
