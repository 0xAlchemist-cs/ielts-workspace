# V6 Import Audit

Date: 2026-09-15 · Scope: everything that touches "material in → learning resource out".

## 1. What exists today (verified in code)

| Capability | Where | State |
|---|---|---|
| Import UI | `src/app/library/view.tsx` → `AddContentPanel` ("add" tab): paste-text textarea + optional URL fetch | ✅ paste & URL only |
| Text analysis | `src/server/services/content-analysis.ts` `analyzeContent(text)` — CEFR/difficulty/topic/IELTS-relevance via ECDICT word ranks, **fully local, no AI key** | ✅ reuse as-is |
| Quick difficulty probe | `/api/content/analyze` (zod-gated POST, ≤20k chars, ≥30 words) | ✅ |
| Content creation | `importContentAction` (server action): title/topic/cefr → `contents` row (type=reading) | ✅ |
| **Dedup** | `contentFingerprint(body)` sha256 on normalized text → duplicate returns existing id (`{ok, id, duplicate:true}`) — smoke rotation T9 covers it | ✅ reuse |
| Content storage | `contents` table: type/title/topic/cefr/difficulty/body/transcript-ish + `audioUrl` + `minutes` + `fingerprint` | ✅ audio already first-class (Cambridge MP3s) |
| Audio serving | `public/audio/**` static files, `audioUrl = /audio/...` | ✅ pattern to follow |
| URL fetch guard | `assertPublicHttpUrl` SSRF guard in importContentAction | ✅ |
| PDF parsing dep | `pdf-parse ^2.4.5` in dependencies — **installed but never imported** anywhere (v2 API: `new PDFParse({data}).getText()`) | 🔌 wire it in |
| Error handling | word-count floor (50), English-letter check, fetch failure messages | ✅ pattern to extend |

## 2. What is missing

1. **File upload path** — no multipart handling anywhere; no `<input type=file>`; no drag-drop.
2. Format parsers beyond plain text: PDF / DOCX / SRT / VTT / images(OCR) — none.
3. Media import (MP3/WAV/M4A/MP4): no upload, no storage, no resource card, no transcript state.
4. File storage layer + safe serving route (public/ is build-time static — imported files must live in `data/uploads` + a streaming route).
5. File-byte level dedup (fingerprint covers extracted text only).
6. Failure/status model (needs OCR / needs transcription / failed) — import either succeeds or returns an error string today.
7. Import registry (what file came in, from where, producing which content).

## 3. Reuse vs refactor vs new

- **Reuse untouched**: `analyzeContent`, `contentFingerprint`, `contents` table, `/read/{id}` `/listen/{id}` learning loop, URL/paste panel (stays as "Paste text" alongside the new file import).
- **Refactor**: none required — the new pipeline *calls* the existing action's core (fingerprint → dedup → insert) via a shared service rather than duplicating it.
- **New**: `imported_resources` table, upload storage + `/api/uploads/[id]` route, `/api/import` multipart route, `src/lib/import/` extractors, Library drop-zone UI, `verify-import` test suite.

## 4. Format decisions (promised = implemented AND tested)

| Format | Parser | Result | Promise? |
|---|---|---|---|
| TXT / MD | native | reading content | ✅ |
| PDF (text layer) | pdf-parse v2 (already dep) | reading content; page count in meta | ✅ |
| PDF (scanned, no text) | — | status `needs_attention`, honest message (page-image OCR for PDFs is future work — rendering pages headlessly needs native canvas) | ⚠️ no false promise |
| DOCX | mammoth (new dep, pure JS) | reading content | ✅ |
| PNG / JPG / WEBP | tesseract.js (new dep, local WASM OCR, offline) | reading content from OCR text + confidence | ✅ |
| SRT / VTT | native timestamp parser | **listening** content w/ timestamped transcript | ✅ |
| MP3 / WAV / M4A | signature check + store | listening content with real audio, transcript = `needs_transcription` (honest state; local Whisper is Node-unfriendly — documented future, never faked) | ✅ as audio resource |
| MP4 | signature check + store | listening resource (video) — same transcription state | ✅ |
| EPUB / PPTX / XLSX / CSV / HTML | — | rejected with "not supported yet" (Phase-3 rule: don't promise untested) | ❌ future |

Rejected-everything-else is deliberate per the spec's STOP CONDITION.

## 5. Security plan (Phase 15 mapped to this codebase)

MIME never trusted — magic-byte sniffing (%PDF, PK-zip + docx OOXML marker, PNG/JPEG/WEBP signatures, ID3/RIFF/ftyp, SRT/VTT as text+extension). Size caps (docs 20 MB, media 200 MB). Stored filename = generated uuid + vetted extension; original name kept only as DB metadata (display-escaped). Serving route resolves id → DB row → fixed `data/uploads` dir, `basename()` re-check, whitelisted Content-Type, inline disposition. No execution, ever. Everything parameterized via Drizzle (SQL constraint honored — no string-built SQL).
