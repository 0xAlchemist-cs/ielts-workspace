"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, UploadCloud } from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";

/* ── Bring your own materials — file & folder import through one entry ──────
 * Single files, multi-select, or a whole folder: each file goes through the
 * same V6 pipeline (extract → analyze → dedupe). The batch report is the only
 * outcome surface — grouped, human, with reasons for anything that needs
 * attention. Every step runs locally; the report says so. */

interface ImportResponse {
  ok: boolean;
  status: "ready" | "duplicate" | "needs_attention" | "needs_transcription" | "failed" | "rejected";
  contentId?: number;
  resourceId?: number;
  title?: string;
  format?: string;
  kind?: string;
  meta?: { pages?: number; durationMs?: number; ocrConfidence?: number; cues?: number; folder?: string };
  error?: string;
}

interface BatchItem {
  name: string;
  relPath?: string;
  result: ImportResponse | null;
}

const AUDIOISH = /\.(mp3|wav|m4a|mp4)$/i;

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

export function FileImport() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const retryRef = useRef<HTMLInputElement | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState<BatchItem[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  const processFiles = async (files: File[]) => {
    if (running || files.length === 0) return;
    setRunning(true);
    setItems(files.map((f) => ({ name: f.name, result: null })));
    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || undefined;
      let result: ImportResponse;
      try {
        const durationMs = await probeDuration(f);
        const form = new FormData();
        form.append("file", f);
        if (durationMs) form.append("durationMs", String(Math.round(durationMs)));
        if (relPath) form.append("relPath", relPath);
        const res = await fetch("/api/import", { method: "POST", body: form });
        result = (await res.json()) as ImportResponse;
      } catch {
        result = { ok: false, status: "failed", error: "Upload failed — check the connection and try again." };
      }
      setItems((prev) => prev.map((it, j) => (j === i ? { ...it, relPath, result } : it)));
      setProgress({ done: i + 1, total: files.length });
    }
    setRunning(false);
    router.refresh();
  };

  const finished = !running && items.length > 0;
  const groups = {
    ready: items.filter((i) => i.result?.status === "ready"),
    duplicate: items.filter((i) => i.result?.status === "duplicate"),
    attention: items.filter((i) => i.result?.status === "needs_attention" || i.result?.status === "needs_transcription"),
    failed: items.filter((i) => i.result?.status === "failed" || i.result?.status === "rejected"),
  };

  const label = (g: string) =>
    g === "ready" ? { en: "Ready to learn", zh: "可以开始学" } :
    g === "duplicate" ? { en: "Already in your library", zh: "已在你的库里" } :
    g === "attention" ? { en: "Needs attention", zh: "需要注意" } :
    { en: "Couldn't import", zh: "无法导入" };

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
        aria-label="Import files or a folder"
        onClick={() => !running && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !running) {
            e.preventDefault();
            fileRef.current?.click();
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
          const files = e.dataTransfer.files ? [...e.dataTransfer.files] : [];
          if (files.length) void processFiles(files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
          dragOver ? "border-accent bg-accent/[0.06]" : "border-line hover:border-ink-3/40 hover:bg-surface-2/50"
        }`}
      >
        {running ? (
          <div className="py-1">
            <p className="text-[13.5px] font-medium text-ink">
              <T en={`Importing ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} of ${progress.total}…`} zh={`正在导入 ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`} />
            </p>
            <div className="mx-auto mt-2 h-[3px] w-40 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            </div>
          </div>
        ) : (
          <>
            <UploadCloud size={22} strokeWidth={1.6} className="text-ink-3" />
            <p className="mt-2.5 text-[13.5px] font-medium text-ink">
              <T en="Drop files here, or click to choose" zh="拖文件到这里，或点击选择" />
            </p>
            <p className="mt-1 text-[11.5px] text-ink-3">
              PDF · DOCX · TXT · MD · PNG/JPG · SRT · VTT · MP3 · WAV · M4A · MP4
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.srt,.vtt,.mp3,.wav,.m4a,.mp4"
          className="hidden"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            if (fs.length) void processFiles(fs);
            e.target.value = "";
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            if (fs.length) void processFiles(fs);
            e.target.value = "";
          }}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
        <input
          ref={retryRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processFiles([f]);
            e.target.value = "";
          }}
        />
      </div>

      {!running && (
        <button type="button" onClick={() => folderRef.current?.click()} className={`${btn.ghost} mt-3 h-9 px-4 text-[12.5px]`}>
          <T en="Import a whole folder" zh="导入整个文件夹" />
        </button>
      )}

      {finished && (
        <div className="enter mt-4 rounded-xl bg-surface-2 px-5 py-4">
          <p className="text-[14px] font-semibold text-ink">
            <T
              en={`${items.length} file${items.length === 1 ? "" : "s"} · ${groups.ready.length} ready · ${groups.duplicate.length} already here · ${groups.attention.length} need attention · ${groups.failed.length} failed`}
              zh={`${items.length} 个文件 · ${groups.ready.length} 可学 · ${groups.duplicate.length} 已在库 · ${groups.attention.length} 需注意 · ${groups.failed.length} 失败`}
            />
          </p>
          <p className="mt-1 text-[11.5px] text-ink-3">
            <T en="Processed entirely on this machine — no AI needed." zh="全程在本机处理——不需要 AI。" />
          </p>

          <div className="mt-3 space-y-1.5">
            {(["ready", "duplicate", "attention", "failed"] as const)
              .filter((g) => groups[g].length > 0)
              .map((g) => (
                <div key={g}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(openGroup === g ? null : g)}
                    className="press flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[12.5px] font-medium text-ink-2 hover:text-ink"
                  >
                    <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-150 ${openGroup === g ? "" : "-rotate-90"}`} />
                    {g === "ready" ? <Check size={13} strokeWidth={2.4} className="text-ok-text" /> : g === "failed" ? <AlertTriangle size={13} strokeWidth={2} className="text-warn-text" /> : null}
                    <T en={label(g).en} zh={label(g).zh} />
                    <span className="text-ink-3">{groups[g].length}</span>
                  </button>
                  {openGroup === g && (
                    <div className="enter mt-1 space-y-1.5 pl-6">
                      {groups[g].map((it, i) => {
                        const r = it.result!;
                        return (
                          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/70 px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                              {it.relPath?.includes("/") ? `${it.relPath.split("/").slice(0, -1).join("/")}/` : ""}
                              {it.name}
                            </span>
                            {r.status === "ready" && r.contentId != null ? (
                              <button
                                type="button"
                                onClick={() => router.push(r.kind === "subtitle" ? `/listen/${r.contentId}` : `/read/${r.contentId}`)}
                                className="press text-[12px] font-medium text-accent-text hover:underline"
                              >
                                <T en="Start learning →" zh="开始学习 →" />
                              </button>
                            ) : r.status === "duplicate" && r.contentId != null ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/read/${r.contentId}`)}
                                className="press text-[12px] font-medium text-accent-text hover:underline"
                              >
                                <T en="Open →" zh="打开 →" />
                              </button>
                            ) : (r.status === "failed" || r.status === "rejected") ? (
                              <>
                                <span className="max-w-[320px] text-[11.5px] leading-relaxed text-ink-3">{r.error}</span>
                                <button type="button" onClick={() => retryRef.current?.click()} className="press text-[12px] font-medium text-accent-text hover:underline">
                                  <T en="Try another file" zh="换一个文件" />
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="max-w-[320px] text-[11.5px] leading-relaxed text-ink-3">{r.error}</span>
                                {r.status === "needs_transcription" && r.contentId != null && (
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/listen/${r.contentId}`)}
                                    className="press text-[12px] font-medium text-accent-text hover:underline"
                                  >
                                    <T en="Start listening →" zh="开始听力 →" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
