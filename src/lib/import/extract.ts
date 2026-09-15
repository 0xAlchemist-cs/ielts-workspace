import { createHash } from "node:crypto";

/* ── Import format layer: sniff → extract → normalized content ──────────────
 * Local-first: every parser here runs inside the Node process with zero
 * network calls (OCR language data is downloaded once on first use, then
 * cached). MIME types are never trusted — format comes from magic bytes,
 * with the file extension only allowed to disambiguate text-ish formats. */

export type ImportFormat =
  | "pdf" | "docx" | "txt" | "md"
  | "png" | "jpg" | "webp"
  | "srt" | "vtt"
  | "mp3" | "wav" | "m4a" | "mp4";

export type ResourceKind = "document" | "subtitle" | "image" | "audio" | "video";

export const FORMAT_KIND: Record<ImportFormat, ResourceKind> = {
  pdf: "document", docx: "document", txt: "document", md: "document",
  png: "image", jpg: "image", webp: "image",
  srt: "subtitle", vtt: "subtitle",
  mp3: "audio", wav: "audio", m4a: "audio", mp4: "video",
};

/** Per-kind size caps — generous for real study material, far below anything
 * that would stress memory (media is streamed to disk, never held). */
export const MAX_SIZE: Record<ResourceKind, number> = {
  document: 20 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  subtitle: 5 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
  video: 400 * 1024 * 1024,
};

export const MIME_OF: Record<ImportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  srt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
};

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

const startsWith = (b: Buffer, bytes: number[] | string, offset = 0) =>
  typeof bytes === "string"
    ? b.subarray(offset, offset + bytes.length).toString("latin1") === bytes
    : bytes.every((byte, i) => b[offset + i] === byte);

const SRT_TIME = /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/;
const VTT_TIME = /(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/;

function decodeText(b: Buffer): string | null {
  // BOM-aware UTF-8 decode; reject binary garbage that would poison analysis
  try {
    const s = b.toString("utf-8");
    if (s.includes("\u0000")) return null;
    // a heavy run of replacement chars means the bytes weren't text
    return (s.match(/\uFFFD/g) ?? []).length > s.length * 0.02 ? null : s;
  } catch {
    return null;
  }
}

/** Magic-byte sniffing. Extension only breaks ties between text formats. */
export function sniffFormat(buf: Buffer, fileName: string): ImportFormat | null {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();

  if (startsWith(buf, "%PDF-")) return "pdf";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpg";
  if (buf.length > 12 && startsWith(buf, "RIFF") && startsWith(buf, "WEBP", 8)) return "webp";
  if (startsWith(buf, "ID3")) return "mp3";
  if (startsWith(buf, [0xff, 0xfb]) || startsWith(buf, [0xff, 0xf3]) || startsWith(buf, [0xff, 0xf2])) return "mp3";
  if (buf.length > 12 && startsWith(buf, "RIFF") && startsWith(buf, "WAVE", 8)) return "wav";
  if (buf.length > 12 && startsWith(buf, "ftyp", 4)) {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (brand.startsWith("M4A")) return "m4a";
    return "mp4"; // isom/mp42/etc video brands
  }
  if (startsWith(buf, "PK\x03\x04") && ext === "docx") return "docx"; // OOXML zip

  // text formats: decode first, then let content + extension pick
  const text = decodeText(buf);
  if (text != null) {
    const head = text.slice(0, 4000);
    if ((ext === "srt" || ext === "vtt") && (SRT_TIME.test(head) || VTT_TIME.test(head))) {
      return ext === "srt" ? "srt" : "vtt";
    }
    if (head.trimStart().startsWith("WEBVTT") && VTT_TIME.test(head)) return "vtt";
    if (ext === "md" || ext === "markdown") return "md";
    if (ext === "txt" || ext === "srt" || ext === "vtt" || ext === "csv") return "txt";
    // extensionless uploads that are clearly prose still count as text
    if (!fileName.includes(".") && /[a-zA-Z]/.test(head) && head.length > 40) return "txt";
  }
  return null;
}

/* ── Normalized output ─────────────────────────────────────────────────── */

export interface NormalizedText {
  title: string;
  body: string; // paragraph-separated plain text
  meta: { pages?: number; cues?: number; ocrConfidence?: number };
}

function firstTitleLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    // skip page furniture: "-- 3 --", "Page 4 of 10", bare numbers, symbol runs
    if (/^[\W\d]*\d+(\s*(of|\/)\s*\d+)?[\W\d]*$/i.test(t)) continue;
    if (/^(page|www\.|http)/i.test(t)) continue;
    const letters = (t.match(/[a-zA-Z]/g) ?? []).length;
    if (letters >= 4 && t.length <= 120) return t.slice(0, 120);
  }
  return "";
}

