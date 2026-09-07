"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { markStepAction, logEventAction } from "@/app/actions";
import { Badge, MockBadge, ProgressBar, btn, inputCls } from "@/components/ui";
import { toast } from "@/components/motion";
import { T, useBilingual } from "@/components/i18n";
import { ChineseReveal } from "@/components/learn";
import { ArticlePhase, AnalysisSkeleton, type AdHocTarget, type RailTarget } from "./reader";
import { useSpeechRecognition } from "@/hooks/speech";
import { speakingPromptByChunk, transferPromptFor, ieltsQuestionFor } from "@/lib/banks";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import type { SentenceAnalysis, SpeakingFeedback } from "@/lib/types";

/* ── Active Reading Lab — the 8-step guided session ─────────────────────────
 * read (INPUT+NOTICE) → study (DEEP PROCESSING + GENERATION) →
 * recall (RETRIEVAL + CONTEXT TRANSFER) → transfer (SPEAKING + IELTS) → done.
 * Every phase is skippable; every attempt is recorded. The success bar:
 * how many targets moved Passive → Active in one sitting. */

export interface LabTarget extends RailTarget {
  retrievalItemId: number;
  pattern: string;
  zhCue: string;
  transferInstruction: string;
  transferSentence: string | null;
  ieltsQuestion: string;
}

type Phase = "read" | "study" | "recall" | "transfer" | "done";

const PHASE_LABEL: Record<Phase, [string, string]> = {
  read: ["①② Read & Notice", "阅读与注意"],
  study: ["③④ Deep Processing & Generation", "深度加工与生成"],
  recall: ["⑤⑥ Retrieval & Transfer", "闭卷提取与换境迁移"],
  transfer: ["⑦⑧ Speaking & IELTS", "口语与雅思迁移"],
  done: ["Session Complete", "本节完成"],
};

