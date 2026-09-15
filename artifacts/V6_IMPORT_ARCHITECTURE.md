# V6 Import Architecture

Date: 2026-09-15 · "Bring your own English materials. Turn them into learning."

## 1. Supported formats (promised = implemented AND tested)

| Format | Parser (all in-process, local) | Becomes | Notes |
|---|---|---|---|
| TXT | native | reading content | BOM/UTF-8 validation |
| MD | native (md→prose) | reading content | title from first `#`; marks stripped |
| PDF | `pdf-parse` v2 (existing dep) | reading content | page count kept in meta; scanned PDFs → `needs_attention` (no false promise — page-image OCR is future work) |
| DOCX | `mammoth` (new dep, pure JS) | reading content | raw text, paragraph breaks kept |
| SRT / VTT | native timestamp parser | **listening** content | cue text → transcript; timecodes stripped from body, cue count in meta |
| PNG / JPG / WEBP | `tesseract.js` v5 (new dep, local WASM) | reading content | OCR confidence travels to the UI ("some text may need review" below 70); eng model downloads once, then cached offline |
| MP3 / WAV / M4A | signature + store | listening content w/ real audio | transcript honestly pending — the Listening Lab has a native no-transcript path |
| MP4 | signature + store | listening content (video) | same as audio |

**Explicitly rejected with a clear message** (not promised): EPUB, PPTX, XLSX, CSV, HTML pages, `.exe`-like content under any name.

## 2. Pipeline

```
FILE (drag/drop or picker, Library → add tab)
 → client: media duration probed locally (audio/video element)
 → POST /api/import (multipart, single file field)
 → magic-byte sniff (MIME never trusted) + per-kind size cap
 → sha256 file-hash dedupe ("already in your library" → Open)
 → persist to data/uploads/<uuid>.<fmt> (name never from user input)
 → [media]  contents(listening, audioUrl=/api/uploads/{id}, body="")
            → status needs_transcription (honest)
 → [docs]   extract → NormalizedText {title, body, meta}
            → text-fingerprint dedupe (same engine as pasted text)
            → analyzeContent (existing local engine: CEFR/topic/difficulty)
            → contents(reading|listening) → status ready
```

Media serving: `GET /api/uploads/[id]` resolves id → DB row → uuid storage key, re-validated (`/^[a-f0-9-]{36}\.[a-z0-9]{2,4}$/`) against a fixed directory with `basename()` — traversal is structurally impossible; `nosniff`, whitelisted content types, inline disposition.

## 3. Storage & DB

- Files: `data/uploads/` (gitignored like all of `data/`), never inside `public/` (no build-time copying, no direct static access).
- `imported_resources` table: userId, fileName (display only), resourceType, format, mimeType, fileSize, **contentHash** (file dedupe), storageKey, status (`ready|duplicate|needs_attention|needs_transcription|failed`), error, contentId (→ contents), meta JSON (pages / durationMs / ocrConfidence / cues), createdAt. Unique on (userId, contentHash).
- Learning content lands in the existing `contents` table — imported material is indistinguishable from seeded corpus material to every downstream engine (mission planner, rotation, labs).

## 4. Duplicate handling (two layers)

1. **File bytes** (sha256): same file re-uploaded → duplicate, points at what it produced.
2. **Normalized text** (`contentFingerprint`, shared with the paste-import path): same article in a different container (txt vs docx, different line endings) → duplicate → `[Open]`.

## 5. Local-first guarantees

Extraction, analysis, dedupe: 100% in-process, no network, no AI key. The only network touch in the whole pipeline is tesseract's one-time eng model download on first OCR use (cached afterwards). Audio transcription is deliberately NOT faked — status is `needs_transcription` and the Listening Lab works with or without a transcript (paste-transcript path already existed for scanned-source audio).

## 6. Security

- Magic-byte validation (PDF/PK-ZIP-OOXML/PNG/JPEG/WEBP/ID3/MP3-frame/RIFF-WAVE/ftyp), extension only breaks ties between text formats.
- Caps: documents/images 20 MB, subtitles 5 MB, audio 200 MB, video 400 MB; request-level 413 before parsing.
- Filenames: sanitized to display-only (strip control chars, 200 chars); storage keys are generated UUIDs.
- Serving route: DB-mediated, key regex + `basename` + fixed dir + `nosniff` + whitelist content-type.
- Never executes anything; failed processing cleans its stored file; all SQL parameterized via Drizzle.

## 7. Failure states (user-visible, never blank, never silent)

| State | Message shape | Action offered |
|---|---|---|
| rejected | "Unsupported file type…" / "File too large…" / "Empty file." | — |
| needs_attention | "This PDF looks scanned…" / "OCR couldn't read enough…" | import text version / paste text |
| needs_transcription | "Audio imported — ready to listen." + honest note | Start listening |
| failed | "Couldn't extract text…" | retry another file |
| duplicate | "This material is already in your library." | Open |

## 8. UI surface

One upgraded entry: Library → add tab. File drop-zone first, existing paste-text card below it. Progress copy walks the real stages (Importing → Extracting → Understanding → Ready); parser/engine names never appear. Result card: title · format · meta · `[Start learning]` → `/read/{id}` or `/listen/{id}`.

## 9. Testing

`npm run test:import` (wired into `verify:all`): 23 checks with real fixtures in `data/test-fixtures/` (txt/md/srt/vtt hand-written, docx as hand-crafted OOXML zip, wav synthesized, pdf = real Cambridge sampler, fake-MZ `.pdf`, tiny PNG). Covers every promised format, both dedupe layers, learning-loop handoff (`contents` row with CEFR/topic), byte-exact serving readback, traversal-proof serving, hostile filenames, signature spoofing, empty and oversize rejection. OCR is exercised in the manual browser pass (needs the one-time model download).

## 10. Future extensibility (not built, hooks exist)

- EPUB/PPTX/XLSX/CSV parsers — each is one `extract*` function + one signature row away.
- Local Whisper transcription for the `needs_transcription` state (worker process; the status and UI affordance already exist).
- PDF page-image OCR (needs headless page rendering; the honest `needs_attention` state covers it meanwhile).
