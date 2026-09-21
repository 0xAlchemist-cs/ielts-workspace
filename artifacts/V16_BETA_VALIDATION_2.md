# V16-Beta Validation 2 — Post-Hardening Black-Box Regression

Date: 2026-09-20 · Method: black-box browser first (no source/DB reads until
after observation); CET-6 sandbox (test identity, zero real-user pollution);
activeExam restored to ielts at end. 8 screenshots in artifacts/beta-validation2/.

**This is a test sandbox, not a fresh production IELTS account.**

## A — Cold Start Regression — PASS

```text
Today        → "5 activities · ~24 min" (single source, no range) — CTA visible
Session      → "1 of 5 · 0/24 min" — cold-start text shown ("Your bank is empty")
             → Start button → /chunks?tab=discover (deep link works)
             → Finish button DISABLED + guard hint present
Discover     → deep-link opens Discover tab (not bank)
             → save one expression (real, from corpus)
Session      → return → cold text GONE, normal copy ("While reading…")
             → finish button UNLOCKED (server-state unlock, no fake evidence)
USE IT       → "2 of 5 · 3/24 min" → Start → /chunks (normal bank, has the saved item)
Complete     → all steps walked → "Today's learning complete" + Back to Today
Today        → "All done" + Tomorrow projection line
DB           → 1 chunk (real save), mission completed, 1 retrieval item — zero fake evidence
```

## B — Today/Session Consistency — PASS

After full session completion:
- Today: "All done" (no stale count), Tomorrow line present, expression card shows saved item
- Session: complete screen with Back to Today — no dead loop

During session: "5 activities · ~24 min" on Today ⇄ "1 of 5 · 0/24 min" in
Session — same numbers from the same source. Denominator stable: 1/5 → 2/5
(NOT 1/4).

## C — Discover → Session Resume — PASS

Navigated away mid-session → returned via /session → position intact.
Post-completion: refresh + browser-back both land on complete screen (H1/H2).

## D — Wrong Practice — NOT EXERCISED in this sandbox

The CET-6 sandbox has no IELTS reading error data. Service-level covered by
test:wrong-practice 19/19 (in CI gate). UI walkthrough would require IELTS
error rows — declined to avoid polluting real user.

## E — Review Integrity — PASS

/review under CET-6: items present, **zero dirty prompts** (no "Q3: E", no
"decoration → essential infrastructure"). The 8 corrupt DB pairs are silently
skipped at generation.

## F — Progress Consistency — PASS

/profile: CEFR displayed, goal section present, readiness states honest
("Not enough evidence yet" / "Building" — correct for this user's evidence
level). Zero internal jargon leaked (no topGap/readinessState/retrieval_items).

## G — Exam Isolation — PASS

DB-level proof: "end up doing" appears as 4 separate rows (corpus seed NULL,
user 8, CET-4 user 341, CET-6 user 342) — **zero cross-owned chunks** (each
user's rows carry only their own user_id). The shared corpus expression in
Discover is by design, not a leak. CET-6→CET-4→IELTS round-trip: identity
switches correctly at each step.

## H — Refresh/Back/Retry — PASS

- Refresh mid-complete: state persists (server-rendered from mission status)
- Browser back: lands on previous page, no error/broken state
- No duplicate session creation observed

## Anomalies found

None. All 8 chains behaved as hardened. The single observation (G3 isolation
test initially flagged "end up doing" in IELTS bank) was resolved as shared
corpus in Discover tab — not a leak; DB-level cross-ownership check confirms 0.

## Sandbox footprint

CET-6 residue user: 1 chunk, 1 retrieval item, completed mission (all test
data, not real learning). Real IELTS user untouched (18 chunks, all own).
activeExam restored to ielts.
