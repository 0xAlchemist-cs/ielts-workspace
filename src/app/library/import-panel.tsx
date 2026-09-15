"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, FileAudio, FileText, FileVideo, UploadCloud } from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";

/* ── Bring your own materials — the file side of the import entry ───────────
 * Drag or pick a file → it becomes a learning resource through the same
 * pipeline as pasted text (extract → analyze → dedupe → contents). Progress
 * copy walks the real pipeline stages; the result card is the only outcome
 * surface — parser names and logs never appear. */

interface ImportResponse {
  ok: boolean;
  status: "ready" | "duplicate" | "needs_attention" | "needs_transcription" | "failed" | "rejected";
  contentId?: number;
  resourceId?: number;
  title?: string;
  format?: string;
  kind?: string;
  meta?: { pages?: number; durationMs?: number; ocrConfidence?: number; cues?: number };
  error?: string;
}

const AUDIOISH = /\.(mp3|wav|m4a|mp4)$/i;

/** Read media duration in the browser before upload — the server has no
 * ffprobe and should never guess. */
function probeDuration(file: File): Promise<number | undefined> {
  if (!AUDIOISH.test(file.name)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.name.endsWith(".mp4") ? "video" : "audio");
    el.preload = "metadata";
    const done = (d?: number) => {
      URL.revokeObjectURL(url);
      resolve(d && Number.isFinite(d) && d > 0 ? d : undefined);
    };
    el.onloadedmetadata = () => done(el.duration * 1000);
    el.onerror = () => done(undefined);
    el.src = url;
    setTimeout(() => done(undefined), 4000);
  });
}

function metaLine(r: ImportResponse): string {
  const bits: string[] = [];
  bits.push((r.format ?? "").toUpperCase());
  if (r.meta?.pages) bits.push(`${r.meta.pages} pages`);
  if (r.meta?.durationMs) bits.push(`${Math.max(1, Math.round(r.meta.durationMs / 60000))} min`);
  if (r.meta?.cues) bits.push(`${r.meta.cues} cues`);
  if (r.meta?.ocrConfidence != null) bits.push(`OCR ${Math.round(r.meta.ocrConfidence)}%`);
  return bits.filter(Boolean).join(" · ");
}

