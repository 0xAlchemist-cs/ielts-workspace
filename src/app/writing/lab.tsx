"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock, Lightbulb } from "lucide-react";
import { markStepAction, saveCustomChunkAction } from "@/app/actions";
import { MockBadge, btn } from "@/components/ui";
import { ChineseReveal } from "@/components/learn";
import { ElapsedWait, Segmented, toast } from "@/components/motion";
import { T, useBilingual } from "@/components/i18n";
import { AiNudge } from "@/components/ai-nudge";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import type { ParaphraseFeedback, WritingFeedback } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════════
   WRITING LAB V2 — a real writing environment first.
   Task → Plan → Write → Feedback → Rewrite → Transfer.
   The Retrieval Engine is a quiet assistant (suggest, never force):
   focus expressions are offered, usage is detected, absence is never failure.
   ═══════════════════════════════════════════════════════════════════════════ */

type TaskType = "task2" | "task1" | "free" | "paraphrase";
type Stage = "task" | "plan" | "write" | "feedback" | "rewrite" | "transfer";

interface TargetChunk {
  id: number;
  text: string;
  meaningZh: string;
  strength: number;
}
interface BankTask {
  id: string;
  taskType: string;
  prompt: string;
  hint: string;
}

const STAGES: { key: Stage; en: string; zh: string }[] = [
  { key: "task", en: "Task", zh: "题目" },
  { key: "plan", en: "Plan", zh: "构思" },
  { key: "write", en: "Write", zh: "写作" },
  { key: "feedback", en: "Feedback", zh: "反馈" },
  { key: "rewrite", en: "Rewrite", zh: "重写" },
  { key: "transfer", en: "Use it again", zh: "再用一次" },
];

const TYPE_TITLE: Record<Exclude<TaskType, "paraphrase">, { en: string; zh: string; words: number }> = {
  task2: { en: "IELTS Writing Task 2", zh: "雅思大作文", words: 250 },
  task1: { en: "IELTS Writing Task 1", zh: "雅思图表作文", words: 150 },
  free: { en: "Free Writing", zh: "自由写作", words: 0 },
};

/* Task-type guidance shown in "Understand the task" — static, honest, per type */
const TYPE_GUIDE: Record<Exclude<TaskType, "paraphrase">, { en: string[]; zh: string[] }> = {
  task2: {
    en: [
      "Question type: opinion / discussion — take a clear position and defend it",
      "Key requirements: one clear position, two developed ideas, real examples",
      "Answer the exact question asked — don't write around it",
    ],
    zh: [
      "题型：观点/讨论题——明确立场并论证",
      "关键要求：一个明确立场 + 两个展开的分论点 + 真实例子",
      "直接回答题目所问，不要绕着写",
    ],
  },
  task1: {
    en: [
      "Question type: data / diagram description — report, don't opinions",
      "Key requirements: overview first, key features, comparisons — not every number",
      "Write at least 150 words in an objective register",
    ],
    zh: [
      "题型：图表描述——只陈述，不发表观点",
      "关键要求：先总览，抓主要特征和对比，不必罗列所有数字",
      "至少 150 词，使用客观语域",
    ],
  },
  free: {
    en: [
      "No format rules — write about something you actually want to say",
      "Use this to practise expressions and structures you've been learning",
      "Length doesn't matter; finishing a thought does",
    ],
    zh: [
      "没有格式规则——写你真正想表达的东西",
      "用它来练习你正在学的表达和句型",
      "长度不重要，把一个想法写完整才重要",
    ],
  },
};

/* ── Instant local first-pass (zero-latency, no AI) ─────────────────────────
 * Real signals computed the moment the learner submits; the examiner's deep
 * feedback lands later on top of them. */
interface InstantCheck {
  words: number;
  target: number;
  sentences: number;
  avgLen: number;
  used: string[];
  unused: string[];
  total: number;
}

function computeInstant(content: string, focusTexts: string[], target: number): InstantCheck {
  const words = content.split(/\s+/).filter(Boolean).length;
  const sentences = Math.max(1, (content.match(/[.!?]+/g) ?? []).length);
  const used: string[] = [];
  const unused: string[] = [];
  for (const t of focusTexts) {
    const hit = CHUNK_DETECT[t] ? CHUNK_DETECT[t].test(content) : content.toLowerCase().includes(t.toLowerCase());
    (hit ? used : unused).push(t);
  }
  return { words, target, sentences, avgLen: Math.round(words / sentences), used, unused, total: focusTexts.length };
}

