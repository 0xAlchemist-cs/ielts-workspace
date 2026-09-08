"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlarmClock, FileText, PenLine } from "lucide-react";
import { Badge, btn } from "@/components/ui";
import { ElapsedWait, toast } from "@/components/motion";
import { T } from "@/components/i18n";
import type { MockPaper } from "@/server/services/mock-paper";

/* ── Full mock exam — Reading (3 passages) + Writing (T1+T2), 120 min ──────
 * Date-seeded paper + localStorage answers ⇒ refresh-proof; answers survive,
 * the countdown is derived from the stored start timestamp. Abandon = exit
 * without recording (never fake data). */

type Phase = "ready" | "exam" | "grading" | "done";
type Answers = Record<string, string | string[]>;

interface Saved {
  startedAt: number;
  answers: Answers;
  t1: string;
  t2: string;
  submitted?: boolean;
}

interface ReadingResult {
  perQuestion: { no: number; correct: boolean; yourAnswer: string; answer: string; question: string }[];
  raw: number;
  total: number;
  band: number;
  passageScores: { label: string; raw: number; total: number }[];
}

interface WritingResult {
  band: number | null;
  summary: string;
}

const EXAM_MS = 120 * 60 * 1000;
const storeKey = (seed: number) => `mock-paper-${seed}`;

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function MockExam({ paper }: { paper: MockPaper }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [tab, setTab] = useState<"reading" | "writing">("reading");
  const [passageIdx, setPassageIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [startedAt, setStartedAt] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [reading, setReading] = useState<ReadingResult | null>(null);
  const [writing, setWriting] = useState<{ task1: WritingResult; task2: WritingResult } | null>(null);
  const submittedRef = useRef(false);
  const key = storeKey(paper.seed);

  /* restore in-progress paper — localStorage exists only after mount, so the
   * state handoff must run in an effect (hydration boundary, not a reaction) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const s = JSON.parse(raw) as Saved;
      if (s.submitted) return;
      if (Date.now() - s.startedAt < EXAM_MS) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration restore
        setStartedAt(s.startedAt);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration restore
        setAnswers(s.answers ?? {});
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration restore
        setT1(s.t1 ?? "");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration restore
        setT2(s.t2 ?? "");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration restore
        setPhase("exam");
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* ignore corrupt state */
    }
  }, [key]);

  /* ticking clock + auto-submit */
  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const remaining = EXAM_MS - (now - startedAt);
  useEffect(() => {
    if (phase === "exam" && remaining <= 0) {
      toast("Time is up — submitting.", "warn");
      void submit();
    }
  }, [phase, remaining <= 0]);

  /* persist answers */
  useEffect(() => {
    if (phase !== "exam") return;
    const s: Saved = { startedAt, answers, t1, t2 };
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch {
      /* quota */
    }
  }, [phase, key, startedAt, answers, t1, t2]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => (Array.isArray(v) ? v.length : String(v).trim())).length,
    [answers],
  );

  function begin() {
    setStartedAt(Date.now());
    setPhase("exam");
  }

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase("grading");
    try {
      localStorage.setItem(key, JSON.stringify({ startedAt, answers, t1, t2, submitted: true } satisfies Saved));
    } catch {
      /* quota */
    }
    const taskIds = paper.passages.map((p) => p.taskId);
    let readingRes: ReadingResult | null = null;
    let writingRes: { task1: WritingResult; task2: WritingResult } | null = null;
    try {
      const gr = await fetch("/api/ielts/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "grade", taskIds, responses: answers }),
      }).then((r) => r.json());
      if (!gr.error) readingRes = gr;
    } catch {
      /* keep writing going even if reading grade failed */
    }
    const wcall = async (prompt: string, taskType: string, text: string): Promise<WritingResult> => {
      if (wordCount(text) < 20) return { band: null, summary: "Not attempted (under 20 words)." };
      const d = await fetch("/api/ai/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `[Mock exam] ${prompt}`, text, taskType }),
      }).then((r) => r.json());
      return d.feedback ? { band: d.feedback.overallEstimate ?? null, summary: d.feedback.summary ?? "" } : { band: null, summary: "Evaluation unavailable." };
    };
    const [w1, w2] = await Promise.all([
      wcall(paper.writing.task1.prompt, "task1", t1),
      wcall(paper.writing.task2.prompt, "task2", t2),
    ]);
    writingRes = { task1: w1, task2: w2 };
    setReading(readingRes);
    setWriting(writingRes);
    setPhase("done");
    try {
      await fetch("/api/ielts/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "save",
          report: {
            taskIds,
            dateKey: paper.dateKey,
            durationMinutes: Math.round((Date.now() - startedAt) / 60000),
            reading: readingRes ? { raw: readingRes.raw, total: readingRes.total, band: readingRes.band, perQuestion: readingRes.perQuestion } : null,
            writing: writingRes,
          },
        }),
      });
    } catch {
      /* attempt save is best-effort; the report is already on screen */
    }
  }

  function exitWithoutRecording() {
    if (!confirm("Exit the mock exam? Nothing will be recorded.")) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* quota */
    }
    submittedRef.current = true; // halt any in-flight auto-submit
    setPhase("ready");
    setAnswers({});
    setT1("");
    setT2("");
    window.location.href = "/ielts";
  }

  /* ── ready ───────────────────────────────────────────────────────────── */
  if (phase === "ready") {
    return (
      <div className="shell-narrow space-y-6">
        <header>
          <div className="mb-1 text-[12px] text-ink-3">
            <Link href="/ielts" className="hover:text-ink">← <T en="IELTS Engine" zh="雅思引擎" /></Link>
          </div>
          <h1 className="text-display">
            <T en="Full Mock Exam" zh="全真模考" />
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            <T
              en="Reading (3 passages) + Writing (Task 1 & 2) in one 120-minute sitting — machine-test style, auto-submitted when time runs out. Listening mock arrives when we have licensed question data."
              zh="三篇阅读 + 大小作文，一次性 120 分钟机考——时间到自动交卷。听力题库数据到位后再加听力卷。"
            />
          </p>
        </header>
        <div className="card-specular rounded-card bg-surface p-6">
          <p className="t-section">
            <T en={`Today's paper · ${paper.dateKey}`} zh={`今日试卷 · ${paper.dateKey}`} />
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            {paper.passages.map((p) => (
              <li key={p.taskId} className="flex items-center gap-2">
                <FileText size={13} className="shrink-0 text-ink-3" />
                <span className="font-medium text-ink">{p.label}</span> {p.title} · {p.questions.length} <T en="questions" zh="题" />
              </li>
            ))}
            <li className="flex items-center gap-2">
              <PenLine size={13} className="shrink-0 text-ink-3" />
              <T en="Writing Task 1 (150+ words) + Task 2 (250+ words)" zh="写作 Task 1（150 词+）+ Task 2（250 词+）" />
            </li>
          </ul>
          <p className="mt-4 text-[12px] text-ink-3">
            <T
              en="Same paper all day; an accidental refresh keeps your answers. Exiting records nothing."
              zh="全天同一份卷；中途刷新不丢答案。退出不记录。"
            />
          </p>
          <button onClick={begin} className={`${btn.primary} mt-5`}>
            <T en="Begin 120-minute exam" zh="开始 120 分钟考试" />
          </button>
        </div>
      </div>
    );
  }

  /* ── grading ─────────────────────────────────────────────────────────── */
  if (phase === "grading") {
    return (
      <div className="shell-narrow py-20 text-center">
        <p className="text-[15px] font-medium text-ink">
          <T en="Grading your paper…" zh="阅卷中…" />
        </p>
        <div className="mt-3 flex justify-center">
          <ElapsedWait en="Reading is auto-scored; two essays go to the examiner — usually 1–4 min total" zh="阅读自动判分中；两篇作文送考官——通常共 1–4 分钟" />
        </div>
      </div>
    );
  }

  /* ── done ────────────────────────────────────────────────────────────── */
  if (phase === "done") {
    const overall =
      reading && writing
        ? [reading.band, writing.task1.band, writing.task2.band].filter((b): b is number => b != null)
        : [];
    const avg = overall.length ? Math.round((overall.reduce((a, b) => a + b, 0) / overall.length) * 2) / 2 : null;
    return (
      <div className="shell-wide space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-display">
              <T en="Mock Exam Report" zh="模考成绩单" />
            </h1>
            <p className="mt-1 text-[12.5px] text-ink-3">
              {paper.dateKey} · <T en="saved to your IELTS history" zh="已存入雅思历史" />
            </p>
          </div>
          <Link href="/profile#trajectory" className={btn.secondary}>
            <T en="See progress" zh="查看进步" />
          </Link>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {reading && (
            <div className="rounded-card bg-surface p-5">
              <p className="t-section"><T en="Reading" zh="阅读" /></p>
              <p className="mt-2 text-[34px] font-semibold tabular-nums text-ink">{reading.band.toFixed(1)}</p>
              <p className="mt-1 text-[13px] text-ink-2">
                {reading.raw}/{reading.total} <T en="correct" zh="答对" />
              </p>
              <p className="mt-2 text-[12px] text-ink-3">
                {reading.passageScores.map((p) => `${p.label} ${p.raw}/${p.total}`).join(" · ")}
              </p>
            </div>
          )}
          {writing?.task1 && (
            <div className="rounded-card bg-surface p-5">
              <p className="t-section"><T en="Writing Task 1" zh="写作一" /></p>
              <p className="mt-2 text-[34px] font-semibold tabular-nums text-ink">{writing.task1.band != null ? writing.task1.band.toFixed(1) : "—"}</p>
              <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-ink-2">{writing.task1.summary}</p>
            </div>
          )}
          {writing?.task2 && (
            <div className="rounded-card bg-surface p-5">
              <p className="t-section"><T en="Writing Task 2" zh="写作二" /></p>
              <p className="mt-2 text-[34px] font-semibold tabular-nums text-ink">{writing.task2.band != null ? writing.task2.band.toFixed(1) : "—"}</p>
              <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-ink-2">{writing.task2.summary}</p>
            </div>
          )}
        </div>

        {avg != null && (
          <p className="text-[13px] text-ink-2">
            <T en={`Paper average (R + W): ${avg.toFixed(1)} — the full IELTS band averages all four skills.`} zh={`笔试两科均分（阅读+写作）：${avg.toFixed(1)}——正式雅思均分按四科计算。`} />
          </p>
        )}

        {reading && (
          <section>
            <p className="t-section mb-3"><T en="Answer review" zh="答案复盘" /></p>
            <div className="space-y-1.5">
              {reading.perQuestion.map((q) => (
                <div key={q.no} className={`rounded-xl px-4 py-2.5 text-[12.5px] ${q.correct ? "bg-surface-2" : "bg-err/[0.06]"}`}>
                  <span className="mr-2 font-mono text-ink-3">Q{q.no}</span>
                  <span className={q.correct ? "text-ink-2" : "font-medium text-ink"}>
                    {q.correct ? "✓" : "✗ "}
                    {!q.correct && (
                      <>
                        <T en="your" zh="你的" />: <b>{q.yourAnswer || "—"}</b> · <T en="correct" zh="正确" />: <b>{q.answer}</b>
                      </>
                    )}
                  </span>
                  <span className="ml-2 text-ink-3">{q.question.slice(0, 80)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  /* ── exam ────────────────────────────────────────────────────────────── */
  const p = paper.passages[passageIdx];
  const danger = remaining < 10 * 60 * 1000;
  return (
    <div className="shell-wide">
      {/* exam bar */}
      <div className={`sticky top-[52px] z-20 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5 sm:-mx-7 sm:px-7 ${danger ? "border-err/30 bg-err/[0.05]" : "border-line bg-bg"}`}>
        <div className="flex items-center gap-3 text-[12px]">
          <Badge tone="accent">
            <T en="Mock Exam" zh="全真模考" />
          </Badge>
          <span className={`flex items-center gap-1.5 font-mono tabular-nums ${danger ? "text-err-text" : "text-ink-2"}`}>
            <AlarmClock size={13} strokeWidth={2} />
            {mmss(remaining)}
          </span>
          <span className="text-ink-3">
            <T en={`${answeredCount}/${paper.totalQuestions} answered`} zh={`已答 ${answeredCount}/${paper.totalQuestions}`} />
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={exitWithoutRecording} className="text-[12px] text-ink-3 hover:text-ink">
            <T en="Exit (not recorded)" zh="退出（不记录）" />
          </button>
          <button
            onClick={() => confirm(`Submit now? ${paper.totalQuestions - answeredCount} unanswered.`) && void submit()}
            className={`${btn.primary} px-3.5 py-1.5 text-[12px]`}
          >
            <T en="Submit paper" zh="交卷" />
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="mb-5 flex gap-1.5">
        <button onClick={() => setTab("reading")} className={tab === "reading" ? "chip-on" : "chip"}>
          <T en={`Reading (Q1–${paper.totalQuestions})`} zh={`阅读（Q1–${paper.totalQuestions}）`} />
        </button>
        <button onClick={() => setTab("writing")} className={tab === "writing" ? "chip-on" : "chip"}>
          <T en="Writing" zh="写作" />
        </button>
      </div>

      {tab === "reading" ? (
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 lg:flex-1">
            <div className="mb-3 flex gap-1.5">
              {paper.passages.map((pp, i) => (
                <button key={pp.taskId} onClick={() => setPassageIdx(i)} className={i === passageIdx ? "chip-on" : "chip"}>
                  {pp.label}
                </button>
              ))}
            </div>
            <article className="reader-text max-w-[42rem] whitespace-pre-wrap rounded-card bg-surface p-6 text-[14px] leading-[1.85] text-ink">
              {p.content}
            </article>
          </div>
          <aside className="w-full shrink-0 lg:w-[380px]">
            <div className="space-y-3 lg:sticky lg:top-[120px] lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:pr-1">
              {p.questions.map((q) => {
                const val = answers[String(q.no)];
                return (
                  <div key={q.no} className="rounded-card bg-surface p-4">
                    <p className="text-[12.5px] leading-relaxed text-ink">
                      <span className="mr-1.5 font-mono font-semibold">Q{q.no}</span>
                      {q.question}
                    </p>
                    {q.multi && q.options ? (
                      <div className="mt-2 space-y-1">
                        {q.options.map((o) => {
                          const list = Array.isArray(val) ? val : [];
                          const on = list.includes(o);
                          return (
                            <label key={o} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-2">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setAnswers((a) => ({
                                    ...a,
                                    [String(q.no)]: on ? list.filter((x) => x !== o) : [...list, o],
                                  }))
                                }
                                className="mt-0.5 accent-[#0071e3]"
                              />
                              {o}
                            </label>
                          );
                        })}
                      </div>
                    ) : q.options ? (
                      <div className="mt-2 space-y-1">
                        {q.options.map((o) => (
                          <label key={o} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-2">
                            <input
                              type="radio"
                              name={`q${q.no}`}
                              checked={val === o}
                              onChange={() => setAnswers((a) => ({ ...a, [String(q.no)]: o }))}
                              className="mt-0.5 accent-[#0071e3]"
                            />
                            {o}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [String(q.no)]: e.target.value }))}
                        placeholder="Your answer"
                        className="input-base mt-2 w-full px-3 py-1.5 text-[13px]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {(
            [
              { key: "t1", label: "Task 1", target: 150, prompt: paper.writing.task1.prompt, text: t1, set: setT1 },
              { key: "t2", label: "Task 2", target: 250, prompt: paper.writing.task2.prompt, text: t2, set: setT2 },
            ] as const
          ).map((w) => (
            <div key={w.key} className="rounded-card bg-surface p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="t-section">{w.label}</span>
                <span className={`text-[12px] tabular-nums ${wordCount(w.text) >= w.target ? "text-ok-text" : "text-ink-3"}`}>
                  {wordCount(w.text)}/{w.target}+ <T en="words" zh="词" />
                </span>
              </div>
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">{w.prompt}</p>
              <textarea
                value={w.text}
                onChange={(e) => w.set(e.target.value)}
                placeholder="Write your essay…"
                className="input-base min-h-[320px] w-full px-4 py-3 text-[14px] leading-[1.8]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