export function FileImport() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "importing" | "extracting" | "understanding">("idle");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  const handleFile = async (file: File) => {
    if (phase !== "idle") return;
    setResult(null);
    setPhase("importing");
    try {
      const durationMs = await probeDuration(file); // reading it locally = "importing"
      setPhase("extracting");
      const timer = setTimeout(() => setPhase("understanding"), 2600); // analysis is the slow half of the same request
      const form = new FormData();
      form.append("file", file);
      if (durationMs) form.append("durationMs", String(Math.round(durationMs)));
      const res = await fetch("/api/import", { method: "POST", body: form });
      clearTimeout(timer);
      const data = (await res.json()) as ImportResponse;
      setResult(data);
      router.refresh();
    } catch {
      setResult({ ok: false, status: "failed", error: "Upload failed — check the connection and try again." });
    } finally {
      setPhase("idle");
    }
  };

  const kindIcon = (r: ImportResponse) =>
    r.kind === "audio" ? <FileAudio size={15} strokeWidth={1.7} /> :
    r.kind === "video" ? <FileVideo size={15} strokeWidth={1.7} /> :
    <FileText size={15} strokeWidth={1.7} />;

  return (
    <div className="card-specular rounded-2xl bg-surface p-6">
      <h3 className="mb-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">
        <T en="Import your materials" zh="导入你的材料" />
      </h3>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
        <T
          en="PDF, Word, text and subtitles become reading & listening material; images are read with on-device OCR. Audio and video are saved for listening practice (no auto-transcription yet)."
          zh="PDF、Word、文本、字幕会变成阅读/听力材料；图片用本机 OCR 识别。音频和视频会存档用于听力练习（暂不支持自动转写）。"
        />
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Import a file"
        onClick={() => phase === "idle" && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && phase === "idle") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors duration-150 ${
          dragOver ? "border-accent bg-accent/[0.06]" : "border-line hover:border-ink-3/40 hover:bg-surface-2/50"
        }`}
      >
        {phase === "idle" ? (
          <>
            <UploadCloud size={22} strokeWidth={1.6} className="text-ink-3" />
            <p className="mt-2.5 text-[13.5px] font-medium text-ink">
              <T en="Drop a file here, or click to choose" zh="拖一个文件到这里，或点击选择" />
            </p>
            <p className="mt-1 text-[11.5px] text-ink-3">
              PDF · DOCX · TXT · MD · PNG/JPG · SRT · VTT · MP3 · WAV · M4A · MP4
            </p>
          </>
        ) : (
          <div className="py-1">
            <p className="text-[13.5px] font-medium text-ink">
              {phase === "importing" ? (
                <T en="Importing…" zh="导入中…" />
              ) : phase === "extracting" ? (
                <T en="Extracting…" zh="提取中…" />
              ) : (
                <T en="Understanding…" zh="理解中…" />
              )}
            </p>
            <p className="mt-1 text-[11.5px] text-ink-3">
              <T en="This usually takes a few seconds." zh="通常只需几秒。" />
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.srt,.vtt,.mp3,.wav,.m4a,.mp4"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = ""; // same file can be re-picked after a fix
          }}
        />
      </div>

      {result && (
        <div className="enter mt-4 rounded-xl bg-surface-2 px-5 py-4">
          {result.status === "ready" && result.contentId != null && (
            <>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-ok-text"><Check size={15} strokeWidth={2.4} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    {result.title || "Imported material"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {metaLine(result)} · <T en="Ready to learn" zh="可以开始学了" />
                    {(result.meta?.ocrConfidence ?? 100) < 70 && (
                      <span className="text-warn-text"> · <T en="some text may need review" zh="部分文字可能需要核对" /></span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(result.kind === "subtitle" ? `/listen/${result.contentId}` : `/read/${result.contentId}`)}
                className={`${btn.primary} mt-3 h-10 px-5`}
              >
                <T en="Start learning" zh="开始学习" />
                <ArrowRight size={14} strokeWidth={2} className="ml-1.5" />
              </button>
            </>
          )}

          {result.status === "duplicate" && result.contentId != null && (
            <>
              <p className="text-[14px] font-semibold text-ink">
                <T en="This material is already in your library." zh="这个材料已经在你的库里了。" />
              </p>
              <button
                type="button"
                onClick={() => router.push(`/read/${result.contentId}`)}
                className={`${btn.secondary} mt-3 h-10 px-5`}
              >
                <T en="Open" zh="打开" />
              </button>
            </>
          )}

          {(result.status === "needs_transcription" || result.status === "needs_attention" || result.status === "failed" || result.status === "rejected") && (
            <>
              <div className="flex items-start gap-2.5">
                {result.status === "needs_transcription" && result.contentId != null ? (
                  <span className="mt-0.5 shrink-0 text-ink-2">{kindIcon(result)}</span>
                ) : (
                  <span className="mt-0.5 shrink-0 text-warn-text"><AlertTriangle size={15} strokeWidth={2} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-ink">
                    {result.status === "needs_transcription" ? (
                      <T en="Audio imported — ready to listen." zh="音频已导入——可以听了。" />
                    ) : (
                      <T en="Needs attention." zh="需要注意。" />
                    )}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                    {result.error ?? <T en="Couldn't process this file." zh="无法处理这个文件。" />}
                  </p>
                </div>
              </div>
              {result.status === "needs_transcription" && result.contentId != null && (
                <button
                  type="button"
                  onClick={() => router.push(`/listen/${result.contentId}`)}
                  className={`${btn.primary} mt-3 h-10 px-5`}
                >
                  <T en="Start listening" zh="开始听力" />
                  <ArrowRight size={14} strokeWidth={2} className="ml-1.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
