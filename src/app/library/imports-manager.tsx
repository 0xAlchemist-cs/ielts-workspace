"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";
import { plural } from "@/lib/plural";
import { deleteAllImportsAction } from "./import-actions";

/* ── Your imports — the management side of the corpus center ────────────────
 * One quiet health line, three status chips, an honest list (state + reason +
 * open), and the two deliberate destructive/bulk actions. Parser internals,
 * hashes and queue metrics never appear. */

export interface ImportRow {
  id: number;
  fileName: string;
  folder: string | null;
  format: string;
  resourceType: string;
  status: "ready" | "duplicate" | "needs_attention" | "needs_transcription" | "failed";
  error: string | null;
  contentId: number | null;
  fileSize: number;
  createdAt: number;
}

export function ImportsManager({
  rows,
  summary,
}: {
  rows: ImportRow[];
  summary: { total: number; ready: number; needsAttention: number };
}) {
  const [filter, setFilter] = useState<"all" | "ready" | "attention">("all");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "ready" ? r.status === "ready" || r.status === "duplicate" : r.status !== "ready" && r.status !== "duplicate",
  );

  // status → human words; the snake_case never reaches the learner
  const statusHuman: Record<ImportRow["status"], string> = {
    ready: "Ready to learn",
    duplicate: "Already in your library",
    needs_attention: "Needs attention",
    needs_transcription: "Ready to listen",
    failed: "Couldn't import",
  };

  const doDelete = () => {
    start(async () => {
      await deleteAllImportsAction();
      setConfirming(false);
      router.refresh();
    });
  };

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-ink-2">
          <T
            en={`${plural(summary.total, "material")} · ${summary.ready} ready · ${summary.needsAttention} need attention`}
            zh={`共 ${summary.total} 份材料 · ${summary.ready} 份可学 · ${summary.needsAttention} 份需注意`}
          />
        </p>
        <div className="flex items-center gap-1">
          {(["all", "ready", "attention"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`press rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150 ${
                filter === f ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
              }`}
            >
              {f === "all" ? <T en="All" zh="全部" /> : f === "ready" ? <T en="Ready" zh="可学" /> : <T en="Needs attention" zh="需注意" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto">
        {visible.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink">
                {r.folder ? <span className="text-ink-3">{r.folder}/</span> : null}
                {r.fileName}
              </span>
              {r.status === "ready" || r.status === "duplicate" ? (
                <span className="text-[11px] text-ink-3">
                  {r.format.toUpperCase()}
                  {r.status === "duplicate" ? <T en=" · already in your library" zh=" · 已在库中" /> : null}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] leading-relaxed text-ink-3">
                  {r.status === "needs_transcription" || r.status === "needs_attention" ? (
                    <AlertTriangle size={11} strokeWidth={2} className="shrink-0 text-warn-text" />
                  ) : null}
                  {r.error ?? statusHuman[r.status]}
                </span>
              )}
            </span>
            {r.contentId != null && (
              <>
                {(r.status === "ready" || r.status === "duplicate") && <Check size={13} strokeWidth={2.4} className="shrink-0 text-ok-text" />}
                <button
                  type="button"
                  onClick={() => router.push(r.resourceType === "subtitle" || r.resourceType === "audio" || r.resourceType === "video" ? `/listen/${r.contentId}` : `/read/${r.contentId}`)}
                  className="press text-[12px] font-medium text-accent-text hover:underline"
                >
                  <T en="Open" zh="打开" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={() => setConfirming(true)} className={`${btn.ghost} h-9 px-3.5 text-[12.5px] text-[#d70015]`}>
          <Trash2 size={13} strokeWidth={2} className="mr-1.5" />
          <T en="Delete all imported materials" zh="删除全部导入材料" />
        </button>
        <span className="text-[11.5px] text-ink-3">
          <T en="Built-in Cambridge material stays — this only removes what you imported." zh="内置剑桥材料不受影响——只删除你自己导入的。" />
        </span>
      </div>

      {confirming && (
        <div className="enter fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !pending && setConfirming(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-[16px] font-semibold text-ink">
              <T en="Delete your imported materials?" zh="删除你导入的全部材料？" />
            </h4>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              <T
                en={`This removes ${summary.total} imported file${summary.total === 1 ? "" : "s"}, their ${summary.ready} learning item${summary.ready === 1 ? "" : "s"}, and frees up stored files. This cannot be undone.`}
                zh={`将删除 ${summary.total} 个导入文件及其产生的 ${summary.ready} 份学习材料，并清空已存文件。此操作不可撤销。`}
              />
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={btn.secondary}>
                <T en="Cancel" zh="取消" />
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={pending}
                className={`${btn.primary} bg-[#ff3b30] hover:bg-[#e5342a]`}
                style={{ backgroundColor: "#ff3b30" }}
              >
                <T en={pending ? "Deleting…" : "Delete everything"} zh={pending ? "删除中…" : "全部删除"} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
