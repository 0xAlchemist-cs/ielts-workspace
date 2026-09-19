"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Globe, Loader2, TriangleAlert } from "lucide-react";
import { T } from "@/components/i18n";
import { toast } from "@/components/motion";

/* ── Import from IELTSCB — paste a Reading report URL; the deterministic
 *    parser fetches the structured report (official questions, your answers,
 *    official explanations, synonyms, evidence). No AI parsing involved. */

interface PreviewResponse {
  ok: true;
  title: string;
  breadcrumb: string | null;
  summary: { totalQuestions: number; correctCount: number | null; rightNumText: string | null; durationSeconds: number | null };
  groups: number;
  questions: number;
  answersComplete: boolean;
  explanations: number;
  synonyms: number;
  coreWords: number;
  warnings: { code: string }[];
  existing: { taskId: number; importedAt: number; sameReport: boolean; attemptId: number | null } | null;
}

const ERROR_TEXT: Record<string, { en: string; zh: string }> = {
  INVALID_URL: { en: "That doesn't look like a valid URL.", zh: "这看起来不是有效的链接。" },
  UNSUPPORTED_URL: { en: "Only ieltscb.com report links are supported.", zh: "只支持 ieltscb.com 的报告链接。" },
  INVALID_PARAMS: { en: "The link is missing required parameters — copy the full report URL.", zh: "链接缺少必要参数——请复制完整的报告地址。" },
  NETWORK_ERROR: { en: "Could not reach ieltscb.com — check your connection and try again.", zh: "无法访问 ieltscb.com——请检查网络后重试。" },
  HTTP_ERROR: { en: "ieltscb.com returned an error. Try again later.", zh: "ieltscb.com 返回了错误，请稍后再试。" },
  AUTH_REQUIRED: { en: "This report needs an ieltscb login session. Open the report in your browser, copy the address, and try again.", zh: "这份报告需要 ieltscb 登录会话。请在浏览器里打开报告，复制地址后重试。" },
  API_ERROR: { en: "ieltscb returned an unexpected response for this link.", zh: "ieltscb 对这个链接返回了异常响应。" },
  PARSE_ERROR: { en: "ieltscb returned data we can't parse yet.", zh: "ieltscb 返回了暂无法解析的数据。" },
  MISSING_PASSAGE: { en: "The report has no passage.", zh: "报告里没有文章。" },
  MISSING_QUESTIONS: { en: "The report has no questions.", zh: "报告里没有题目。" },
};

export function IeltscbImport() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<{ code: string; message?: string } | null>(null);

  const parse = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/import/reading/ieltscb/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) setError({ code: data.error as string, message: data.message });
      else setPreview(data as PreviewResponse);
    } catch {
      setError({ code: "NETWORK_ERROR" });
    } finally {
      setLoading(false);
    }
  };

  const doImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import/reading/ieltscb/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError({ code: data.error as string, message: data.message });
        return;
      }
      if (data.action === "updated") {
        toast("Official material updated — your answers were kept", "success");
      } else if (data.action === "attempt-added") {
        toast("New attempt recorded for this passage", "success");
      } else {
        toast("Imported — weakness analysis is ready", "success");
      }
      setPreview(null);
      setUrl("");
      if (data.reportUrl) router.push(data.reportUrl);
      else router.refresh();
    } catch {
      setError({ code: "NETWORK_ERROR" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="card-specular rounded-2xl bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
          <Globe size={18} strokeWidth={1.8} className="text-accent-text" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Import an IELTSCB reading report" zh="导入 IELTSCB 阅读报告" />
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            <T
              en="Do the test on ieltscb.com, then paste the report link here. We import the official questions, your answers, official explanations and synonym mappings — and track them in your weakness analysis and growth."
              zh="在 ieltscb.com 上做题，然后把报告链接粘贴到这里。我们会导入官方题目、你的答案、官方解析和同义替换——并纳入弱项分析与成长追踪。"
            />
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && parse()}
          placeholder="https://www.ieltscb.com/Report/indexread?paper_id=…"
          className="input-base min-w-0 flex-1 text-[13px]"
          spellCheck={false}
        />
        <button type="button" onClick={parse} disabled={loading || !url.trim()} className="btn-apple press h-[42px] rounded-lg px-5 text-[13.5px] font-medium text-white disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <T en="Parse" zh="解析" />}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-err/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-err-text">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {ERROR_TEXT[error.code] ? (
              <T en={ERROR_TEXT[error.code].en} zh={ERROR_TEXT[error.code].zh} />
            ) : (
              <T en="Something went wrong while reading this report." zh="读取这份报告时出了问题。" />
            )}
          </span>
        </div>
      )}

      {preview && (
        <div className="enter mt-4 rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{preview.title}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">{preview.breadcrumb ?? ""}</p>
            </div>
            {preview.summary.rightNumText && (
              <span className="shrink-0 rounded-lg bg-accent/[0.1] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-accent-text">
                {preview.summary.rightNumText}
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2 sm:grid-cols-3">
            <PreviewLine ok={preview.questions > 0} en={`${preview.questions} questions`} zh={`${preview.questions} 道题`} />
            <PreviewLine ok={preview.groups > 0} en={`${preview.groups} question groups`} zh={`${preview.groups} 个题型组`} />
            <PreviewLine ok={preview.answersComplete} en="Your answers" zh="你的答案" />
            <PreviewLine ok={preview.explanations === preview.questions} en={`${preview.explanations} official explanations`} zh={`${preview.explanations} 条官方解析`} />
            <PreviewLine ok={preview.synonyms > 0} en={`${preview.synonyms} synonym mappings`} zh={`${preview.synonyms} 组同义替换`} />
            <PreviewLine ok={preview.coreWords > 0} en={`${preview.coreWords} core words`} zh={`${preview.coreWords} 个核心词`} />
          </div>

          {preview.warnings.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <TriangleAlert size={12} />
              <T
                en={`${preview.warnings.length} import warning${preview.warnings.length > 1 ? "s" : ""} (imported as-is)`}
                zh={`${preview.warnings.length} 条导入警告（按原样保留）`}
              />
            </p>
          )}

          {preview.existing?.sameReport ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
              <T
                en="This exact report was already imported — importing again only updates the official material; your answers stay untouched."
                zh="这份报告之前已导入——再次导入只会更新官方资料，你的答题记录不会被动。"
              />
            </p>
          ) : preview.existing ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
              <T
                en="You've done this passage before — a new attempt will be added so you can see your growth on the same material."
                zh="这篇你以前做过——将新增一次答题记录，可以看到同一篇材料上的成长。"
              />
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={doImport}
              disabled={importing}
              className="btn-apple press inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13.5px] font-medium text-white disabled:opacity-50"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.4} />}
              <T en={importing ? "Importing…" : "Import"} zh={importing ? "导入中…" : "导入"} />
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              className="press text-[13px] font-medium text-ink-3 hover:text-ink"
            >
              <T en="Cancel" zh="取消" />
            </button>
            {preview.existing?.attemptId && (
              <a
                href={`/ielts/report/${preview.existing.attemptId}`}
                className="press ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent-text"
              >
                <T en="View existing report" zh="查看已有报告" />
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewLine({ ok, en, zh }: { ok: boolean; en: string; zh: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Check size={13} strokeWidth={2.4} className={ok ? "shrink-0 text-ok-text" : "shrink-0 text-ink-3"} />
      <T en={en} zh={zh} />
    </span>
  );
}
