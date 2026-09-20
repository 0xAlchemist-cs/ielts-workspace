"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Play, X } from "lucide-react";
import { markStepAction } from "@/app/actions";
import { btn } from "@/components/ui";
import { Segmented } from "@/components/motion";
import { T, useBilingual } from "@/components/i18n";
import { plural } from "@/lib/plural";
import { useSpeech } from "@/hooks/speech";
import type { ReviewMode } from "@/lib/types";

/* ── Review session — a focused training room, not a quiz dashboard:
 * Header → quiet summary → (folded) session options → ONE item → ONE action.
 * The language item is the visual subject; everything else is tertiary. */

interface QueueItem {
  retrievalItemId: number;
  itemType: string;
  mode: ReviewMode;
  prompt: string;
  expected: string;
  display: { title: string; meaningEn?: string };
  options?: string[];
  clozePrompt?: string;
  clozeAudio?: string;
  teach?: { pattern?: string; meaningZh?: string; examples?: string[]; explanation?: string };
  /** V15.1: for error items — deep link into targeted practice */
  sourceId?: number;
  priority?: number;
  category?: string;
  reasonDetail?: string;
}

interface GradeResult {
  quality: 0 | 3 | 5;
  correct: boolean;
  verdict: string;
  targetAnswer: string;
  missingPieces: string[];
  retentionScore?: number;
  strength?: number;
  isRetentionCheck?: boolean;
  forgettingDetected?: boolean;
}

type SessionMode = "quick" | "standard" | "deep";

/* Instruction labels — secondary captions, never shouting */
const MODE_LABEL: Record<string, { en: string; zh: string; zhOnly?: string; enImmersion?: string }> = {
  production: { en: "Produce from Chinese", zh: "看中文，产出英文", enImmersion: "Produce from context" },
  cued_recall: { en: "Recall the word", zh: "回忆这个词" },
  recognition: { en: "Recognise the expression", zh: "再认这个表达" },
  cloze: { en: "Fill the blank in context", zh: "情境填空" },
  context_transfer: { en: "Try it in a new situation", zh: "换一个情境试试" },
  audio_retrieval: { en: "Listen, then produce", zh: "先听，再产出" },
  retention_check: { en: "Do you still remember this?", zh: "你还记得它吗？" },
};

/* why this item is here — learner words, never engine categories */
const CATEGORY_TEXT: Record<string, { en: string; zh: string }> = {
  overdue: { en: "needs practice", zh: "该练了" },
  weak_retrieval: { en: "often forgotten", zh: "经常忘" },
  recurring_error: { en: "you often get this wrong", zh: "经常错" },
  retention_check: { en: "long-term check", zh: "长期检验" },
  at_risk: { en: "starting to slip", zh: "开始生疏" },
  new_item: { en: "new", zh: "新学" },
};

/** V15.2: composition line wording — sources read as plain counts, never as
 *  parallel entries the learner has to choose between. */
const CATEGORY_QUIET: Record<string, { en: string; zh: string }> = {
  overdue: { en: "due", zh: "到期" },
  weak_retrieval: { en: "weak", zh: "薄弱" },
  recurring_error: { en: "error", zh: "错题" },
  retention_check: { en: "check", zh: "检验" },
  at_risk: { en: "slipping", zh: "生疏" },
  new_item: { en: "new", zh: "新学" },
};