/** Markdown → plain prose (headings kept as title/section lines). */
function mdToText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "") // heading marks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** SRT/VTT → transcript body + cue count. Cue text joins into paragraphs at
 * sentence boundaries so the Listening Lab reads it like any transcript. */
export function parseSubtitles(text: string): { body: string; cues: number } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let cues = 0;
  let collecting = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { collecting = false; continue; }
    if (/^WEBVTT/i.test(line)) continue;
    if (SRT_TIME.test(line) || VTT_TIME.test(line)) { cues++; collecting = true; continue; }
    if (/^\d+$/.test(line) && !collecting) continue; // srt index
    if (line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) { collecting = false; continue; }
    if (collecting && line) out.push(line);
  }
  // join cue lines into flowing text; break paragraph when a cue ends a sentence
  let body = "";
  for (const t of out) {
    body = /[.!?]"?$/.test(body.trim()) ? `${body.trim()}\n\n${t}` : `${body}${body.endsWith(" ") || !body ? "" : " "}${t}`;
  }
  return { body: body.trim(), cues };
}

/** PDF text extraction (pdf-parse v2). Throws when the doc has no text layer. */
export async function extractPdf(buf: Buffer): Promise<NormalizedText> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const text = (result.text ?? "").replace(/\r\n?/g, "\n").trim();
    const pages = result.total || result.pages?.length || undefined;
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 40) {
      // text layer exists but is (near) empty → scanned document
      const err = new Error("NO_TEXT_LAYER") as Error & { code?: string };
      err.code = "NO_TEXT_LAYER";
      throw err;
    }
    // collapse pdf line-wrap artifacts into paragraphs
    const body = text
      .replace(/-\n(\w)/g, "$1") // de-hyphenate line breaks
      .replace(/(?<!\n)\n(?!\n)/g, " ")
      .replace(/\n{2,}/g, "\n\n")
      .trim();
    return { title: firstTitleLine(body), body, meta: pages ? { pages } : {} };
  } finally {
    await parser.destroy?.();
  }
}

/** DOCX → text via mammoth (raw text keeps paragraph breaks). */
export async function extractDocx(buf: Buffer): Promise<NormalizedText> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  const body = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title: firstTitleLine(body), body, meta: {} };
}

/** Plain text / markdown. */
export function extractPlainText(text: string, isMd: boolean): NormalizedText {
  const body = (isMd ? mdToText(text) : text.replace(/\r\n?/g, "\n"))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const title = isMd
    ? (text.match(/^#\s+(.+)$/m)?.[1] ?? "").slice(0, 120) || firstTitleLine(body)
    : firstTitleLine(body);
  return { title, body, meta: {} };
}

/** Subtitle files → listening transcript. */
export function extractSubtitles(text: string): NormalizedText & { cues: number } {
  const { body, cues } = parseSubtitles(text);
  return { title: firstTitleLine(body) || "Transcript", body, meta: { cues }, cues };
}

/** Image OCR — local tesseract (WASM). Confidence travels with the result so
 * the UI can say "some text may need review" instead of pretending. */
export async function ocrImage(buf: Buffer): Promise<NormalizedText> {
  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("eng");
  try {
    const { data } = await worker.recognize(buf);
    const body = (data.text ?? "").replace(/\n{3,}/g, "\n\n").trim();
    return {
      title: firstTitleLine(body) || "Scanned text",
      body,
      meta: { ocrConfidence: typeof data.confidence === "number" ? data.confidence : undefined },
    };
  } finally {
    await worker.terminate();
  }
}