export function WritingLab({
  aiLive,
  tasks,
  paraphrases,
  targetChunks,
}: {
  aiLive?: boolean;
  tasks: BankTask[];
  paraphrases: { id: string; source: string; sourceZh: string }[];
  targetChunks: TargetChunk[];
}) {
  const [taskType, setTaskType] = useState<TaskType>("task2");
  const [stage, setStage] = useState<Stage>("task");
  // session timer — IELTS gives Task 2 forty minutes; awareness beats panic
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const bilingual = useBilingual();

  const switchType = (t: TaskType) => {
    setTaskType(t);
    setStage("task");
  };

  if (taskType === "paraphrase") {
    return (
      <div className="shell-wide">
        <AiNudge aiLive={!!aiLive} />
        <LabHeader />
        <TypeSelector taskType={taskType} onChange={switchType} />
        <ParaphrasePanel items={paraphrases} />
      </div>
    );
  }

  return (
    <div className="shell-wide">
      <AiNudge aiLive={!!aiLive} />
      <LabHeader />
      <TypeSelector taskType={taskType} onChange={switchType} />

      {/* sticky stage journey + session timer (same session-bar pattern as Reading) */}
      <div className="material-header sticky top-[64px] z-20 -mx-4 mb-6 mt-6 flex items-center gap-3 overflow-x-auto border-b border-line px-4 py-2.5 sm:-mx-7 sm:px-7">
        <div className="flex min-w-max items-center">
          {STAGES.map((s, i) => {
            const si = STAGES.findIndex((x) => x.key === stage);
            const state = i < si ? "done" : i === si ? "current" : "todo";
            return (
              <span key={s.key} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  disabled={state === "todo"}
                  onClick={() => state !== "todo" && setStage(s.key)}
                  className={`group flex flex-col items-center gap-1.5 ${state === "todo" ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors duration-150 ${
                      state === "done"
                        ? "bg-accent"
                        : state === "current"
                          ? "bg-accent shadow-[0_0_0_4px_var(--accent-quiet)]"
                          : "border border-line-strong"
                    }`}
                  >
                    {state === "done" && <Check size={10} strokeWidth={3} className="text-white" />}
                    {state === "current" && <span className="h-[5px] w-[5px] rounded-full bg-white" />}
                  </span>
                  <span
                    className={`whitespace-nowrap text-[12px] sm:text-[12px] ${
                      state === "current" ? "font-medium text-ink" : state === "done" ? "text-ink-2" : "text-ink-3/70"
                    }`}
                  >
                    <T en={s.en} zh={s.zh} />
                  </span>
                </button>
                {i < STAGES.length - 1 && <span className={`mx-1 h-px flex-1 sm:mx-2 ${state === "done" ? "bg-accent/30" : "bg-line"}`} />}
              </span>
            );
          })}
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1 font-mono tabular-nums text-ink-3">
          <Clock size={11} strokeWidth={1.9} />
          {mmss}
        </span>
      </div>

      <EssayFlow
        key={taskType}
        taskType={taskType}
        tasks={tasks}
        focusChunks={targetChunks}
        stage={stage}
        setStage={setStage}
        bilingual={bilingual}
      />
    </div>
  );
}

/* ── Header + type selector ────────────────────────────────────────────────── */

function LabHeader() {
  return (
    <header>
      <h1 className="text-display">
        <T en="Writing" zh="写作" />
      </h1>
      <p className="mt-1.5 text-[13px] text-ink-2">
        <T en="Write meaningful English → get feedback → rewrite it yourself → use it on a new question." zh="写出有内容的英语 → 获得反馈 → 自己重写 → 用到新题目上。" />
      </p>
    </header>
  );
}