export function ReviewSession({
  overdueCount, atRiskCount, tomorrow,
}: {
  accuracy30d: number;
  overdueCount: number;
  atRiskCount: number;
  tomorrow?: {
    successCount: number;
    struggleCount: number;
    successLine: { en: string; zh: string };
    struggleLine: { en: string; zh: string };
  };
}) {
  const [mode, setMode] = useState<SessionMode>("standard");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [categories, setCategories] = useState<Record<string, number>>({});
  const [estMinutes, setEstMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionStats, setSessionStats] = useState({ done: 0, hit: 0 });
  const [retried, setRetried] = useState(false);
  const { speak } = useSpeech();
  const bilingual = useBilingual();

  const load = useCallback(async (m: SessionMode, opts?: { keepStats?: boolean }) => {
    setLoading(true);
    setQueue([]); setIdx(0); setResult(null); setResponse("");
    // a mode switch starts a fresh session; a batch rollover keeps the tally
    // so the end-of-session panel reflects everything answered today (V10)
    if (!opts?.keepStats) setSessionStats({ done: 0, hit: 0 });
    const res = await fetch(`/api/review/queue?mode=${m}`);
    const data = await res.json();
    setQueue(data.queue ?? []);
    setCategories(data.categories ?? {});
    setEstMinutes(data.estMinutes ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching pattern
    load("standard");
  }, [load]);

  const current = queue[idx];
  const finished = !loading && queue.length === 0;

  const submit = useCallback(
    async (skip = false, directResponse?: string) => {
      if (!current || submitting) return;
      setSubmitting(true);
      const res = await fetch("/api/review/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retrievalItemId: current.retrievalItemId,
          mode: current.mode,
          response: skip ? "" : (directResponse ?? response),
        }),
      });
      const data: GradeResult = await res.json();
      setResult(data);
      setSessionStats((s) => ({ done: s.done + 1, hit: s.hit + (data.quality === 5 ? 1 : 0) }));
      setSubmitting(false);
    },
    [current, submitting, response],
  );

  const submitWith = (answer: string) => submit(false, answer);

  const next = () => {
    setResult(null); setResponse(""); setRetried(false);
    if (idx + 1 >= queue.length) { markStepAction("retrieval"); load(mode, { keepStats: true }); }
    else setIdx(idx + 1);
  };

  const modeLabel = (m: string) => {
    // Error items are English fix-it tasks — the Chinese-prompt label lies.
    if (current?.itemType === "error" && (m === "production" || m === "cloze")) {
      return bilingual ? "Fix the English · 纠错产出" : "Fix the English";
    }
    const l = MODE_LABEL[m];
    if (!l) return m;
    if (!bilingual && l.enImmersion) return l.enImmersion;
    return bilingual ? `${l.en} · ${l.zh}` : l.en;
  };

  return (
    <div className="shell-wide">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header>
        <h1 className="text-display">
          <T en="Review" zh="复习" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T en="Answer from memory — that's what makes it stick." zh="凭记忆作答——这样才真正记得住。" />
        </p>
      </header>

      {/* ── Summary — one quiet line, no chips ─────────────────────────────── */}
      {!loading && queue.length > 0 && idx === 0 && !result && (
        <p className="mt-8 text-[12.5px] text-ink-3">
          <T en={plural(queue.length, "item")} zh={`${queue.length} 项`} /> · ~{estMinutes} min
          {atRiskCount > 0 && (
            <span className="text-err-text">
              {" · "}
              <T en={`${plural(atRiskCount, "item")} needs attention`} zh={`${atRiskCount} 项需要关注`} />
            </span>
          )}
          {/* V15.2: where the queue came from — one composition line, the
           * system decides the order; the learner never picks a source */}
          {Object.keys(categories).length > 0 && (
            <span className="ml-1 text-ink-3/80">
              {" · "}
              {Object.entries(categories)
                .map(([k, n]) => `${n} ${CATEGORY_QUIET[k]?.[bilingual ? "zh" : "en"] ?? k}`)
                .join(" · ")}
            </span>
          )}
        </p>
      )}
      {loading && <p className="mt-8 text-[13px] text-ink-3"><T en="Building your review queue…" zh="正在生成复习队列…" /></p>}

      {/* ── Session options — folded away: modes and error revenge never
       * compete with the item on screen ──────────────────────────────────── */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOptionsOpen((o) => !o)}
          aria-expanded={optionsOpen}
          className="press inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          <ChevronDown size={12} strokeWidth={1.9} className={`transition-transform duration-150 ${optionsOpen ? "" : "-rotate-90"}`} />
          <T en="Session options" zh="会话选项" />
        </button>
        {optionsOpen && (
          <div className="enter mt-3 flex flex-wrap items-center gap-3">
            {/* V15.2: duration presets over the SAME canonical queue — errors,
             * forgetting and retention mix in naturally; no parallel entries */}
            <Segmented<SessionMode>
              value={mode}
              onChange={(m) => { setMode(m); load(m); }}
              options={[
                { value: "quick", label: <T en="Quick · 5–10 min" zh="快速 · 5–10 分钟" /> },
                { value: "standard", label: <T en="Standard · 15 min" zh="标准 · 15 分钟" /> },
                { value: "deep", label: <T en="Deep · 30 min" zh="深度 · 30 分钟" /> },
              ]}
            />
          </div>
        )}
      </div>

      {/* ── Finished ───────────────────────────────────────────────────────── */}
      {finished && (
        <div className="mt-12">
          <p className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Queue clear." zh="队列已清空。" />
          </p>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
            <T
              en="Nothing is due. New learning won't be crowded out by review backlog."
              zh="当前没有到期项。新的学习不会被复习积压挤掉。"
            />
          </p>
          {/* V10: end-of-session evidence — scheduled + tomorrow, human words */}
          {sessionStats.done > 0 && (
            <div className="enter mt-5 rounded-xl bg-surface-2 px-5 py-4">
              <p className="text-[13px] font-medium text-ink">
                <T
                  en={`${sessionStats.done} answered · ${sessionStats.hit} recalled successfully.`}
                  zh={`完成 ${sessionStats.done} 项 · 成功回忆 ${sessionStats.hit} 项。`}
                />
              </p>
              <p className="mt-1 text-[12.5px] text-ink-3">
                <T en="Your next review has been scheduled." zh="你的下次复习已排好。" />
              </p>
              {tomorrow && (
                <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                  <T en={tomorrow.successLine.en} zh={tomorrow.successLine.zh} />
                  <br />
                  <T en={tomorrow.struggleLine.en} zh={tomorrow.struggleLine.zh} />
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Language item — the one elevated surface ───────────────────────── */}
      {current && (
        <div className="enter card-specular mt-10 rounded-card bg-surface px-6 py-8 sm:px-10 sm:py-10">
          {/* position */}
          <div className="flex items-center gap-3">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${queue.length ? ((idx + (result ? 1 : 0)) / queue.length) * 100 : 0}%` }}
              />
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{idx + 1} / {queue.length}</span>
          </div>

          {/* instruction — a secondary caption, bilingual aware */}
          <p className="mt-8 text-[12px] text-ink-3">
            {current.category && CATEGORY_TEXT[current.category] && (
              <>{CATEGORY_TEXT[current.category].en}{bilingual ? ` · ${CATEGORY_TEXT[current.category].zh}` : ""} — </>
            )}
            {modeLabel(current.mode)}
          </p>
          {current.mode === "retention_check" && (
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
              <T
                en="It's been a while — let's see if it's still there."
                zh="有段时间了——看看它还在不在。"
              />
            </p>
          )}

          {/* prompt */}
          <div className="mt-5">
            {current.clozePrompt ? (
              <div className="flex items-start justify-between gap-4">
                <p className="text-[19px] font-medium leading-relaxed tracking-[-0.01em] text-ink">{current.clozePrompt}</p>
                <button
                  onClick={() => speak(current.clozeAudio ?? current.clozePrompt ?? "", 0.9)}
                  aria-label="Play audio"
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2 transition-colors duration-150 hover:text-ink"
                >
                  <Play size={14} strokeWidth={1.8} />
                </button>
              </div>
            ) : (
              <p className="text-[21px] font-medium leading-relaxed tracking-[-0.012em] text-ink">{current.prompt}</p>
            )}
          </div>

          {/* ── Input ──────────────────────────────────────────────────────── */}
          {!result ? (
            <div className="mt-9">
              {current.options && current.options.length >= 2 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {current.options.map((opt) => (
                    <button
                      key={opt}
                      disabled={submitting}
                      onClick={() => { setResponse(opt); submitWith(opt); }}
                      className="press rounded-xl bg-surface-2 px-4 py-3 text-left text-[15px] font-medium text-ink transition-colors duration-150 hover:bg-accent-quiet disabled:opacity-40"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  autoFocus
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={2}
                  placeholder={bilingual ? "Say it out loud first, then type · 先说出声，再打出来" : "Say it out loud first, then type…"}
                  className="input-base w-full resize-none px-4 py-3 text-[15px]"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                />
              )}

              {/* ── Action — one primary decision ─────────────────────────── */}
              <div className="mt-5 flex items-center gap-5">
                {!(current.options && current.options.length >= 2) && (
                  <button onClick={() => submit()} disabled={submitting || !response.trim()} className={btn.primary}>
                    <T en={submitting ? "Checking…" : "Check"} zh={submitting ? "检查中…" : "检查"} />
                  </button>
                )}
                <button onClick={() => submit(true)} disabled={submitting} className="text-[12.5px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink">
                  <T en="I can't retrieve it" zh="想不起来了" />
                </button>
                <span className="ml-auto text-[12px] tabular-nums text-ink-3">
                  {sessionStats.hit}/{sessionStats.done} <T en="this session" zh="本次" />
                </span>
              </div>
            </div>
          ) : (
            /* ── Result ────────────────────────────────────────────────────── */
            <div className="enter mt-9 space-y-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    result.quality === 5 ? "bg-ok/[0.12] text-ok-text" : result.quality === 3 ? "bg-warn/[0.12] text-warn-text" : "bg-err/[0.09] text-err-text"
                  }`}>
                    {result.quality === 5 ? <Check size={13} strokeWidth={2.5} /> : result.quality === 3 ? <span className="text-[12px] font-semibold">~</span> : <X size={13} strokeWidth={2.5} />}
                  </span>
                  <span className="text-[16px] font-semibold tracking-[-0.012em] text-ink">{result.verdict}</span>
                </div>
                {result.quality < 5 && (
                  <p className="mt-3 text-[14px] text-ink-2">
                    <T en="Target" zh="目标" /> · <span className="font-medium text-ink">{result.targetAnswer}</span>
                  </p>
                )}
                {result.quality === 3 && result.missingPieces.length > 0 && (
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    <T en="Missing" zh="缺少" />: {result.missingPieces.map((m) => `“${m}”`).join(", ")}
                  </p>
                )}
                {result.forgettingDetected && (
                  <p className="mt-2 text-[12px] text-err-text">
                    <T
                      en="You knew this before — it's starting to slip, so you'll see it more often."
                      zh="你以前会——最近开始生疏，所以会更常安排它。"
                    />
                  </p>
                )}
              </div>

              {/* teach panel */}
              {result.quality < 5 && current.teach && (
                <div className="enter rounded-xl bg-surface-2 px-5 py-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
                    <T en="Learn it now" zh="现在学会它" />
                  </p>
                  {current.teach.pattern && (
                    <p className="mt-2 font-mono text-[13px] text-ink">{current.teach.pattern}</p>
                  )}
                  {current.teach.meaningZh && <p className="mt-1.5 text-[13px] text-ink-2">{current.teach.meaningZh}</p>}
                  {current.teach.explanation && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{current.teach.explanation}</p>}
                  {(current.teach.examples?.length ?? 0) > 0 && (
                    <div className="mt-2 space-y-1">
                      {current.teach.examples!.slice(0, 2).map((ex, i) => (
                        <p key={i} className="text-[13px] leading-relaxed text-ink-2">{ex}</p>
                      ))}
                    </div>
                  )}
                  {!retried ? (
                    <button onClick={() => { setResult(null); setResponse(""); setRetried(true); }} className={`${btn.ghost} mt-3 px-3 py-1.5 text-[12px]`}>
                      <T en="Try again now" zh="立刻再试一次" />
                    </button>
                  ) : (
                    <p className="mt-3 text-[12px] text-ink-3">
                      <T en="Retry used — production succeeded counts, but the interval stays honest." zh="已重试——成功记录，但间隔不会虚高。" />
                    </p>
                  )}
                  {/* V15.1: error items get a targeted two-stage practice entry */}
                  {current.itemType === "error" && current.sourceId != null && (
                    <a href={`/practice/${current.sourceId}`} className={`${btn.ghost} ml-2 mt-3 px-3 py-1.5 text-[12px]`}>
                      <T en="Practice in new contexts →" zh="换语境重新练习 →" />
                    </a>
                  )}
                </div>
              )}

              <div>
                <button onClick={next} className={btn.primary}>
                  {idx + 1 >= queue.length ? <T en="Load next batch" zh="下一批" /> : <T en="Continue" zh="继续" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