export function ActiveReadingLab({
  contentId,
  title,
  topic,
  cefr,
  difficulty,
  minutes,
  paragraphs,
  tiers,
  savedVocab,
  targets,
  preselectIds,
}: {
  contentId: number;
  title: string;
  topic: string;
  cefr: string;
  difficulty: number;
  minutes: number;
  paragraphs: { id: number; text: string }[][];
  tiers: Record<string, string>;
  savedVocab: string[];
  targets: LabTarget[];
  preselectIds: number[];
}) {
  const [phase, setPhase] = useState<Phase>("read");
  // Articles without pre-set corpus targets let the learner promote tapped
  // words (saved as their own chunks server-side) into the study session.
  const [extraTargets, setExtraTargets] = useState<LabTarget[]>([]);
  const allTargets = useMemo(
    () => [...targets, ...extraTargets.filter((e) => !targets.some((t) => t.chunkId === e.chunkId))],
    [targets, extraTargets],
  );
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set((preselectIds.length ? preselectIds : targets.slice(0, 3).map((t) => t.chunkId)).slice(0, 5)),
  );
  const [seconds, setSeconds] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight + 200;
      const done = Math.min(Math.max(-rect.top + 120, 0), Math.max(total, 1));
      setScrollPct(Math.round((done / Math.max(total, 1)) * 100));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const chosen = useMemo(() => allTargets.filter((t) => selected.has(t.chunkId)), [allTargets, selected]);
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const addAdHocTarget = (t: AdHocTarget) => {
    setExtraTargets((prev) => (prev.some((x) => x.chunkId === t.chunkId) ? prev : [...prev, { ...t, corpusId: undefined, saved: true }]));
    setSelected((prev) => (prev.has(t.chunkId) ? prev : new Set([...prev, t.chunkId])));
  };

  const toggleTarget = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else toast("Session works best with 3–5 targets", "warn");
      return next;
    });

  return (
    <div className="shell-wide">
      {/* header */}
      <header className="mb-5">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Link href="/library" className="hover:text-ink">← Library</Link>
          <span>·</span>
          <span>{topic} · {cefr} · {"●".repeat(difficulty)}{"○".repeat(5 - difficulty)}</span>
          <span>·</span>
          <Link href={`/listen/${contentId}`} className="font-medium text-[#0068d0] hover:underline">
            🎧 Listening mode
          </Link>
        </div>
        <h1 className="text-display">{title}</h1>
      </header>

      {/* sticky session bar */}
      <div className="material-header sticky top-[52px] z-20 -mx-7 mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-black/[0.06] px-7 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px]">
          <Badge tone="accent">{PHASE_LABEL[phase][0]} <span className="opacity-70">{PHASE_LABEL[phase][1]}</span></Badge>
          <span className="font-mono tabular-nums text-ink-3">⏱ {mmss}</span>
          {phase === "read" && (
            <span className="font-mono tabular-nums text-ink-3">📖 {scrollPct}%</span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {phase === "read" && (
            <>
              <span className="text-[12px] text-ink-3">
                Objective: notice & activate <b className="text-ink">{chosen.length}</b> expressions
              </span>
              <button
                onClick={() => chosen.length >= 1 && setPhase("study")}
                disabled={chosen.length < 1}
                className={`${btn.primary} px-3.5 py-1.5 text-[12px]`}
              >
                Start Study Session →
              </button>
            </>
          )}
          {phase !== "read" && phase !== "done" && (
            <button
              onClick={() => setPhase(phase === "study" ? "read" : phase === "recall" ? "study" : "recall")}
              className={btn.ghost}
            >
              ← back
            </button>
          )}
        </div>
      </div>

      <div ref={articleRef} style={{ minHeight: 200 }}>
        {phase === "read" && (
          <ArticlePhase
            contentId={contentId}
            paragraphs={paragraphs}
            tiers={tiers}
            savedVocab={savedVocab}
            railTargets={allTargets}
            selectedIds={selected}
            onToggleTarget={toggleTarget}
            onAddTarget={addAdHocTarget}
          >
            <div className="mt-4 rounded-2xl bg-[#0071e3]/[0.05] px-5 py-4 text-center lg:hidden">
              <p className="text-[12.5px] text-ink-2">Selected {chosen.length} / 5 target expressions</p>
            </div>
          </ArticlePhase>
        )}

        {phase === "study" && <StudyPhase targets={chosen} onDone={() => setPhase("recall")} />}
        {phase === "recall" && <RecallPhase targets={chosen} onDone={() => setPhase("transfer")} />}
        {phase === "transfer" && <TransferPhase targets={chosen} onDone={() => { setPhase("done"); markStepAction("reading"); markStepAction("notice"); }} />}
        {phase === "done" && <DoneSummary targets={chosen} minutes={Math.round(seconds / 60)} />}
      </div>
    </div>
  );
}

/* ── STEP 3+4 · Deep processing with progressive disclosure + generation ──── */

function StudyPhase({ targets, onDone }: { targets: LabTarget[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const t = targets[idx];

  if (!t) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-[0_0_0_0.5px_rgba(0,0,0,0.06)]">
        <p className="text-sm text-ink-2"><T en="No targets selected — go back and pick a few." zh="还没有选中表达 —— 回到阅读页勾选几个。" /></p>
      </div>
    );
  }

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-1.5">
        {targets.map((x, i) => (
          <span key={x.chunkId} className={`h-1.5 flex-1 rounded-full ${i < idx ? "bg-[#34c759]" : i === idx ? "bg-ink" : "bg-black/[0.08]"}`} />
        ))}
        <span className="ml-2 font-mono text-[12px] text-ink-3">{idx + 1}/{targets.length}</span>
      </div>

      <StudyCard key={t.chunkId} target={t} onNext={() => (idx + 1 >= targets.length ? onDone() : setIdx(idx + 1))} last={idx + 1 >= targets.length} />
    </div>
  );
}

const DIMENSIONS = [
  "Meaning",
  "Pattern",
  "Collocations",
  "Related & contrast",
  "Why native speakers use it",
  "Common mistakes",
  "IELTS Speaking",
  "IELTS Writing",
] as const;

/* Persona: weak-English reader — dimension names get a Chinese twin in 中英 mode. */
const DIMENSION_ZH: Record<(typeof DIMENSIONS)[number], string> = {
  Meaning: "含义",
  Pattern: "句式",
  Collocations: "搭配",
  "Related & contrast": "关联与对比",
  "Why native speakers use it": "母语者为什么这样用",
  "Common mistakes": "常见错误",
  "IELTS Speaking": "雅思口语",
  "IELTS Writing": "雅思写作",
};

