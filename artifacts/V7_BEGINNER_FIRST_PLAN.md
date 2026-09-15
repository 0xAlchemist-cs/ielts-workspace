# V7 Beginner-First Plan

Date: 2026-09-15 · Phase 0 gap analysis against the **actual current state** (not the V5/V6 specs — the shipped code).

## 1. Already satisfied (V5/V6 shipped, V7 asks again — DO NOT redo)

| V7 phase | Current state | Verdict |
|---|---|---|
| 2 · Nav = TODAY/PRACTICE/LIBRARY/PROGRESS | Exactly this + folded "More" (default closed) + Settings footer | ✅ keep |
| 3 · Today = one practice card + Start + small counts | V5 homepage: "Learn & use N expressions" + one why line + Start + quiet progress line; beginner branch for zero-history users | ✅ keep |
| 7 · Retrieval = Prompt→Answer→Feedback→Next | Review session is exactly this shape since V5 | ✅ keep |
| 9 · Import = Importing→Understanding→Ready | V6 import panel walks these exact stages; parser names never shown | ✅ keep |
| 12 · Two language modes | 中英/沉浸 toggle; T renders zh only in bilingual mode | ✅ keep |
| 13 · Human language on primary surfaces | V5 swept review/profile/homepage ("needs practice", "starting to slip", "Practice my mistakes") | ✅ keep |
| 1 · Onboarding loop (Read→Notice→Recall→Use) | Exists, tested, writes real data — at `/welcome/loop` | ✅ exists |
| Onboarding category tour | Exists at `/welcome` (user-requested in a prior round) | ✅ exists |

## 2. Gaps — what V7 actually changes

| # | Gap | Where | Fix |
|---|---|---|---|
| G1 | Welcome entry has no **Skip**, and the guided session is buried behind the tour (user's earlier correction) while V7 wants it primary with skip | `/welcome` | Welcome screen becomes a chooser: primary **[Start your first session]** → loop; secondary "Look around first 先逛一圈" → tour; quiet **Skip** → set tour_done → Today. Tour stays at `/welcome/tour`. |
| G2 | Chunk bank shows **strength numbers** (43/100 badges + progress bars), "Retrieval session" button, "strength is earned by producing them" | `/chunks` | Map strength→human states: ≥70 **Ready to use**, ≥40 **Getting stronger**, else **Needs practice**; drop the number + bar; rename button **Practice**; human footer line. (Backend 7-state model untouched.) |
| G3 | Reading page header leaks content metadata: `topic · C1 · ●●●○○` | `/read/[id]` | Keep topic; drop CEFR + difficulty dots (they never guide the next action). |
| G4 | Library entry reads like a subsystem: tab "＋ Add Content", banner "Real English input → analysis → LanguageItems → Retrieval…" | `/library` | Tab → "＋ Import 导入"; banner → "Bring your English materials — we'll turn them into learning. 带上你的英语材料——我们把它变成能学的东西。" |
| G5 | Progress page: statements exist but 5 metric Stat-cards + 4 chart cards + skills grid pile up beneath = analytics wall | `/profile` | Statements + "What to focus on" stay; everything numeric/charted collapses behind one **"Show the numbers 显示数字"** disclosure (open state persists via localStorage). Details unchanged inside. |

## 3. Validation plan

- Density measurement before/after on `/` `/review` `/chunks` `/profile` `/library` (visible buttons, badges, metrics, sections).
- Fresh-user browser pass: welcome chooser → loop → Today → import a PDF → open it → one retrieval exercise.
- Responsive: 1440×900, 1280×800, 1024×768.
- Regression: `verify:all` (8 suites incl. V6 import) + `verify:product` + `test:data` + `test:security` + `build`.

## 4. Out of scope (explicitly)

No engine/scoring/state-model changes; no new features; no second importer; Reading Lab stays article-first (already compliant: focus mode hides ALL chrome, AI analysis opens contextually); Listening/Writing/Speaking labs untouched.
