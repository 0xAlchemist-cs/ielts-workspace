# V7 Corpus UX Plan

Date: 2026-09-16 · Goal A = corpus center in Library; Goal B = beginner-first (mostly shipped already — this plan is the Phase-0 gap analysis for both).

## A. Current state (verified in code, not assumed)

V6 shipped: single-file import (12 formats promised+tested), two-layer dedup (file sha256 + text fingerprint), `imported_resources` registry with status (`ready|duplicate|needs_attention|needs_transcription|failed`) + human `error` strings, uuid storage + safe serving, `verify-import` (23 checks) in `verify:all`. Beginner rounds shipped: 4-link nav + flat secondary list, Today = one card one Start, onboarding chooser (loop/tour/skip), category tour, Prompt→Answer→Feedback→Next practice, human learning states (Ready to use/Getting stronger/Needs practice), full-site terminology machine scan CLEAN, profile numbers behind disclosure, honest import copy (audio/video = stored for listening, no auto-transcription).

## B. Goal B (Phases 14–23): already satisfied — no rework

| Spec phase | Status |
|---|---|
| 15 onboarding (Welcome→Read→Notice→Recall→Use→Complete) | ✅ /welcome chooser → /welcome/loop, teaches by doing, no architecture words |
| 16 nav TODAY/PRACTICE/LIBRARY/PROGRESS + secondary | ✅ |
| 17 Today = one practice card + Start + small counts | ✅ |
| 18 human language | ✅ machine-scanned CLEAN on all routes |
| 19 hidden learning states (human 5-state vocabulary) | ✅ chunk bank + review + home |
| 20 reading is reading (contextual tools, focus mode) | ✅ article-first + focus hides all chrome |
| 21 retrieval Prompt→Answer→Feedback→Next | ✅ |
| 22 progress = statements first | ✅ numbers behind persisted disclosure |
| 23 information reduction | ✅ measured (density tables in V7_BEGINNER_FIRST_REVIEW) |

## C. Goal A gaps — what this round builds (reuse V6, no second importer)

| # | Gap | Plan |
|---|---|---|
| G1 | Multi-file + folder import | Upgrade the SAME drop-zone: `multiple` + a second picker with `webkitdirectory`; each file goes through the existing `POST /api/import`; new optional `relPath` form field preserves the folder path (`Reading/article1.pdf`) into `meta.folder` after sanitizing — schema unchanged (meta is JSON) |
| G2 | Batch report | Client aggregates the per-file responses: "N files found · X ready · Y already in your library · Z need attention · W unsupported/failed" + expandable groups (Ready / Duplicates / Needs attention / Failed), each failed item shows its existing human error + a Retry button (re-pick that file) |
| G3 | "What needs AI?" | Truthful classification: **every step in this pipeline is local** (extraction, OCR, analysis — no AI key needed, verified). So the report says "Processed entirely on this machine — no AI needed." The only AI-adjacent hole (audio/video transcription) is already labelled "not currently available". No fake `ai_required` states invented. |
| G4 | Corpus health summary | One quiet line above the imports list: `N materials · X ready · Y need attention` — computed from `imported_resources` (ready+duplicate count toward learnable), no parser/hash/queue internals |
| G5 | Status filters | Three chips on the imports list: All / Ready / Needs attention — nothing more |
| G6 | One-click delete all | `[ Delete all materials ]` with a confirmation dialog listing real counts (imported files, their content items, upload storage freed). Scope: ONLY V6-imported rows (`imported_resources` + the `contents` they created + `data/uploads` files) — the seeded Cambridge corpus is NOT user-imported and stays untouched. Server action with deliberate confirm string. |
| G7 | One-click re-import | "Import folder again" = the same folder picker; V6 dedup guarantees no copies ("already in your library"). No new machinery. |
| G8 | Imports management list | New section in the add-tab beneath the drop-zone: file name · folder · status · reason · open; feeds G4/G5/G6/G7. Materials list (main tab) stays the learner's view — no admin-ification. |

## D. Test extensions (Phase 25 → pragmatic subset)

Add to `verify-import` (service-level): batch loop with mixed outcomes + summary counts, relPath preserved & sanitized (`../` stripped), delete-all (rows + contents + files gone; seeded corpus untouched; idempotent), re-import after delete, partial-failure batch. Existing 23 checks untouched.

## E. Validation

Browser: folder import via directory picker (Playwright `addElement` with webkitdirectory), batch report walkthrough, delete-all confirm + verification, re-import dedup message. Responsive 1440/1280/1024. Regression: `verify:all` + `verify:product` + `test:data` + `test:security` + `build`.

## F. Explicitly out of scope

New formats (epub/pptx/xlsx/csv), local Whisper, PDF page-image OCR, any AI-required import path (none exists), changing seeded corpus management, second importer/corpus system.