function StudyCard({ target, onNext, last }: { target: LabTarget; onNext: () => void; last: boolean }) {
  const bilingual = useBilingual();
  const [revealed, setRevealed] = useState(1);
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [sentence, setSentence] = useState("");
  const [verdict, setVerdict] = useState<{
    usedChunk: boolean;
    understandable: boolean;
    natural: boolean;
    ieltsUseful: boolean;
    pass: boolean;
    feedback: string;
    errors: { wrong: string; correct: string; explanation: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  useEffect(() => {
    fetch("/api/ai/sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence: target.examples[0] ?? target.text }),
    })
      .then((r) => r.json())
      .then((d) => !d.error && setAnalysis(d));
  }, [target.chunkId]);

  const judge = async () => {
    if (!sentence.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId: target.chunkId, sentence }),
      });
      const data = await res.json();
      if (data.verdict) setVerdict(data.verdict);
    } finally {
      setBusy(false);
    }
  };

  const sections: Record<(typeof DIMENSIONS)[number], React.ReactNode> = {
    Meaning: (
      <div className="space-y-1">
        <p className="text-[13.5px] leading-relaxed text-ink">{target.meaningEn}</p>
        <ChineseReveal text={target.meaningZh} />
      </div>
    ),
    Pattern: (
      <code className="block rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-[12px] text-ink">{target.pattern}</code>
    ),
    Collocations: (
      <div className="flex flex-wrap gap-1.5">
        {target.examples.map((e) => (
          <span key={e} className="rounded-md bg-black/[0.05] px-2 py-1 text-[12px] font-medium text-ink-2">{e}</span>
        ))}
      </div>
    ),
    "Related & contrast": analysis ? (
      <div className="space-y-2 text-[13px] leading-relaxed">
        {analysis.alternatives.slice(0, 3).map((a) => (
          <p key={a.expression}>
            <span className="font-semibold text-ink">{a.expression}</span> — <span className="text-ink-2">{a.note}</span>
          </p>
        ))}
        <p className="text-ink-2">{analysis.differences}</p>
      </div>
    ) : (
      <AnalysisSkeleton />
    ),
    "Why native speakers use it": analysis ? (
      <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
        <p>{analysis.whyThisExpression}</p>
        <p className="text-ink-3">{analysis.nativeLogic}</p>
      </div>
    ) : (
      <AnalysisSkeleton />
    ),
    "Common mistakes": (
      <ul className="space-y-1.5 text-[13px] text-ink-2">
        <li>▸ 逐字翻译会丢掉神韵 —— 把 <b className="text-ink">{target.pattern || target.text}</b> 当作一个整体来记。</li>
        <li>▸ 多数学习者只是看懂、从未产出 —— 下面的步骤正是解决这个问题的。</li>
      </ul>
    ),
    "IELTS Speaking": analysis ? (
      <p className="text-[13px] leading-relaxed text-ink-2">{analysis.transfer.speaking}</p>
    ) : (
      <AnalysisSkeleton />
    ),
    "IELTS Writing": analysis ? (
      <p className="text-[13px] leading-relaxed text-ink-2">{analysis.transfer.writing}</p>
    ) : (
      <AnalysisSkeleton />
    ),
  };

  return (
    <div className="card-specular space-y-4 rounded-2xl bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Deep Processing · 深度加工</div>
          <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{target.text}</h3>
        </div>
        {analysis?.isMock && <MockBadge />}
      </div>

      {/* progressive disclosure */}
      <div className="space-y-2">
        {DIMENSIONS.slice(0, revealed).map((d) => (
          <div key={d} className="enter rounded-xl bg-black/[0.025] px-4 py-3">
            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">{bilingual ? `${d} ${DIMENSION_ZH[d]}` : d}</div>
            {sections[d]}
          </div>
        ))}
      </div>
      {revealed < DIMENSIONS.length ? (
        <button
          onClick={() => {
            setRevealed((r) => r + 1);
            if (revealed + 1 >= 3) start(() => logEventAction(target.chunkId, "analysis", `${revealed + 1} dims`));
          }}
          className={`${btn.secondary} w-full`}
        >
          <T en={`▸ Reveal next dimension (${revealed}/${DIMENSIONS.length})`} zh={`▸ 揭开下一层（${revealed}/${DIMENSIONS.length}）`} />
        </button>
      ) : (
        <p className="text-center text-[12px] text-ink-3">All 8 dimensions revealed — now make it yours ↓</p>
      )}

      {/* STEP 4 — generation */}
      <div className="rounded-xl border border-[#0071e3]/25 bg-[#0071e3]/[0.04] px-4 py-4">
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#0068d0]">
          Generation · 生成你自己的句子
        </div>
        <p className="mb-2.5 text-[13.5px] font-medium text-ink">
          <T
            en={<>Write one sentence about <span className="underline decoration-[#0071e3]/40">your own life</span> using “{target.text}”.</>}
            zh={<>用 <span className="underline decoration-[#0071e3]/40">你自己的生活</span> 造一个句子，用上 “{target.text}”。</>}
          />
        </p>
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          rows={2}
          placeholder="写你自己真实的事 —— 真实的句子才记得住（Say it about YOUR reality）"
          className={`${inputCls} resize-none bg-white/80`}
        />
        <div className="mt-2.5 flex items-center gap-2.5">
          <button onClick={judge} disabled={busy || !sentence.trim()} className={btn.primary}>
            {busy ? <T en="Judging…" zh="判断中…" /> : <T en="Submit" zh="提交" />}
          </button>
          {!verdict?.pass && (
            <button onClick={onNext} className={btn.ghost}>
              {last ? <T en="skip to finish →" zh="跳过，直接完成 →" /> : <T en="skip →" zh="跳过 →" />}
            </button>
          )}
        </div>

        {verdict && (
          <div className="enter mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {[
                ["uses chunk", verdict.usedChunk],
                ["understandable", verdict.understandable],
                ["natural", verdict.natural],
                ["IELTS-useful", verdict.ieltsUseful],
              ].map(([label, ok]) => (
                <Badge key={label as string} tone={ok ? "success" : "neutral"}>
                  {ok ? "✓" : "○"} {label as string}
                </Badge>
              ))}
            </div>
            {verdict.errors.map((e) => (
              <p key={e.wrong} className="rounded-lg bg-[#ff3b30]/[0.07] px-3 py-2 text-[12.5px] text-ink-2">
                <span className="line-through text-ink-3">{e.wrong}</span> → <b className="text-ink">{e.correct}</b>
                <span className="block text-[12px]">{e.explanation}</span>
              </p>
            ))}
            <p className={`text-[13px] leading-relaxed ${verdict.pass ? "text-[#1e7d34]" : "text-ink-2"}`}>{verdict.feedback}</p>
            {verdict.pass && (
              <button onClick={onNext} className={`${btn.primary} w-full`}>
                {last ? "Proceed to Retrieval →" : "Next expression →"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── STEP 5+6 · Closed-book retrieval + context transfer ──────────────────── */

function RecallPhase({ targets, onDone }: { targets: LabTarget[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const t = targets[idx];
  if (!t) return null;
  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-1.5">
        {targets.map((x, i) => (
          <span key={x.chunkId} className={`h-1.5 flex-1 rounded-full ${i < idx ? "bg-[#34c759]" : i === idx ? "bg-ink" : "bg-black/[0.08]"}`} />
        ))}
        <span className="ml-2 font-mono text-[12px] text-ink-3">{idx + 1}/{targets.length}</span>
      </div>
      <RecallCard key={t.chunkId} target={t} onNext={() => (idx + 1 >= targets.length ? onDone() : setIdx(idx + 1))} last={idx + 1 >= targets.length} />
    </div>
  );
}

function RecallCard({ target, onNext, last }: { target: LabTarget; onNext: () => void; last: boolean }) {
  const [zhAnswer, setZhAnswer] = useState("");
  const [zhResult, setZhResult] = useState<{ quality: number; verdict: string; targetAnswer: string } | null>(null);
  const [ctxAnswer, setCtxAnswer] = useState("");
  const [ctxResult, setCtxResult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const submitZh = async (skip = false) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/review/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retrievalItemId: target.retrievalItemId, mode: "production", response: skip ? "" : zhAnswer }),
    });
    setZhResult(await res.json());
    setBusy(false);
  };

  const submitCtx = () => {
    const used = CHUNK_DETECT[target.text] ? CHUNK_DETECT[target.text].test(ctxAnswer) : ctxAnswer.includes(target.text);
    setCtxResult(used);
    if (used) logEventAction(target.chunkId, "context_transfer", ctxAnswer);
  };

  return (
    <div className="card-specular space-y-4 rounded-2xl bg-white p-6">
      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Retrieval · 闭卷提取（表达已隐藏）</div>

      {/* STEP 5 — produce from Chinese cue */}
      {!zhResult ? (
        <div className="space-y-3">
          <p className="text-[17px] font-medium leading-relaxed text-ink">{target.zhCue}</p>
          <textarea
            autoFocus
            value={zhAnswer}
            onChange={(e) => setZhAnswer(e.target.value)}
            rows={2}
            placeholder="Say it out loud first, then type the English… 先说出声，再打出来"
            className={`${inputCls} resize-none text-[15px]`}
          />
          <div className="flex items-center gap-2.5">
            <button onClick={() => submitZh()} disabled={busy || !zhAnswer.trim()} className={btn.primary}>
              {busy ? <T en="Checking…" zh="检查中…" /> : <T en="Submit ⏎" zh="提交 ⏎" />}
            </button>
            <button onClick={() => submitZh(true)} disabled={busy} className={btn.ghost}>
              想不起来了（记为失败）
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-xl px-4 py-3 ${zhResult.quality === 5 ? "bg-[#34c759]/[0.09]" : zhResult.quality === 3 ? "bg-[#ff9f0a]/[0.1]" : "bg-[#ff3b30]/[0.07]"}`}>
            <p className="text-[13.5px] font-semibold text-ink">
              {zhResult.quality === 5 ? "✓" : zhResult.quality === 3 ? "◑" : "✗"} {zhResult.verdict}
            </p>
            {zhResult.quality < 5 && (
              <p className="mt-1.5 text-[13px] text-ink">
                <span className="text-ink-3"><T en="Target:" zh="正确表达：" /></span> <b>{zhResult.targetAnswer}</b>
              </p>
            )}
          </div>

          {/* STEP 6 — context transfer */}
          {ctxResult === null ? (
            <div className="space-y-2.5 rounded-xl border border-[#5856d6]/25 bg-[#5856d6]/[0.05] px-4 py-4">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-[#4344b8]">
                Context Transfer · 换境迁移 — a completely different scene
              </div>
              <p className="text-[13.5px] font-medium text-ink">{target.transferInstruction}</p>
              {target.transferSentence && (
                <p className="rounded-lg bg-white px-3.5 py-2.5 text-[13.5px] italic text-ink-2 shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]">
                  {target.transferSentence}
                </p>
              )}
              <textarea
                value={ctxAnswer}
                onChange={(e) => setCtxAnswer(e.target.value)}
                rows={2}
                placeholder={`Use "${target.text}" in this new context…`}
                className={`${inputCls} resize-none bg-white/80`}
              />
              <div className="flex items-center gap-2.5">
                <button onClick={submitCtx} disabled={!ctxAnswer.trim()} className={btn.primary}>
                  Check rewrite
                </button>
                <button onClick={() => setCtxResult(false)} className={btn.ghost}>
                  skip
                </button>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl px-4 py-3 ${ctxResult ? "bg-[#34c759]/[0.09]" : "bg-black/[0.03]"}`}>
              {ctxResult ? (
                <p className="text-[13.5px] text-ink">
                  ✓ Transferable — you used it outside today's article. That's the difference between reciting and owning.
                </p>
              ) : (
                <p className="text-[13px] text-ink-2">
                  Model: <b>{target.examples[0] ?? target.text}</b> — pattern: {target.pattern || target.text}
                </p>
              )}
              <button onClick={onNext} className={`${btn.primary} mt-3 w-full`}>
                {last ? <T en="Proceed to Speaking →" zh="进入口语环节 →" /> : <T en="Next expression →" zh="下一个表达 →" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── STEP 7+8 · Speaking + IELTS transfer ─────────────────────────────────── */

function TransferPhase({ targets, onDone }: { targets: LabTarget[]; onDone: () => void }) {
  const first = targets[0];
  const speakingPrompt = (first && (speakingPromptByChunk[first.text] ?? `Tell me about something that involves "${first.text}" in your own life.`)) ?? "";
  const ieltsQ = first ? ieltsQuestionFor(first.text) : "";

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <SpeakingCard title="STEP 7 · Speaking Transfer 口语迁移" prompt={speakingPrompt} requiredChunkIds={targets.map((t) => t.chunkId)} />
      <SpeakingCard title="STEP 8 · IELTS Transfer 雅思迁移" prompt={ieltsQ} requiredChunkIds={targets.map((t) => t.chunkId)} ielts />
      <button onClick={onDone} className={`${btn.primary} w-full`}>
        Finish session ✓
      </button>
    </div>
  );
}

function SpeakingCard({
  title,
  prompt,
  requiredChunkIds,
  ielts,
}: {
  title: string;
  prompt: string;
  requiredChunkIds: number[];
  ielts?: boolean;
}) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const rec = useSpeechRecognition();
  const live = rec.state === "listening" ? `${rec.transcript} ${rec.interim}`.trim() : text;

  const submit = async () => {
    if (!live.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, transcript: live, requiredChunkIds, ielts }),
      });
      const data = await res.json();
      if (data.feedback) {
        setFeedback(data.feedback);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-specular rounded-2xl bg-white p-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</div>
        {feedback?.isMock && <MockBadge />}
      </div>
      <p className="text-[15.5px] font-medium leading-relaxed text-ink">{prompt}</p>
      <textarea
        value={live}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Speak (mic) or type — 3–5 sentences, use today's expressions naturally…"
        className={`${inputCls} mt-3 resize-none`}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        {rec.supported && (
          <button
            onClick={() => (rec.state === "listening" ? rec.stop() : rec.start())}
            className={`press rounded-xl px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ${
              rec.state === "listening" ? "bg-[#ff3b30] text-white" : "bg-[#0071e3]/10 text-[#0068d0] hover:bg-[#0071e3]/20"
            }`}
          >
            {rec.state === "listening" ? "● stop" : "🎤 Speak"}
          </button>
        )}
        <button onClick={submit} disabled={busy || !live.trim()} className={btn.primary}>
          {busy ? <T en="Coach listening…" zh="教练正在听…" /> : <T en="Submit" zh="提交" />}
        </button>
      </div>

      {feedback && (
        <div className="enter mt-4 space-y-2.5">
          <div className="grid grid-cols-5 gap-2">
            {[
              ["Fluency", feedback.ielts.fluency],
              ["Coherence", feedback.ielts.coherence],
              ["Lexical", feedback.ielts.lexical],
              ["Grammar", feedback.ielts.grammar],
              ["Overall", feedback.overallEstimate],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-black/[0.03] py-2 text-center">
                <div className="text-[12px] font-semibold uppercase text-ink-3">{l as string}</div>
                <div className="font-mono text-[15px] font-semibold tabular-nums text-ink">{v as number}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {feedback.chunksUsed.map((c) => (
              <Badge key={c.text} tone={c.used ? "success" : "warn"}>
                {c.used ? "✓" : "○"} {c.text}
              </Badge>
            ))}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">{feedback.summary}</p>
        </div>
      )}
    </div>
  );
}

/* ── Session summary ──────────────────────────────────────────────────────── */

function DoneSummary({ targets, minutes }: { targets: LabTarget[]; minutes: number }) {
  return (
    <div className="enter mx-auto max-w-2xl">
      <div className="card-specular rounded-2xl bg-white p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#34c759]/15 text-[22px]">✓</div>
        <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">Session complete · 本节完成</h3>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T
            en={`${minutes} min · ${targets.length} expressions went through Notice → Deep Processing → Generation → Retrieval → Transfer.`}
            zh={`${minutes} 分钟 · ${targets.length} 个表达完整走过 注意 → 深度加工 → 造句生成 → 闭卷提取 → 迁移。`}
          />
        </p>
        <p className="mx-auto mt-3 max-w-md rounded-xl bg-[#34c759]/[0.08] px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          接触 ≠ 学会。今天真正产出过的表达已计入 Active Chunks，并排入明日的闭卷回归——明早它们会在首页等你。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <Link href="/" className={btn.primary}>
            <T en="← Mission Control" zh="← 回主控台" />
          </Link>
          <Link href="/review" className={btn.secondary}>
            <T en="One more retrieval round ↺" zh="再来一轮闭卷提取 ↺" />
          </Link>
          <Link href="/library" className={btn.secondary}>
            <T en="Next article →" zh="下一篇 →" />
          </Link>
        </div>
      </div>
    </div>
  );
}
