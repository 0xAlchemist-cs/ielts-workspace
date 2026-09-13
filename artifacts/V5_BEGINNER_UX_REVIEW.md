# V5 Beginner UX Review

Date: 2026-09-13 · Validation of the V5 beginner-first simplification
(commit `d13e2b2` on the combined tree; `npm run verify:all` green: 0 lint
errors, tsc clean, 25+27+18+9+25 smoke/pm/engine/rotation/loop +
writing-gate + input-gates all passed).

Validation method: full browser walkthrough with Playwright against the
production build at 127.0.0.1:3000, walking `/welcome` end-to-end **with real
data writes** (live AI provider), plus DOM-metric extraction on every changed
screen. Screenshots: `v5-home-after.png`, `v5-welcome-step1.png`.

---

## The spec's test scenario, answered

> Open product → know nothing → find what to do → complete onboarding →
> complete first loop → start next practice → explain why that item appeared.

| Step | Result |
|---|---|
| Open app (zero history) | Homepage shows ONE card + ONE button: "Start your first session" — no nav comprehension needed |
| Find what to do | Single primary button, visible in the first viewport (~5 s criterion met) |
| Complete onboarding | /welcome: Welcome → Read ("Booking a Restaurant Over the Phone") → Notice ("I was wondering if" — guess first, then reveal) → Recall (zh prompt, typed answer, real AI graded "You remembered it.") → Use (own sentence, AI accepted) → Done |
| Time to complete | **2 min 29 s** measured (15:17:06 → 15:19:35), including snapshot pauses; well under the 5-min target |
| Loop writes real data | chunk cloned to user bank + retrieval item + review_history row + generation pass + chunk activated — homepage progress line immediately showed "Today · 1/1 recalled · 1 used" |
| Start next practice | Completion CTA → homepage → "Start" |
| Explain why an item appeared | Every review item carries a human why ("needs practice 该练了", "starting to slip 开始生疏"); homepage says "These need more practice based on your recent activity." A beginner can paraphrase this without knowing what a retrieval engine is |

## Measured before → after

| Measure | V4 before | V5 after |
|---|---|---|
| Primary nav links visible | 13 + Settings (groups expanded by default) | **4** (Today/Practice/Library/Progress) + folded "More" + Settings |
| Homepage sections above the fold | 8 (mission + why ×3 + after-session checklist + 7-node journey + evidence list + review/continue grid + skill bars + funnel) | **2** (expression card, practice card) + 1 quiet progress line |
| Simultaneous learning concepts on `/` | ~9 (notice/deep/retrieve/speak/transfer steps, funnel stages, trends, weakest link) | **≤ 2** (retrieve-from-memory, needs-practice) |
| Visible metrics on `/` | ~15 numbers | **≤ 5** (date, day, due count, minutes, today's counts) |
| Visible buttons/controls on `/` | Start + 7 journey node links + 2 section links + expression CTA | **Start** + expression text-link + Lite chip |
| Engine terms in primary UI | Mission Control, spaced retrieval, overdue, weak retrieval, retention check, at risk, retention/strength scores, error revenge | **0** — regex sweep `/(overdue\|weak retrieval\|retention check\|at risk\|Spaced retrieval\|Retention \d\|Strength \d)/i` returns false on /review |
| First-screen primary actions | multiple competing CTAs | exactly 1 |
| Console errors during full walkthrough | — | **0** |

## What moved where (nothing lost)

- What-changed-today evidence list → `/profile` ("What changed today" + honest funnel — real counts now wired, previously zero placeholder)
- Skill bars / trends / funnel / tomorrow preview → `/profile` (the disclosure surface)
- Reading & Listening nav items → inside Library as type chips (already existed)
- /onboarding baseline form → still reachable by URL; first-run entry is now /welcome (requireUser redirect updated)

## Beginner usability findings

1. **The five-second test passes structurally**: beginner branch = one card, one button; regular homepage = one elevated practice card with one accent button.
2. **Teach-by-doing holds**: the wizard never names a module; each step is one sentence of instruction + one action. The Recall step's "From memory — that's what makes it stick" teaches the method's core belief in one line.
3. **Adaptivity is provable, not promised**: right after the loop, the homepage progress line shows the loop's real effects — the "your practice will adapt" claim is demonstrated, not asserted.
4. Residual watch-items (not blockers): the folded "More" group is where all capabilities live — a first-time user who *wants* writing/mock must open one fold (deliberate trade per spec Phase 6); profile remains information-dense by design (tertiary layer).

## Constraint compliance

No engine, scoring, retrieval, or data-model changes — the only new data path is `/welcome`'s server action, which calls the existing `saveCorpusChunk` (dedup + retrieval item + understood event) and existing `/api/review/answer` + `/api/ai/generation` endpoints. Beginner mode is a render branch (history-count query), not a separate product. No new analytics surfaced; several removed.
