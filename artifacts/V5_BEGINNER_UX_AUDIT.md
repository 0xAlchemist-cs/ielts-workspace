# V5 Beginner UX Audit

Date: 2026-09-13 · Scope: live V4 tree (all pages), pre-implementation audit.
Note: `artifacts/UI_FORENSIC_REPORT.md` does not exist in this repo — this audit
was performed directly against the running V4 implementation (build of commit
ff2aba9 + working tree).

Test question applied to every element:
**"If a beginner sees this, does it help them complete their next learning action?"**

---

## 1. First screen (`/` — "Mission Control")

| # | Element (current) | Verdict | Reason / destination |
|---|---|---|---|
| 1 | Date + "Day N" caption | KEEP | Orientation, zero cost |
| 2 | Greeting headline | KEEP | Calm, human |
| 3 | Today's expression card (expression + meaning + example + Listen) | KEEP | The one daily touch; primary-ish but quiet, single CTA |
| 4 | Mission card label "Today's Mission 今日任务" | KEEP (retitle "Today's practice") | "Mission" is our internal loop name |
| 5 | Mission title "Build your reading → Vocabulary skill." | REWRITE | Engine vocabulary (skill → subSkill path); replace with human action line "Learn & use N expressions" |
| 6 | est minutes · N steps · N items due line | MERGE | Keep one quiet line, drop "steps" (state machine exposure) |
| 7 | WHY TODAY — 3 engine rationale bullets | REMOVE | Engine-speak ("Focus: listening → …"); replace with ONE human line |
| 8 | "After this session" checklist (3 lines) | REMOVE | Explains the system instead of starting it |
| 9 | Lite-mode toggle chip | KEEP (revised) | One small real control; removing it orphans the feature. Survives on the practice card as a quiet chip |
| 10 | Start / Resume mission button | KEEP | THE primary action |
| 11 | Journey — 7-node spine (Read·Listen·Notice·Deep·Retrieve·Speak·Transfer) | REMOVE | The internal state machine, drawn. Biggest single leak on the page |
| 12 | "What changed today" evidence list | MOVE → /profile | Felt progress belongs to Progress, disclosed |
| 13 | Review / Continue Learning two-column grid | REMOVE | Review = PRACTICE nav item; Continue = LIBRARY |
| 14 | "Your English" 4 bars + trend arrows | MOVE → /profile | Metrics wall on a starting point |
| 15 | EvidenceFunnel (5-stage honest bars) | MOVE → /profile | Valuable, but tertiary |
| 16 | "N items waiting tomorrow" caption | REMOVE | Noise |
| 17 | **Missing entirely: a beginner entry** — a first-time user with no history lands on the same dashboard | ADD | /welcome guided loop + beginner branch on `/` |

Resulting homepage (regular): greeting → expression card → practice card (title + 1 why line + counts + Start) → small progress line. Beginner: greeting → one welcome card + [Start your first session].

## 2. Navigation (sidebar: 13 links + Settings)

| Current | Verdict |
|---|---|
| Today `/` | KEEP (primary) |
| Practice fold: Reading, Listening, Writing, Speaking, IELTS, Mock, Review (7) | COLLAPSE → primary **PRACTICE = `/review`**; Reading/Listening live inside LIBRARY as type chips (already exist); Writing/Speaking/IELTS/Mock → secondary |
| Library fold: Content, Language, Mistakes | COLLAPSE → primary **LIBRARY = `/library`**; Language + Mistakes → secondary |
| Progress `/profile` | KEEP (primary) |
| AI group: AI Lab | MERGE into secondary |
| Settings (footer) | KEEP |

New nav: **TODAY · PRACTICE · LIBRARY · PROGRESS** (4 primary links) + folded "More" secondary group (Writing, Speaking, IELTS & Mock, Mistakes, Language, AI Lab). 13 visible → 4 visible by default.

## 3. Topbar

| Element | Verdict |
|---|---|
| Section title "Mission Control 主控台" for `/` | RENAME → "Today 今日" |
| "AI Live / Mock AI" status chip | HIDE text → colored dot with tooltip (infrastructure status, not learner info) |
| 中英/沉浸 segmented control, theme, profile, settings icons | KEEP |

## 4. Review session (`/review`) — closest already to PROMPT→ANSWER→FEEDBACK→NEXT

| Element | Verdict |
|---|---|
| Tagline "Spaced retrieval — seeing ≠ learning." | REWRITE → "Answer from memory — that's what makes it stick." |
| Category labels: overdue 逾期 / weak retrieval 提取薄弱 / retention check 留存检验 / at risk 遗忘风险 | REWRITE → Needs practice / Often forgotten / Do you still remember? / Starting to slip |
| Summary line: "N items · ~M min · 30d accuracy X% · 2 overdue · 5 weak retrieval…" | SIMPLIFY → counts in human words, drop accuracy + category tally |
| "Error revenge 错误复仇" link | RENAME → "Practice my mistakes" |
| "Forgetting detected — retention halved, priority boosted." | REWRITE → "You knew this before — it's starting to slip, so we'll see it more often." |
| "Retention 留存 51 · Strength 强度 63" numbers | REMOVE (metrics; scheduling already speaks through the next due date) |
| MODE_LABEL set | LIGHT REWRITE (cued_recall → "Recall the word"; retention_check → "Do you still remember this?") |
| Progress bar + N/M position, Check / I can't retrieve it, teach panel, Try again | KEEP — already the right shape |

## 5. Onboarding

| Element | Verdict |
|---|---|
| `/onboarding` baseline form (CEFR + band self-rating + 3 weakness grids + quick-start) | DEMOTE — form-first asks the learner to configure a system they haven't used. New first-run entry = `/welcome` guided loop (teach by doing); `/onboarding` stays reachable by URL for baseline config. `requireUser()` redirect target changes `/onboarding` → `/welcome`. |

## 6. Profile (`/profile`) — the disclosure surface, may stay rich

| Element | Verdict |
|---|---|
| Absorbs: What-changed-today list, Your English bars, EvidenceFunnel | ADD (moved from homepage) |
| "Weakest Link · Mission targets this" | RENAME → "What to focus on · today's practice targets this" |
| "⚠️ Recurring Error Patterns" + "The system groups isolated errors into patterns and schedules them for retrieval" | REWRITE + drop emoji → "Mistakes that keep coming back" + human subtitle |
| "🎧 Diagnosed Miss Causes" / "⚡ Learning Efficiency" / "📋 Weekly Review" / "📱 Phone" card titles | DROP EMOJIS (V1 rule) → plain titles |
| Baseline / Language display / Export | KEEP |

## 7. Counted leaks (before → after)

| Measure | Before | After |
|---|---|---|
| Primary nav links visible | 13 + settings | 4 + folded secondary + settings |
| Homepage sections above the fold | 8 (mission, why×3, after-session, journey, evidence, review/continue grid, bars, funnel) | 2 (expression card, practice card) + 1 progress line |
| Simultaneously exposed learning concepts on `/` | ~9 (notice/retrieve/speak/transfer steps, funnel 5 stages, trends, weakest link) | ≤2 |
| Visible metrics on `/` | ~15 numbers | ≤3 (items due · minutes · today's counts) |
| System terms in primary UI | Mission Control, retrieval urgency, retention, strength, overdue, at-risk, transfer | 0 in primary; human equivalents |

## 8. Not touched (constraint compliance)

Engines (priority/retrieval/retention/mission/scoring), data models, API contracts, /read /listen /writing labs' internal flows, mock exam. All changes are presentation-layer + one new guided route that calls existing APIs.
