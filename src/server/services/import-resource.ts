import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contents as contentsT, importedResources } from "@/db/schema";
import { contentFingerprint } from "@/server/services/content-selection";
import { analyzeContent } from "@/server/services/content-analysis";
import {
  FORMAT_KIND,
  MAX_SIZE,
  MIME_OF,
  extractDocx,
  extractPdf,
  extractPlainText,
  extractSubtitles,
  ocrImage,
  sha256,
  sniffFormat,
  type ImportFormat,
  type NormalizedText,
} from "@/lib/import/extract";

/* ── Import service: file bytes → registered resource → learning content ────
 * One entry, one pipeline: sniff → cap → dedupe → persist → extract →
 * analyze (existing engine) → contents row. The learner never sees a parser
 * name — they see Ready / Needs attention / Already in your library. */

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export type ImportStatus = "ready" | "duplicate" | "needs_attention" | "needs_transcription" | "failed";

export interface ImportResult {
  ok: boolean;
  status: ImportStatus | "rejected";
  resourceId?: number;
  contentId?: number;
  duplicate?: boolean;
  title?: string;
  format?: ImportFormat;
  kind?: string;
  meta?: { pages?: number; durationMs?: number; ocrConfidence?: number; cues?: number };
  error?: string;
}

const SAFE_KEY = /^[a-f0-9-]{36}\.[a-z0-9]{2,4}$/;

async function storeFile(format: ImportFormat, buf: Buffer): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const key = `${randomUUID()}.${format}`;
  await writeFile(path.join(UPLOAD_DIR, key), buf);
  return key;
}

/** Stream an uploaded file back for playback. Key re-validation makes path
 * traversal structurally impossible (uuid names only, fixed directory). */
export async function readUpload(storageKey: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!SAFE_KEY.test(storageKey)) return null;
  const format = storageKey.split(".")[1] as ImportFormat;
  const mime = MIME_OF[format];
  if (!mime) return null;
  try {
    const buf = await readFile(path.join(UPLOAD_DIR, path.basename(storageKey)));
    return { buf, mime };
  } catch {
    return null;
  }
}

async function toContent(input: {
  type: "reading" | "listening";
  title: string;
  body: string;
  topic: string;
  cefr: string;
  difficulty: number;
  minutes: number;
  audioUrl?: string;
  fingerprint: string | null;
}): Promise<number> {
  const [row] = await db
    .insert(contentsT)
    .values({
      type: input.type,
      title: input.title.slice(0, 160) || "Imported material",
      topic: input.topic,
      cefr: input.cefr as (typeof contentsT.$inferInsert)["cefr"],
      difficulty: input.difficulty,
      body: input.body,
      minutes: input.minutes,
      audioUrl: input.audioUrl ?? null,
      fingerprint: input.fingerprint,
    })
    .returning({ id: contentsT.id });
  return row.id;
}

