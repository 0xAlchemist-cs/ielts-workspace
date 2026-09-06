"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { markStepAction } from "@/app/actions";
import { Badge, Card, MockBadge, ProgressBar, btn, inputCls } from "@/components/ui";
import { toast } from "@/components/motion";
import { Segmented } from "@/components/motion";
import { T } from "@/components/i18n";

type Mode = "learning" | "exam";
type Stage = "select" | "task" | "result";

interface TaskData {
  id: number;
  taskType: string;
  skill: string;
  difficulty: number;
  topic: string;
  prompt: string;
  content?: string | null;
  questions?: { question: string; options?: string[]; answer: string; subSkill: string }[] | null;
  timeLimitMinutes: number;
  estimatedBand: number;
}

interface AttemptResult {
  attemptId: number;
  score: number | null;
  band: number | null;
  subSkillResults: { skill: string; correct: boolean; note: string }[];
  transferResults: { chunkId: number; text: string; status: string }[];
  strategyIssues: string[];
  languageErrors: string[];
}

export function IeltsEngineView({ targetBand }: { targetBand: number }) {
  const [mode, setMode] = useState<Mode>("learning");
  const [stage, setStage] = useState<Stage>("select");
  const [task, setTask] = useState<TaskData | null>(null);
  const [reason, setReason] = useState("");
  const [targetChunks, setTargetChunks] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [busy, start] = useTransition();
  const submitRef = useRef<() => void>(() => {});

  // Timer for exam mode
  useEffect(() => {
    if (stage !== "task" || mode !== "exam" || !task) return;
    const total = task.timeLimitMinutes * 60;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- timer initialization
    setTimeLeft(total);
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          submitRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [stage, mode, task?.id]);

  const fetchTask = async (selectedMode: Mode) => {
    setLoading(true);
    setResult(null);
    setResponses({});
    try {
      const res = await fetch(`/api/ielts/task?mode=${selectedMode}`);
      const data = await res.json();
      if (data.task) {
        setTask(data.task);
        setReason(data.reason);
        setTargetChunks(data.targetChunks ?? []);
        setStage("task");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitTask = () => {
    if (!task || busy) return;
    start(async () => {
      const res = await fetch("/api/ielts/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          mode,
          responses,
          durationMinutes: task.timeLimitMinutes - Math.ceil(timeLeft / 60),
        }),
      });
      const data = await res.json();
      if (data.attemptId) {
        setResult(data);
        setStage("result");
        markStepAction("transfer");
      }
    });
  };

  /* Abandon the current task — nothing is submitted or recorded. */
  const exitTask = () => {
    setStage("select");
    setTask(null);
    setResponses({});
    setResult(null);
  };

  // Keep the timer's submit callback current
  useEffect(() => {
    submitRef.current = submitTask;
  });

  const mmss = `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;

  return (
    <div className="shell-wide">
      <AiNudge />
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">
            <T en="IELTS Engine" zh="雅思引擎" />
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <T
              en="Measurement + transfer. Your language ability is tested in real IELTS conditions — never by asking you to 'use expression X'."
              zh="测量 + 迁移。语言能力在真实雅思场景中测试——绝不要求'请使用表达 X'。"
            />
          </p>
        </div>
        <Segmented<Mode>
          value={mode}
          onChange={(m) => { setMode(m); setStage("select"); }}
          options={[
            { value: "learning", label: <T en="📚 Learning" zh="学习模式" /> },
            { value: "exam", label: <T en="⏱ Exam" zh="考试模式" /> },
          ]}
        />
      </header>

      {/* Mode explanation */}
      {mode === "exam" && stage === "select" && (
        <div className="mb-4 rounded-xl bg-[#ff3b30]/[0.05] px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          <b className="text-[#d70015]"><T en="Exam Mode:" zh="考试模式：" /></b>{" "}
          <T en="Strict timing. No hints. No answers during the test. Results evaluated at the end." zh="严格计时、无提示、中途不显示答案。完成后统一评估。" />
        </div>
      )}

      {/* Stage: task selection */}
      {stage === "select" && (
        <div className="mx-auto max-w-2xl space-y-4">
          <Card title={<T en="Adaptive Task Selection" zh="自适应选题" />}>
            <p className="text-[13px] leading-relaxed text-ink-2">
              <T
                en="The engine reads your Weakest Link, Error Bank, Retrieval Queue, and LanguageItem strength to pick the most valuable task right now."
                zh="引擎读取你的最弱环节、错误银行、复习队列和语言项强度，选出当前最有价值的任务。"
              />
            </p>
            <button onClick={() => fetchTask(mode)} disabled={loading} className={`${btn.primary} mt-4 w-full`}>
              {loading ? "Selecting..." : <T en="Generate adaptive task →" zh="生成自适应任务 →" />}
            </button>
          </Card>

          {/* Target chunks for transfer (engine-known, not user-facing instructions) */}
          {targetChunks.length > 0 && mode === "learning" && stage === "select" && (
            <Card title={<T en="Transfer targets (engine-selected)" zh="迁移靶标（引擎选定）" />}>
              <div className="flex flex-wrap gap-1.5">
                {targetChunks.map((t) => (
                  <Badge key={t} tone="accent">{t}</Badge>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-3">
                <T en="These will be detected from your output — you won't be told to use them." zh="系统将从你的产出中检测——不会告诉你用哪些。" />
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Stage: doing the task */}
      {stage === "task" && task && (
        <div className="mx-auto max-w-3xl space-y-4">
          {mode === "exam" && (
            <div className="sticky top-[56px] z-20 flex items-center justify-between rounded-xl bg-[#ff3b30] px-4 py-2 text-white">
              <span className="text-[12px] font-semibold"><T en="EXAM MODE" zh="考试模式" /></span>
              <span className="font-mono text-[18px] font-semibold tabular-nums">{mmss}</span>
              <button
                onClick={exitTask}
                className="press rounded-md px-2 py-0.5 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <T en="Exit" zh="退出" />
              </button>
            </div>
          )}

          <Card title={`${task.skill.toUpperCase()} · ${task.taskType.replace(/_/g, " ")}`} subtitle={`Topic: ${task.topic} · Difficulty ${"●".repeat(task.difficulty)}${"○".repeat(5 - task.difficulty)}`}>
            <p className="rounded-xl bg-black/[0.03] px-4 py-3 text-[14.5px] leading-relaxed text-ink">{task.prompt}</p>
            {mode === "learning" && reason && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-3">💡 {reason}</p>
            )}
          </Card>

          {/* Reading/listening content */}
          {task.content && (
            <Card title={task.skill === "listening" ? "Transcript (play after answering)" : "Passage"}>
              {task.skill === "listening" && mode === "exam" ? (
                <p className="text-[13px] italic text-ink-3">
                  <T en="Transcript hidden in exam mode. Answer from listening only." zh="考试模式下隐藏转写，仅凭听力作答。" />
                </p>
              ) : (
                <div className="max-h-[400px] space-y-3 overflow-y-auto text-[14px] leading-relaxed text-ink">
                  {task.content.split("\n\n").map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Questions */}
          {task.questions && task.questions.length > 0 && (
            <Card title={`Questions (${task.questions.length})`}>
              <div className="space-y-4">
                {task.questions.map((q, i) => (
                  <div key={i} className="rounded-xl border border-black/[0.06] px-4 py-3">
                    <p className="text-[14px] font-medium text-ink">{i + 1}. {q.question}</p>
                    {q.options ? (
                      <div className="mt-2 space-y-1.5">
                        {q.options.map((opt) => (
                          <label key={opt} className="flex cursor-pointer items-center gap-2.5">
                            <input
                              type="radio"
                              name={`q${i}`}
                              value={opt}
                              checked={responses[String(i)] === opt}
                              onChange={(e) => setResponses((r) => ({ ...r, [String(i)]: e.target.value }))}
                              className="h-4 w-4 accent-[#0071e3]"
                            />
                            <span className="text-[13.5px] text-ink-2">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={responses[String(i)] ?? ""}
                        onChange={(e) => setResponses((r) => ({ ...r, [String(i)]: e.target.value }))}
                        placeholder="Your answer..."
                        className={`${inputCls} mt-2`}
                      />
                    )}
                    {/* Learning mode: show sub-skill */}
                    {mode === "learning" && (
                      <p className="mt-1.5 text-[12px] text-ink-3">Tests: {q.subSkill.replace(/_/g, " ")}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Speaking/Writing input */}
          {(!task.questions || task.questions.length === 0) && (
            <Card title={task.skill === "writing" ? "Your essay" : "Your answer"}>
              <textarea
                value={responses.text ?? ""}
                onChange={(e) => setResponses((r) => ({ ...r, text: e.target.value }))}
                rows={task.skill === "writing" ? 12 : 6}
                placeholder={
                  task.skill === "writing"
                    ? "Write your essay here..."
                    : "Type your spoken answer here (or use the Speaking Lab for voice)..."
                }
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </Card>
          )}

          <button onClick={submitTask} disabled={busy} className={`${btn.primary} w-full`}>
            {busy ? "Evaluating..." : mode === "exam" ? <T en="Submit exam" zh="提交考试" /> : <T en="Submit for evaluation" zh="提交评估" />}
          </button>
          <button
            onClick={exitTask}
            disabled={busy}
            className="w-full text-center text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
          >
            <T en="← Exit without submitting" zh="← 退出（不记录本次）" />
          </button>
        </div>
      )}

      {/* Stage: results */}
      {stage === "result" && result && task && (
        <div className="enter mx-auto max-w-3xl space-y-4">
          {/* Score */}
          <Card title={<T en="IELTS Performance" zh="雅思表现" />} right={<MockBadge />}>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-black/[0.03] py-3 text-center">
                <div className="text-[10.5px] font-semibold uppercase text-ink-3">Band</div>
                <div className="font-mono text-[22px] font-semibold text-ink">{result.band?.toFixed(1) ?? "—"}</div>
              </div>
              <div className="rounded-xl bg-black/[0.03] py-3 text-center">
                <div className="text-[10.5px] font-semibold uppercase text-ink-3">Score</div>
                <div className="font-mono text-[22px] font-semibold text-ink">{result.score ?? "—"}%</div>
              </div>
              <div className="rounded-xl bg-[#34c759]/[0.08] py-3 text-center">
                <div className="text-[10.5px] font-semibold uppercase text-[#1f7a37]">Items Used</div>
                <div className="font-mono text-[22px] font-semibold text-[#1f7a37]">{result.transferResults.length}</div>
              </div>
            </div>
          </Card>

          {/* Language Acquisition vs IELTS Performance */}
          {result.transferResults.length > 0 && (
            <Card title={<T en="Language Transfer Detected" zh="检测到语言迁移" />}>
              <div className="flex flex-wrap gap-1.5">
                {result.transferResults.map((t) => (
                  <Badge key={t.chunkId} tone="success">✓ {t.text}</Badge>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                <T
                  en="These expressions were produced in a real IELTS task — genuine transfer, not prompted usage."
                  zh="这些表达在真实雅思任务中自主产出——真正的迁移，而非被要求使用。"
                />
              </p>
            </Card>
          )}

          {/* Sub-skill breakdown */}
          {result.subSkillResults.length > 0 && (
            <Card title={<T en="Sub-skill breakdown" zh="子技能分解" />}>
              <div className="space-y-2">
                {result.subSkillResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-[13px]">
                    <span className="w-40 shrink-0 truncate text-ink-2">{r.skill.replace(/_/g, " ")}</span>
                    <span className={r.correct ? "text-[#1f7a37]" : "text-[#d70015]"}>{r.correct ? "✓" : "✗"}</span>
                    {r.note && <span className="truncate text-[12px] text-ink-3">{r.note}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Strategy vs Language separation */}
          <div className="grid gap-3 sm:grid-cols-2">
            {result.strategyIssues.length > 0 && (
              <Card title={<T en="🎯 Strategy Issues" zh="考试策略问题" />} subtitle={<T en="Not language problems — test approach" zh="不是语言问题——考试方法" />}>
                <ul className="space-y-1.5 text-[12.5px] text-ink-2">
                  {result.strategyIssues.map((s, i) => (
                    <li key={i}>▸ {s}</li>
                  ))}
                </ul>
              </Card>
            )}
            {result.languageErrors.length > 0 && (
              <Card title={<T en="📚 Language Errors → Error Bank" zh="语言错误 → 错误银行" />}>
                <ul className="space-y-1.5 text-[12.5px] text-ink-2">
                  {result.languageErrors.map((e, i) => (
                    <li key={i}>▸ {e}</li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="flex gap-2.5">
            <button onClick={() => setStage("select")} className={`${btn.primary} flex-1`}>
              <T en="Next task →" zh="下一个任务 →" />
            </button>
            <Link href="/" className={`${btn.secondary} flex-1 text-center`}>
              <T en="← Mission Control" zh="← 主控台" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function AiNudge() {
  return null; // Already shown on other pages
}
