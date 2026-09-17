# V11 7-Day Memory Simulation

Derived from the `test:memory` suite's seeded evidence chains (real service calls, temp users, cleaned after):

| Day | Simulated behaviour | Memory state after | Planner / downstream effect |
|---|---|---|---|
| D0 | 3 new expressions learned (chunks + retrieval items created) | empty state retires once ≥6 attempts exist; "learned 3 expressions" timeline entry | mission picks them as today's retrieval batch |
| D1 | retrieval failures ×6 across the 3 items (+ ladder misses recorded) | **challenge appears**: "Producing expressions without hints — 3 expressions recognised but not produced freely" | planner pressure ↑ (recentFailures) → balance shifts toward review; article recommendation boosts texts containing those expressions (V10.1 need-overlap) |
| D2 | successful retries ×2 per item | challenge still listed but improvement window starts collecting successes | intervals regrow (engine); speaking task weaves the weakest expression |
| D3 | new article read, 3 more expressions saved | timeline: "You learned 3 new expressions this week" | content rotation novelty applies |
| D4 | each expression used in own writing (generation_pass ×3) | — | writing-helps pattern evidence accumulates (1/3 items) |
| D5 | delayed retrieval success ×3 (all written-then-recalled) | **pattern emerges**: "Writing helps them stick — 3 expressions used in your writing and later recalled" | plan why-line gains "Writing helps your expressions stick — today's transfer step is worth finishing"; improvement insight appears (early-fail → recent-success window ≥20pts) |
| D6 | forgetting on a different older item (early ok → 8-day-gap fail ×3 items) | **pattern emerges**: "Needs one more review after a break"; unstable note "getting better, but still drops" | plan why-line switches to "lean toward keeping things fresh"; forgetting items pulled to tomorrow (engine) |

Memory evolves at every step: no insight before threshold, insights appear with counted evidence, and later evidence re-shapes them.