export async function importFile(
  userId: number,
  input: { fileName: string; buf: Buffer; durationMs?: number },
): Promise<ImportResult> {
  const fileName = input.fileName.slice(0, 200).replace(/[\r\n"]/g, "");
  const buf = input.buf;

  if (buf.length === 0) return { ok: false, status: "rejected", error: "Empty file." };
  const format = sniffFormat(buf, fileName);
  if (!format) {
    return {
      ok: false,
      status: "rejected",
      error: `Unsupported file type. Supported: PDF, DOCX, TXT, MD, PNG/JPG/WEBP, SRT/VTT, MP3, WAV, M4A, MP4.`,
    };
  }
  const kind = FORMAT_KIND[format];
  if (buf.length > MAX_SIZE[kind]) {
    return { ok: false, status: "rejected", error: `File too large (limit ${Math.round(MAX_SIZE[kind] / 1048576)} MB).` };
  }

  // ── file-level dedupe: same bytes ever imported → point at what it made ──
  const hash = sha256(buf);
  const [prior] = await db
    .select()
    .from(importedResources)
    .where(and(eq(importedResources.userId, userId), eq(importedResources.contentHash, hash)))
    .limit(1);
  if (prior) {
    return {
      ok: true,
      status: prior.status === "ready" ? "duplicate" : prior.status,
      resourceId: prior.id,
      contentId: prior.contentId ?? undefined,
      duplicate: true,
      title: prior.fileName,
      format: prior.format as ImportFormat,
      kind: prior.resourceType,
      meta: prior.meta,
      error: prior.error ?? undefined,
    };
  }

  // ── persist first, then extract — failed extractions keep an audit row ──
  const storageKey = await storeFile(format, buf);
  const fail = async (status: ImportStatus, error: string, meta: ImportResult["meta"] = {}): Promise<ImportResult> => {
    await db.insert(importedResources).values({
      userId, fileName, resourceType: kind, format, mimeType: MIME_OF[format],
      fileSize: buf.length, contentHash: hash, storageKey, status, error, meta,
    });
    return { ok: status !== "failed", status, error, format, kind, meta };
  };

  try {
    // ── media: become real listening material; transcript honestly pending ──
    if (kind === "audio" || kind === "video") {
      const durationMs = input.durationMs && input.durationMs > 0 && input.durationMs < 24 * 3600_000
        ? Math.round(input.durationMs)
        : undefined;
      const minutes = durationMs ? Math.max(1, Math.round(durationMs / 60_000)) : 5;
      const [row] = await db
        .insert(importedResources)
        .values({
          userId, fileName, resourceType: kind, format, mimeType: MIME_OF[format],
          fileSize: buf.length, contentHash: hash, storageKey, status: "needs_transcription",
          meta: durationMs ? { durationMs } : {},
        })
        .returning({ id: importedResources.id });
      const contentId = await toContent({
        type: "listening",
        title: fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 160) || "Imported audio",
        body: "", // Listening Lab handles the no-transcript path natively
        topic: "imported",
        cefr: "B2",
        difficulty: 3,
        minutes,
        audioUrl: `/api/uploads/${row.id}`,
        fingerprint: null, // media dedupes by file hash, not text
      });
      await db.update(importedResources).set({ contentId }).where(eq(importedResources.id, row.id));
      return {
        ok: true, status: "needs_transcription", resourceId: row.id, contentId,
        title: fileName, format, kind, meta: durationMs ? { durationMs } : {},
        error: "Audio imported. Transcription isn't available locally yet — the Listening Lab works with or without a transcript.",
      };
    }

    // ── text-bearing formats: extract → analyze → content ──────────────────
    let normalized: NormalizedText;
    try {
      if (format === "pdf") normalized = await extractPdf(buf);
      else if (format === "docx") normalized = await extractDocx(buf);
      else if (format === "srt" || format === "vtt") normalized = await extractSubtitles(buf.toString("utf-8"));
      else if (format === "png" || format === "jpg" || format === "webp") normalized = await ocrImage(buf);
      else normalized = extractPlainText(buf.toString("utf-8"), format === "md");
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_TEXT_LAYER") {
        return fail(
          "needs_attention",
          "This PDF looks scanned (no text layer). Page-image OCR isn't available yet — import a text PDF, or paste the text.",
        );
      }
      return fail("failed", `Couldn't extract text from this ${format.toUpperCase()} file.`);
    }

    const words = normalized.body.split(/\s+/).filter(Boolean).length;
    if (words < 30 || !/[a-zA-Z]/.test(normalized.body)) {
      return fail(
        "needs_attention",
        (normalized.meta.ocrConfidence ?? 100) < 70
          ? "OCR couldn't read enough text from this image — some text may need review or the image may not contain English."
          : "Couldn't find enough English text in this file.",
        normalized.meta,
      );
    }

    // ── text-level dedupe: same text as an earlier import/paste → open it ──
    const fingerprint = contentFingerprint(normalized.body);
    const [dupContent] = await db
      .select({ id: contentsT.id })
      .from(contentsT)
      .where(eq(contentsT.fingerprint, fingerprint))
      .limit(1);
    if (dupContent) {
      await db.insert(importedResources).values({
        userId, fileName, resourceType: kind, format, mimeType: MIME_OF[format],
        fileSize: buf.length, contentHash: hash, storageKey, status: "duplicate",
        contentId: dupContent.id, meta: normalized.meta,
      });
      return {
        ok: true, status: "duplicate", contentId: dupContent.id, duplicate: true,
        title: normalized.title || fileName, format, kind, meta: normalized.meta,
      };
    }

    // ── reuse the existing local analysis engine (no AI key required) ──────
    const analysis = await analyzeContent(normalized.body);
    const minutes = Math.max(1, Math.round(words / 130));
    const type = kind === "subtitle" ? "listening" : "reading";

    const [row] = await db
      .insert(importedResources)
      .values({
        userId, fileName, resourceType: kind, format, mimeType: MIME_OF[format],
        fileSize: buf.length, contentHash: hash, storageKey, status: "ready",
        meta: normalized.meta,
      })
      .returning({ id: importedResources.id });
    const contentId = await toContent({
      type,
      title: normalized.title || fileName,
      body: normalized.body,
      topic: analysis.topic || "imported",
      cefr: analysis.cefr,
      difficulty: analysis.difficulty,
      minutes,
      fingerprint,
    });
    await db.update(importedResources).set({ contentId }).where(eq(importedResources.id, row.id));

    return {
      ok: true, status: "ready", resourceId: row.id, contentId,
      title: normalized.title || fileName, format, kind, meta: normalized.meta,
    };
  } catch (e) {
    // last-resort: never silently swallow, never leave an orphan file behind
    try {
      await unlink(path.join(UPLOAD_DIR, storageKey));
    } catch {
      /* already gone */
    }
    return { ok: false, status: "failed", error: `Import failed: ${(e as Error).message.slice(0, 160)}`, format, kind };
  }
}
