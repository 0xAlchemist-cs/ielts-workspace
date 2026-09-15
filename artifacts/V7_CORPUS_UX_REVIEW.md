# V7 Corpus UX Review

Date: 2026-09-16 · Plan: `V7_CORPUS_UX_PLAN.md`. Goal A (corpus center) built on V6 infrastructure — no second importer, no second corpus system. Goal B (beginner-first) verified already shipped; unchanged.

## What was built

| Capability | Implementation |
|---|---|
| Multi-file import | Same drop-zone, `multiple` picker, drag-drop many; each file through the unchanged `/api/import` |
| Folder import | "Import a whole folder" button (`webkitdirectory`); recursive files processed one by one; relative path (`Reading/article.pdf`) sanitized (no `..`, no drive letters) and stored in `meta.folder` — schema unchanged |
| Batch report | "N files · X ready · Y already here · Z need attention · W failed" + "Processed entirely on this machine — no AI needed." + expandable groups; every failed/attention item shows its human reason; retry affordance |
| "What needs AI?" | Truthful: the entire pipeline (extraction, OCR, analysis) is local — the report says so. No fake `ai_required` states; the one real gap (audio/video transcription) stays honestly labelled |
| Corpus health | One line: `共 N 份材料 · X 可学 · Y 需注意` from the registry — no parser/hash/queue internals |
| Status filters | Three chips: All / Ready / Needs attention |
| One-click delete | "Delete all imported materials" → deliberate confirmation dialog with real counts → removes registry rows, ONLY the contents they created (+sentences/history), uploaded files, and detaches saved expressions from deleted sources. Seeded Cambridge corpus structurally out of scope (no registry rows). Idempotent. |
| Re-import | Same folder picker again; V6 dedup guarantees "already in your library" instead of copies |

## Verification

- `test:import` extended 23 → **33 checks**: folder relPath preserved & traversal-sanitized, listImports/summary consistency, delete-all (registry empty, seeded corpus count intact with exactly the imported contents removed, upload files gone), re-import after delete, delete idempotence. All 33 pass.
- `verify:all` (8 suites) green.
- Browser walkthrough (production build): 3-file batch (txt ready + fake.pdf rejected + wav needs-transcription) → report "3 个文件 · 1 可学 · 0 已在库 · 1 需注意 · 1 失败 · 全程在本机处理"; groups expand with reasons ("Unsupported file type…" / "Transcription isn't available locally yet…"); Needs-attention filter narrows to the one wav; delete-all confirm dialog → executed → manager empties, seeded material list untouched. Test data cleaned by the same flow.
- Note: a rejected upload logs one benign browser console line (`400` on /api/import) — the fetch handler processes the JSON error correctly; the resource-error line is browser-automatic and harmless.

## Goal B status

Phases 14–23 (beginner library/onboarding/nav/Today/human language/hidden states/reading/retrieval/progress/reduction): shipped in prior rounds; this round touched none of them except the Library add-tab, which gained the folder button + batch report in the same beginner-first voice. Density: the add-tab still shows exactly one primary surface (the drop-zone) + paste card + imports list.