function TypeSelector({ taskType, onChange }: { taskType: TaskType; onChange: (t: TaskType) => void }) {
  return (
    <div className="mt-8">
      <p className="t-section">
        <T en="Task Type" zh="写作类型" />
      </p>
      <div className="mt-3">
        <Segmented<TaskType>
          value={taskType}
          onChange={onChange}
          options={[
            { value: "task2", label: <T en="Task 2" zh="大作文" /> },
            { value: "task1", label: <T en="Task 1" zh="图表" /> },
            { value: "free", label: <T en="Free Writing" zh="自由写" /> },
            { value: "paraphrase", label: <T en="Paraphrase" zh="改写" /> },
          ]}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Essay flow — Task → Plan → Write → Feedback → Rewrite → Transfer
   ═══════════════════════════════════════════════════════════════════════════ */

interface Plan {
  position: string;
  idea1: string;
  idea2: string;
  examples: string;
}

function EssayFlow({
  taskType,
  tasks,
  focusChunks,
  stage,
  setStage,
  bilingual,
}: {
  taskType: Exclude<TaskType, "paraphrase">;
  tasks: BankTask[];
  focusChunks: TargetChunk[];
  stage: Stage;
  setStage: (s: Stage) => void;
  bilingual: boolean;
}) {
  const pool = tasks.filter((t) =>
    taskType === "free" ? t.taskType === "general" : t.taskType === taskType,
  );
  const [taskId, setTaskId] = useState(pool[0]?.id ?? "");
  const [customTopic, setCustomTopic] = useState("");
  const task = pool.find((t) => t.id === taskId) ?? pool[0];

  const effectivePrompt =
    taskType === "free" && customTopic.trim()
      ? `${customTopic.trim()}. Write freely — develop the thought in full sentences.`
      : (task?.prompt ?? "");

  const [plan, setPlan] = useState<Plan>({ position: "", idea1: "", idea2: "", examples: "" });
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteAnswers, setRewriteAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [finalFeedback, setFinalFeedback] = useState<WritingFeedback | null>(null);
  const [transferText, setTransferText] = useState("");
  const [transferUsed, setTransferUsed] = useState<string[] | null>(null);
  const [savedExpr, setSavedExpr] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [instant, setInstant] = useState<InstantCheck | null>(null);

  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const targetWords = TYPE_TITLE[taskType].words;

  const pickTask = (id: string) => {
    setTaskId(id);
    setFeedback(null);
    setFinalFeedback(null);
    setStage("task");
  };

  /* submit original or rewrite — same endpoint, engines untouched */
  const submit = async (isRewrite: boolean, overridePrompt?: string, overrideText?: string) => {
    const content = (overrideText ?? (isRewrite ? rewriteText : text)).trim();
    if (!content || busy) return;
    // zero-latency local first-pass — real signals the learner sees the moment
    // they submit, while the examiner reads (CHUNK_DETECT + counts, no AI)
    setInstant(computeInstant(content, focusChunks.map((c) => c.text), targetWords));
    setBusy(true);
    try {
      const res = await fetch("/api/ai/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: overridePrompt ?? effectivePrompt,
          text: content,
          taskType: taskType,
          targetChunkIds: focusChunks.map((c) => c.id),
          isRewrite,
          originalAttemptId: isRewrite ? attemptId : undefined,
        }),
      });
      const data = await res.json();
      if (!data.feedback) return;
      if (overridePrompt !== undefined) {
        // transfer submission — we only need the detection result, not a new stage
        setTransferUsed((data.usedChunkTexts ?? []) as string[]);
        return;
      }
      if (isRewrite) {
        setFinalFeedback(data.feedback);
      } else {
        setFeedback(data.feedback);
        setAttemptId(data.attemptId);
        setRewriteText(content);
        setStage("feedback");
      }
    } finally {
      setBusy(false);
    }
  };

  /* transfer task: a different-but-related context, deterministically rotated */
  const transferPool = tasks.filter((t) => t.id !== task?.id && t.taskType !== "general");
  const transferTask = transferPool[(pool.findIndex((t) => t.id === (taskId || pool[0]?.id)) + 1) % Math.max(transferPool.length, 1)] ?? transferPool[0];

  /* ── STAGE: TASK ──────────────────────────────────────────────────────── */
  if (stage === "task") {
    const guide = TYPE_GUIDE[taskType];
    return (
      <div className="enter mt-12 max-w-3xl">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
          <T en={TYPE_TITLE[taskType].en} zh={TYPE_TITLE[taskType].zh} />
        </h2>

        {pool.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {pool.map((t) => (
              <button key={t.id} onClick={() => pickTask(t.id)} className={`press max-w-[320px] truncate rounded-lg px-3 py-1.5 text-[12px] font-medium ${(taskId || pool[0]?.id) === t.id ? "chip-on" : "chip"}`}>
                {t.prompt.slice(0, 46)}…
              </button>
            ))}
          </div>
        )}
        {taskType === "free" && (
          <input
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="Your own topic 你自己的题目（可选）"
            className="input-base mt-5 w-full max-w-xl px-4 py-2.5 text-[14px]"
          />
        )}

        <blockquote className="mt-6 text-[18px] font-medium leading-relaxed tracking-[-0.01em] text-ink">
          {effectivePrompt}
        </blockquote>

        <div className="mt-10">
          <p className="t-section">
            <T en="Understand the task" zh="理解题目" />
          </p>
          <ul className="mt-3 space-y-2">
            {guide.en.map((g, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                <T en={g} zh={guide.zh[i]} />
              </li>
            ))}
          </ul>
        </div>

        {focusChunks.length > 0 && <FocusStrip chunks={focusChunks} />}

        <div className="mt-10">
          <button onClick={() => setStage("plan")} className={`${btn.primary} h-10 px-5`}>
            <T en="Start planning" zh="开始构思" />
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  /* ── STAGE: PLAN ──────────────────────────────────────────────────────── */
  if (stage === "plan") {
    const fields: { key: keyof Plan; en: string; zh: string; ph: string }[] = [
      { key: "position", en: "Your position", zh: "你的立场", ph: "e.g. I largely agree — with one caveat" },
      { key: "idea1", en: "Main idea 1", zh: "主论点一", ph: "one sentence" },
      { key: "idea2", en: "Main idea 2", zh: "主论点二", ph: "one sentence" },
      { key: "examples", en: "Examples", zh: "例子", ph: "real examples, statistics, or personal experience" },
    ];
    return (
      <div className="enter mt-12 max-w-2xl">
        <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
          <T en="Plan your essay" zh="构思你的文章" />
        </h2>
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          <T en="Bullet points are enough — the plan won't be graded." zh="写要点就够——构思不打分。" />
        </p>
        <div className="mt-7 space-y-5">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
                <T en={f.en} zh={f.zh} />
              </span>
              <input
                value={plan[f.key]}
                onChange={(e) => setPlan((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.ph}
                className="input-base w-full px-4 py-2.5 text-[14px]"
              />
            </label>
          ))}
        </div>
        <div className="mt-9 flex items-center gap-5">
          <button onClick={() => setStage("write")} className={`${btn.primary} h-10 px-5`}>
            <T en="Start writing" zh="开始写作" />
            <ArrowRight size={15} strokeWidth={2} />
          </button>
          <button onClick={() => setStage("task")} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
            <T en="← Back to task" zh="← 回题目" />
          </button>
        </div>
      </div>
    );
  }

  /* ── STAGE: WRITE — the editor is the page ────────────────────────────── */
  if (stage === "write") {
    return (
      <div className="enter mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="t-section">
            <T en={TYPE_TITLE[taskType].en} zh={TYPE_TITLE[taskType].zh} /> · <T en="Essay" zh="作文" />
          </p>
          <p className="text-[12px] tabular-nums text-ink-3">
            {wordCount(text)} words{targetWords > 0 ? ` · ${bilingual ? `目标 ${targetWords}+` : `target ${targetWords}+`}` : ""}
            {" · "}
            <WriteTimer />
          </p>
        </div>

        {focusChunks.length > 0 && (
          <div className="mt-4">
            <FocusStrip chunks={focusChunks} />
          </div>
        )}

        <PlanRecall plan={plan} />

        <div className="card-specular mt-5 rounded-card bg-surface">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            placeholder="Write your essay here…"
            className="w-full resize-y bg-transparent px-7 py-7 text-[15.5px] leading-[1.9] text-ink outline-none placeholder:text-ink-3 sm:px-9 sm:py-8"
          />
        </div>

        {busy && instant && (
          <div className="mt-6 rounded-xl bg-surface-2 px-5 py-4">
            <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
              <T en="Instant check" zh="即时检查" />
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
              <li>
                {instant.words}/{instant.target}+ <T en="words" zh="词" />
                {instant.words >= instant.target ? (
                  <span className="ml-1.5 text-ok-text">✓</span>
                ) : (
                  <span className="ml-1.5">· <T en="below target" zh="未达标" /></span>
                )}
                {" · "}
                {instant.sentences} <T en="sentences" zh="句" /> · <T en="avg" zh="平均" /> {instant.avgLen} <T en="words/sentence" zh="词/句" />
              </li>
              {instant.total > 0 && (
                <li>
                  <T en="Focus expressions used" zh="焦点表达已用上" /> {instant.used.length}/{instant.total}
                  {instant.used.length > 0 && <span className="ml-1.5 text-ok-text">✓ {instant.used.join(" · ")}</span>}
                  {instant.unused.length > 0 && (
                    <span className="ml-1.5 text-ink-3">
                      <T en="not yet" zh="未用" />: {instant.unused.join(" · ")}
                    </span>
                  )}
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center gap-5">
          <button onClick={() => submit(false)} disabled={busy || !text.trim()} className={btn.primary}>
            {busy ? <T en="Evaluating…" zh="评估中…" /> : <T en="Submit for evaluation" zh="提交评估" />}
            {!busy && <ArrowRight size={15} strokeWidth={2} />}
          </button>
          <button onClick={() => setStage("plan")} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
            <T en="← Plan" zh="← 构思" />
          </button>
          {busy && (
            <ElapsedWait en="Examiner reading your essay — usually 40–180 s" zh="考官批改中 — 通常 40–180 秒" />
          )}
        </div>
      </div>
    );
  }

  /* ── STAGE: FEEDBACK — diagnosis, strategy vs language ────────────────── */
  if (stage === "feedback" && feedback) {
    return (
      <div className="enter mt-12 max-w-3xl">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Feedback" zh="反馈" />
          </h2>
          {feedback.isMock && <MockBadge />}
        </div>

        {/* band row — present, not dominant */}
        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="t-caption"><T en="Band estimate" zh="预估分数" /></p>
            <p className="mt-1 text-[34px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
              {feedback.overallEstimate.toFixed(1)}
            </p>
          </div>
          {[
            ["Task", "回应", feedback.ielts.taskResponse],
            ["Coherence", "连贯", feedback.ielts.coherence],
            ["Lexical", "词汇", feedback.ielts.lexical],
            ["Grammar", "语法", feedback.ielts.grammar],
          ].map(([en, zh, v]) => (
            <div key={en as string}>
              <p className="t-caption"><T en={en as string} zh={zh as string} /></p>
              <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums text-ink-2">{v as number}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[14px] leading-relaxed text-ink-2">{feedback.summary}</p>

        {/* IELTS Strategy — exam-craft problems, not language */
        feedback.abilityDiagnosis.length > 0 && (
          <section className="mt-10">
            <p className="t-section">
              <T en="IELTS Strategy" zh="考试策略" />
            </p>
            <ul className="mt-3 space-y-2">
              {feedback.abilityDiagnosis.map((d, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Language problems — sentence level */
        feedback.rewriteTasks && feedback.rewriteTasks.length > 0 && (
          <section className="mt-10">
            <p className="t-section">
              <T en="Language problems" zh="语言问题" />
            </p>
            <div className="mt-3 space-y-3">
              {feedback.rewriteTasks.map((t) => (
                <div key={t.id} className="rounded-xl bg-surface-2 px-4 py-3">
                  <p className="text-[13.5px] text-ink">
                    <span className="text-ink-3 line-through">{t.original}</span>
                    <span className="mx-2 text-ink-3">→</span>
                    <span className="font-medium">{t.problem}</span>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t.explanation}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 flex items-center gap-5">
          <button onClick={() => setStage("rewrite")} className={`${btn.primary} h-10 px-5`}>
            <T en="Rewrite your essay" zh="重写你的文章" />
            <ArrowRight size={15} strokeWidth={2} />
          </button>
          <button onClick={() => setStage("write")} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
            <T en="← Back to essay" zh="← 回作文" />
          </button>
        </div>
      </div>
    );
  }

  /* ── STAGE: REWRITE — user fixes it themselves ────────────────────────── */
  if (stage === "rewrite" && feedback) {
    const addressed = feedback.rewriteTasks?.filter((t) => (rewriteAnswers[t.id] ?? "").trim()).length ?? 0;
    const flagged = feedback.rewriteTasks?.length ?? 0;

    /* after re-evaluation: Before / After */
    if (finalFeedback) {
      const dims: [string, string, number, number][] = [
        ["Task", "回应", feedback.ielts.taskResponse ?? 0, finalFeedback.ielts.taskResponse ?? 0],
        ["Coherence", "连贯", feedback.ielts.coherence ?? 0, finalFeedback.ielts.coherence ?? 0],
        ["Lexical", "词汇", feedback.ielts.lexical ?? 0, finalFeedback.ielts.lexical ?? 0],
        ["Grammar", "语法", feedback.ielts.grammar ?? 0, finalFeedback.ielts.grammar ?? 0],
      ];
      const delta = finalFeedback.overallEstimate - feedback.overallEstimate;
      return (
        <div className="enter mt-12 max-w-3xl">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Before / After" zh="修改前后" />
          </h2>

          <div className="mt-6 flex items-end gap-10">
            <div>
              <p className="t-caption"><T en="Original" zh="原文" /></p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-ink-3">{feedback.overallEstimate.toFixed(1)}</p>
              <p className="mt-1 text-[12px] text-ink-3">{wordCount(text)} words</p>
            </div>
            <div>
              <p className="t-caption"><T en="Your rewrite" zh="你的重写" /></p>
              <p className={`mt-1 text-[26px] font-semibold leading-none tabular-nums ${delta > 0 ? "text-ink" : "text-ink-3"}`}>
                {finalFeedback.overallEstimate.toFixed(1)}
                {delta > 0 && <span className="ml-1.5 text-[15px] text-ok-text">+{delta.toFixed(1)}</span>}
              </p>
              <p className="mt-1 text-[12px] text-ink-3">{wordCount(rewriteText)} words</p>
            </div>
          </div>

          <section className="mt-10">
            <p className="t-section">
              <T en="What changed" zh="什么变了" />
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-ink-2">
              {dims.map(([en, zh, a, b]) => (
                <li key={en}>
                  <T en={en} zh={zh} />: <span className="tabular-nums text-ink">{a}</span>
                  <span className="mx-1.5 text-ink-3">→</span>
                  <span className={`tabular-nums font-medium ${b > a ? "text-ok-text" : b < a ? "text-err-text" : "text-ink"}`}>{b}</span>
                </li>
              ))}
              <li>
                <T en="Flagged issues you attempted" zh="你动手修的问题" />: <span className="font-medium text-ink">{addressed} / {flagged}</span>
              </li>
              {finalFeedback.usedChunkTexts.length > 0 && (
                <li>
                  <T en="Expressions produced" zh="产出表达" />: <span className="font-medium text-ink">{finalFeedback.usedChunkTexts.join(", ")}</span>
                </li>
              )}
            </ul>
          </section>

          {/* valuable expressions from the essay — opt-in, never auto-banked */}
          {(finalFeedback.acquisition?.reusedExpressions ?? []).length > 0 && (
            <section className="mt-10">
              <p className="t-section">
                <T en="Worth keeping" zh="值得留下" />
              </p>
              <div className="mt-3 space-y-2">
                {(finalFeedback.acquisition?.reusedExpressions ?? []).map((expr) =>
                  savedExpr.has(expr) ? (
                    <p key={expr} className="flex items-center gap-2 text-[13.5px] text-ink-2">
                      <Check size={13} strokeWidth={2.2} className="text-ok-text" />
                      {expr}
                      <span className="text-[12px] text-ink-3">
                        <T en="saved to your LanguageItem bank" zh="已存入语言库" />
                      </span>
                    </p>
                  ) : (
                    <div key={expr} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-2.5">
                      <span className="text-[13.5px] font-medium text-ink">{expr}</span>
                      <button
                        onClick={() =>
                          saveCustomChunkAction({ text: expr, meaningEn: "Detected in your own writing" }).then(() =>
                            setSavedExpr((s) => new Set([...s, expr])),
                          )
                        }
                        className="press shrink-0 text-[12px] font-medium text-accent-text hover:underline"
                      >
                        <T en="Add to LanguageItem" zh="存入语言库" />
                      </button>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          <div className="mt-10">
            <button onClick={() => setStage("transfer")} className={`${btn.primary} h-10 px-5`}>
              <T en="Transfer to a new context" zh="迁移到新语境" />
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      );
    }

    /* rewriting view: original for reference + your rewrite + fix list */
    return (
      <div className="enter mt-12">
        <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
          <T en="Rewrite" zh="重写" />
        </h2>
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          <T en="Fix the problems yourself — the rewrite is the learning." zh="自己修改——重写才是学习。" />
        </p>

        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="t-caption mb-2"><T en="Your original" zh="你的原文" /></p>
            <div className="card-specular max-h-[460px] overflow-y-auto rounded-card bg-surface px-6 py-5">
              <p className="whitespace-pre-wrap text-[13.5px] leading-[1.85] text-ink-3">{text}</p>
            </div>
          </div>
          <div>
            <p className="t-caption mb-2">
              <T en="Your rewrite" zh="你的重写" />
              <span className="ml-2 tabular-nums">{wordCount(rewriteText)} words</span>
            </p>
            <div className="card-specular rounded-card bg-surface">
              <textarea
                value={rewriteText}
                onChange={(e) => setRewriteText(e.target.value)}
                rows={14}
                className="w-full resize-y bg-transparent px-6 py-5 text-[14.5px] leading-[1.85] text-ink outline-none"
              />
            </div>
          </div>
        </div>

        {flagged > 0 && (
          <section className="mt-10 max-w-3xl">
            <p className="t-section">
              <T en="Fix these yourself" zh="自己修这些" />
            </p>
            <div className="mt-3 space-y-3">
              {feedback.rewriteTasks!.map((t) => (
                <div key={t.id} className="rounded-xl bg-surface-2 px-4 py-3.5">
                  <p className="text-[13px] text-ink">
                    <span className="line-through opacity-70">{t.original}</span>
                    <span className="ml-2 font-medium">{t.problem}</span>
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-[12.5px] italic text-ink-2">
                    <Lightbulb size={12} strokeWidth={1.8} className="mt-0.5 shrink-0 not-italic" />
                    {t.hint}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <input
                      value={rewriteAnswers[t.id] ?? ""}
                      onChange={(e) => setRewriteAnswers((ra) => ({ ...ra, [t.id]: e.target.value }))}
                      placeholder={bilingual ? "你的改法 your fix…" : "your fix…"}
                      className="input-base min-w-[220px] flex-1 px-3 py-2 text-[13px]"
                    />
                    {revealed.has(t.id) ? (
                      <span className="text-[12.5px] text-ok-text">
                        <T en="Reference" zh="参考" />: {t.betterVersion ?? "—"}
                      </span>
                    ) : (
                      <button
                        onClick={() => setRevealed((r) => new Set([...r, t.id]))}
                        disabled={!(rewriteAnswers[t.id] ?? "").trim()}
                        className="text-[12px] font-medium text-accent-text disabled:text-ink-3/50"
                      >
                        <T en="Show reference" zh="看参考" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {busy && instant && (
          <p className="mt-4 text-[12.5px] text-ink-2">
            <T en="Instant check" zh="即时检查" />: {instant.words}/{instant.target}+ <T en="words" zh="词" />
            {instant.words >= instant.target ? <span className="ml-1 text-ok-text">✓</span> : null}
            {instant.total > 0 && (
              <>
                {" · "}
                <T en="focus" zh="焦点表达" /> {instant.used.length}/{instant.total}
                {instant.used.length > 0 && <span className="ml-1 text-ok-text">✓</span>}
              </>
            )}
          </p>
        )}

        <div className="mt-10 flex items-center gap-5">
          <button onClick={() => submit(true)} disabled={busy || !rewriteText.trim()} className={btn.primary}>
            {busy ? <T en="Re-evaluating…" zh="重新评估中…" /> : <T en="Re-evaluate rewrite" zh="重新评估" />}
          </button>
          <button onClick={() => setStage("feedback")} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
            <T en="← Feedback" zh="← 反馈" />
          </button>
          {busy && (
            <ElapsedWait en="Comparing versions — usually 40–180 s" zh="对比两版中 — 通常 40–180 秒" />
          )}
        </div>
      </div>
    );
  }

  /* ── STAGE: TRANSFER — prove it travels ──────────────────────────────── */
  if (stage === "transfer") {
    const instruction =
      focusChunks.length > 0
        ? `Write 3–5 sentences for the question below — a different context from your essay. If today's focus expressions (${focusChunks.map((c) => `"${c.text}"`).join(", ")}) fit naturally, use them.`
        : "Write 3–5 sentences for the question below — apply the same argument structure you practised, in this new context.";
    return (
      <div className="enter mt-12 max-w-2xl">
        <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
          <T en="Use it again — new question" zh="再用一次——新题目" />
        </h2>
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          <T en="Same skills, a fresh context — that's how you know they're real." zh="同样的能力，新的语境——这才知道是真的会了。" />
        </p>

        {transferTask && (
          <blockquote className="mt-6 rounded-xl bg-surface-2 px-5 py-4 text-[14.5px] leading-relaxed text-ink">
            {transferTask.prompt}
          </blockquote>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{instruction}</p>

        {transferUsed === null ? (
          <>
            <textarea
              autoFocus
              value={transferText}
              onChange={(e) => setTransferText(e.target.value)}
              rows={5}
              placeholder="3–5 sentences…"
              className="input-base mt-6 w-full px-4 py-3.5 text-[14.5px] leading-relaxed"
            />
            <div className="mt-6 flex items-center gap-5">
              <button
                onClick={() => submit(false, `[Transfer practice] ${transferTask?.prompt ?? ""} — ${instruction}`, transferText)}
                disabled={busy || wordCount(transferText) < 3}
                className={btn.primary}
              >
                {busy ? <T en="Recording…" zh="记录中…" /> : <T en="Record transfer" zh="记录迁移" />}
              </button>
              <Link href="/review" className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
                <T en="Skip → Review" zh="跳过 → 复习" />
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-8 space-y-5">
            <p className="text-[14px] text-ink">
              {transferUsed.length > 0 ? (
                <>
                  <Check size={14} strokeWidth={2.4} className="mr-1.5 inline text-ok-text" />
                  <T en="Recorded — production logged for:" zh="已记录——产出已记入：" />{" "}
                  <span className="font-medium">{transferUsed.join(", ")}</span>
                </>
              ) : (
                <T en="Recorded as writing practice — no expressions detected this time, and that's fine." zh="已记录为写作练习——这次没有检测到表达，完全没关系。" />
              )}
            </p>
            {(finalFeedback?.acquisition?.newErrors.length ?? 0) > 0 && (
              <p className="text-[12.5px] text-ink-3">
                <T en="Recurring errors entered your Error Bank — they'll return in review." zh="稳定错误已进入错误银行——复习时会回来找你。" />
              </p>
            )}
            <div className="flex items-center gap-5">
              <button
                onClick={() => {
                  markStepAction("transfer");
                  toast("Writing complete — expressions and errors entered the system", "success");
                }}
                className={`${btn.primary} h-10 px-5`}
              >
                <T en="Complete" zh="完成" />
                <Check size={15} strokeWidth={2} />
              </button>
              <button
                onClick={() => {
                  setStage("task");
                  setText("");
                  setFeedback(null);
                  setFinalFeedback(null);
                  setRewriteText("");
                  setTransferText("");
                  setTransferUsed(null);
                }}
                className="text-[12.5px] font-medium text-ink-3 hover:text-ink"
              >
                <T en="Write another →" zh="再写一篇 →" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Quiet focus strip — suggest, never force. No strength numbers, no engine talk. */
function FocusStrip({ chunks }: { chunks: TargetChunk[] }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
      <span className="font-medium text-ink-2">
        <T en="Today's language focus" zh="今日语言焦点" />
      </span>
      <span>
        <T en="— try to use these naturally if they fit:" zh="——合适就自然地用上：" />
      </span>
      {chunks.map((c) => (
        <span key={c.id} title={c.meaningZh} className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-ink-2">
          {c.text}
        </span>
      ))}
    </p>
  );
}

/** Collapsed plan reference while writing */
function PlanRecall({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const hasPlan = plan.position || plan.idea1 || plan.idea2 || plan.examples;
  if (!hasPlan) return null;
  return (
    <div className="mt-4">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink">
        <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        <T en="Your plan" zh="你的构思" />
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          {plan.position && <p><span className="text-ink-3"><T en="Position" zh="立场" />: </span>{plan.position}</p>}
          {plan.idea1 && <p><span className="text-ink-3"><T en="Idea 1" zh="论点一" />: </span>{plan.idea1}</p>}
          {plan.idea2 && <p><span className="text-ink-3"><T en="Idea 2" zh="论点二" />: </span>{plan.idea2}</p>}
          {plan.examples && <p><span className="text-ink-3"><T en="Examples" zh="例子" />: </span>{plan.examples}</p>}
        </div>
      )}
    </div>
  );
}

/** Quiet count-up timer — optional, dismissible */
function WriteTimer() {
  const [seconds, setSeconds] = useState(0);
  const [visible, setVisible] = useState(true);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current != null) setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!visible) {
    return (
      <button type="button" onClick={() => setVisible(true)} className="font-medium text-ink-3/70 hover:text-ink-3">
        <T en="timer" zh="计时" />
      </button>
    );
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <button type="button" onClick={() => setVisible(false)} title="hide timer" className="font-medium text-ink-3 hover:text-ink-2 tabular-nums">
      {m}:{s.toString().padStart(2, "0")}
    </button>
  );
}

/* ── Paraphrase panel (task type: Paraphrase) ─────────────────────────────── */

function ParaphrasePanel({ items }: { items: { id: string; source: string; sourceZh: string }[] }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId) ?? items[0];
  const [text, setText] = useState("");
  const [result, setResult] = useState<(ParaphraseFeedback & { keyMoves?: string[] }) | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/paraphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, userParaphrase: text }),
      });
      const data = await res.json();
      if (data.feedback) setResult({ ...data.feedback, keyMoves: data.keyMoves });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 max-w-2xl">
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <button
            key={i.id}
            onClick={() => {
              setItemId(i.id);
              setText("");
              setResult(null);
            }}
            className={`press max-w-[280px] truncate rounded-lg px-3 py-1.5 text-[12px] font-medium ${itemId === i.id ? "chip-on" : "chip"}`}
          >
            {i.source}
          </button>
        ))}
      </div>
      <blockquote className="mt-6 rounded-xl bg-surface-2 px-5 py-4 text-[15px] font-medium leading-relaxed text-ink">
        {item?.source}
      </blockquote>
      <div className="mt-2">
        <ChineseReveal text={item?.sourceZh ?? ""} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Your paraphrase — change the words AND the structure…"
        className="input-base mt-5 w-full px-4 py-3 text-[14.5px]"
      />
      <div className="mt-4">
        <button onClick={submit} disabled={busy || !text.trim()} className={btn.primary}>
          {busy ? <T en="Evaluating…" zh="评估中…" /> : <T en="Evaluate paraphrase" zh="评估改写" />}
        </button>
      </div>

      {result && (
        <div className="enter card-specular mt-8 rounded-card bg-surface p-7">
          <div className="flex items-center justify-between">
            <h3 className="t-section"><T en="Paraphrase report" zh="改写报告" /></h3>
            {result.isMock && <MockBadge />}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
            {[
              ["Variation", "变化度", result.variation],
              ["Naturalness", "自然度", result.naturalness],
              ["IELTS value", "雅思价值", result.ieltsRelevance],
            ].map(([en, zh, v]) => (
              <div key={en as string}>
                <p className="t-caption"><T en={en as string} zh={zh as string} /></p>
                <p className="mt-1 text-[20px] font-semibold leading-none tabular-nums text-ink">{v as number}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13.5px] leading-relaxed text-ink-2">{result.analysis}</p>
          {result.keyMoves && result.keyMoves.length > 0 && (
            <p className="mt-3 text-[12.5px] text-ink-2">
              <span className="text-ink-3"><T en="Key moves" zh="关键手法" />: </span>
              {result.keyMoves.join(" · ")}
            </p>
          )}
          <div className="mt-6">
            <p className="t-caption"><T en="Model paraphrases" zh="示范改写" /></p>
            <div className="mt-2 space-y-1.5">
              {result.modelParaphrases.map((m, i) => (
                <p key={i} className="text-[13.5px] leading-relaxed text-ink-2">{m}</p>
              ))}
            </div>
          </div>
          <button onClick={() => { setText(""); setResult(null); }} className={`${btn.ghost} mt-5`}>
            <T en="Try another paraphrase" zh="再改一句" />
          </button>
        </div>
      )}
    </div>
  );
}
