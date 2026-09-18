"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Headphones, PenLine, RotateCcw, X } from "lucide-react";
import { T, useBilingual } from "@/components/i18n";
import { btn } from "@/components/ui";
import type { CetTaskRow } from "@/server/services/cet-engine";
import { SectionTimer, type ExamSessionState } from "./timer";

interface AiFeedback {
  strengths: string[];
  problems: string[];
  suggestions: string[];
  revisionTargets: string[];
  isMock: boolean;
}

/* ── CET written-test practice shell — one task at a time, honest scoring ───
 * Learning mode: transcripts + retry. Exam mode: no hints, one submission.
 * Scores are raw counts only — never official CET score conversions. */

const SECTIONS: { key: string; en: string; zh: string; icon: typeof BookOpen }[] = [
  { key: "listening", en: "Listening", zh: "听力", icon: Headphones },
  { key: "reading", en: "Reading", zh: "阅读", icon: BookOpen },
  { key: "writing", en: "Writing", zh: "写作", icon: PenLine },
  { key: "translation", en: "Translation", zh: "翻译", icon: RotateCcw },
];

type Mode = "learning" | "exam";

interface GradeResult {
  correctCount?: number;
  total?: number;
  line?: { en: string; zh: string };
  wrongItems?: { question: string; yourAnswer: string; answer: string }[];
  submitted?: boolean;
  note?: { en: string; zh: string };
}

export function CetPracticeView({ exam, tasks }: { exam: "cet4" | "cet6"; tasks: CetTaskRow[] }) {
  const bilingual = useBilingual();
  const router = useRouter();
  const [section, setSection] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("learning");
  const [activeTask, setActiveTask] = useState<CetTaskRow | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const [examSession, setExamSession] = useState<ExamSessionState | null>(null);

  const sectionTasks = section ? tasks.filter((t) => t.section === section) : [];
  const isCet4 = exam === "cet4";
  const examLabel = isCet4 ? "CET-4" : "CET-6";

  const submit = async () => {
    if (!activeTask || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/cet/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: activeTask.id, mode, responses, freeText: freeText || undefined }),
      });
      setResult(await res.json());
      // writing/translation in learning mode: fetch AI practice feedback
      if (
        (activeTask.section === "writing" || activeTask.section === "translation") &&
        mode === "learning" &&
        freeText.trim().length >= 10
      ) {
        setAiLoading(true);
        try {
          const fb = await fetch("/api/cet/writing-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: activeTask.id, answer: freeText }),
          });
          const fbData = await fb.json();
          if (fbData.feedback) setAiFeedback(fbData.feedback);
          setReviseText(freeText);
        } finally {
          setAiLoading(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setActiveTask(null);
    setResponses({});
    setFreeText("");
    setResult(null);
    setAiFeedback(null);
    setReviseText("");
  };

  const retry = () => {
    setResult(null);
    setResponses({});
    setFreeText("");
    setAiFeedback(null);
    setReviseText("");
  };

  // ── Exam Mode: start/resume the DB-backed session ───────────────────────
  const startExam = async () => {
    const res = await fetch("/api/cet/exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "start", testMode: true }), // test mode for timers under 30s each
    });
    const data = await res.json();
    if (data.session) {
      setExamSession(data.session);
      setSection(data.session.currentSection);
      const first = tasks.find((t) => t.section === data.session.currentSection);
      if (first) setActiveTask(first);
      setResponses({});
      setFreeText("");
    }
  };

  const advanceExamSection = async (timedOut: boolean) => {
    if (!examSession) return;
    const res = await fetch("/api/cet/exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: "advance",
        sessionId: examSession.sessionId,
        fromSection: examSession.currentSection,
        timedOut,
        responses,
        freeText: freeText || undefined,
      }),
    });
    const data = await res.json();
    if (data.session) {
      setExamSession(data.session);
      if (data.session.submitted) {
        setActiveTask(null);
        return;
      }
      const next = tasks.find((t) => t.section === data.session.currentSection);
      if (next) {
        setActiveTask(next);
        setSection(data.session.currentSection);
        setResponses({});
        setFreeText("");
        setResult(null);
      }
    }
  };

  // ── Exam result view (all sections done) ────────────────────────────────
  if (mode === "exam" && examSession?.submitted) {
    return (
      <div className="shell-wide">
        <h1 className="text-display">{examLabel} Exam Complete</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          <T en="All sections timed out or submitted. Your answers are saved — review them in each section." zh="所有部分已到时或提交。你的作答已保存——可回到各分区查看。" />
        </p>
        {examSession.timedOut.length > 0 && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            <T en={`Timed out: ${examSession.timedOut.join(", ")}`} zh={`到时分区：${examSession.timedOut.join("、")}`} />
          </p>
        )}
        <button
          type="button"
          onClick={() => { setExamSession(null); setMode("learning"); setSection(null); }}
          className="press mt-5 inline-flex h-10 items-center rounded-lg bg-surface-2 px-5 text-[13.5px] font-medium text-ink-2 hover:text-ink"
        >
          <T en="Back to sections" zh="返回分区" />
        </button>
      </div>
    );
  }

  // ── task view ────────────────────────────────────────────────────────────
  if (activeTask) {
    const isObjective = activeTask.section === "reading" || activeTask.section === "listening";
    const showTranscript = mode === "learning" && activeTask.section === "listening" && activeTask.content;
    return (
      <div className="shell-wide">
        <header className="mb-5">
          <button type="button" onClick={back} className="press text-[13px] text-ink-3 hover:text-ink">
            <T en="← All sections" zh="← 返回分区" />
          </button>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-3">
            <span className="rounded-md bg-accent/[0.08] px-2 py-0.5 font-medium text-accent-text">{examLabel}</span>
            <span>{mode === "learning" ? <T en="Learning mode" zh="学习模式" /> : <T en="Exam mode" zh="考试模式" />}</span>
            {activeTask.source === "synthetic_test" && (
              <span className="text-ink-3">· <T en="practice material (not an official exam question)" zh="练习材料（非官方真题）" /></span>
            )}
          </div>
        </header>

        {/* V12.2.1: exam-mode section timer — server-clock, auto-advance at 0 */}
        {mode === "exam" && examSession && (
          <div className="mb-5">
            <SectionTimer session={examSession} onExhausted={() => void advanceExamSection(true)} />
          </div>
        )}

        <div className="card-specular rounded-card bg-surface p-6 sm:p-8">
          <p className="whitespace-pre-line text-[15.5px] leading-[1.75] text-ink text-pretty">
            {activeTask.prompt}
          </p>

          {activeTask.section === "reading" && activeTask.content && (
            <div className="mt-5 rounded-xl bg-surface-2 px-5 py-4 text-[14px] leading-[1.75] text-ink text-pretty">
              {activeTask.content}
            </div>
          )}

          {showTranscript && (
            <details className="mt-5 rounded-xl bg-surface-2 px-5 py-4">
              <summary className="cursor-pointer text-[13px] font-medium text-accent-text">
                <T en="Show transcript (learning mode)" zh="显示原文（学习模式）" />
              </summary>
              <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{activeTask.content}</p>
            </details>
          )}

          {!result && isObjective && activeTask.questions && (
            <div className="mt-6 space-y-5">
              {activeTask.questions.map((q, i) => (
                <div key={i}>
                  <p className="text-[14.5px] font-medium text-ink">{i + 1}. {q.question}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        disabled={submitting}
                        onClick={() => setResponses((r) => ({ ...r, [String(i)]: opt }))}
                        className={`press rounded-xl px-4 py-2.5 text-left text-[14px] transition-colors duration-150 ${
                          responses[String(i)] === opt ? "bg-accent/[0.1] font-medium text-accent-text" : "bg-surface-2 text-ink hover:text-ink"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={submit}
                disabled={submitting || Object.keys(responses).length < activeTask.questions.length}
                className={btn.primary}
              >
                <T en={submitting ? "Submitting…" : "Submit"} zh={submitting ? "提交中…" : "提交"} />
              </button>
            </div>
          )}

          {!result && (activeTask.section === "writing" || activeTask.section === "translation") && (
            <div className="mt-6">
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={8}
                placeholder={
                  activeTask.section === "writing"
                    ? bilingual ? "Write your essay here… 在这里写你的作文…" : "Write your essay here…"
                    : bilingual ? "Type your English translation… 输入你的英文翻译…" : "Type your English translation…"
                }
                className="input-base w-full resize-y px-4 py-3 text-[15px]"
              />
              <button
                type="button"
                onClick={submit}
                disabled={submitting || freeText.trim().length < 10}
                className={`${btn.primary} mt-4`}
              >
                <T en={submitting ? "Submitting…" : "Submit"} zh={submitting ? "提交中…" : "提交"} />
              </button>
            </div>
          )}

          {result && (
            <div className="enter mt-6 space-y-4">
              {result.line && (
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    result.correctCount === result.total ? "bg-ok/[0.12] text-ok-text" : "bg-warn/[0.12] text-warn-text"
                  }`}>
                    {result.correctCount === result.total ? <Check size={13} strokeWidth={2.5} /> : <X size={13} strokeWidth={2.5} />}
                  </span>
                  <p className="text-[16px] font-semibold text-ink">
                    <T en={result.line.en} zh={result.line.zh} />
                  </p>
                </div>
              )}
              {result.note && (
                <p className="text-[14px] leading-relaxed text-ink-2">
                  <T en={result.note.en} zh={result.note.zh} />
                </p>
              )}
              {result.wrongItems && result.wrongItems.length > 0 && mode === "learning" && (
                <div className="space-y-2">
                  <p className="t-caption"><T en="Review" zh="检查" /></p>
                  {result.wrongItems.map((w, i) => (
                    <div key={i} className="rounded-lg bg-surface-2 px-4 py-3 text-[13px] leading-relaxed">
                      <p className="text-ink-2">{w.question}</p>
                      <p className="mt-1"><T en="Your answer" zh="你的答案" />: <span className="text-warn-text">{w.yourAnswer}</span></p>
                      <p><T en="Correct" zh="正确答案" />: <span className="text-ok-text">{w.answer}</span></p>
                    </div>
                  ))}
                </div>
              )}
              {activeTask.referenceAnswer && mode === "learning" && (
                <div className="rounded-xl bg-surface-2 px-5 py-4">
                  <p className="t-caption"><T en="Reference translation" zh="参考译文" /></p>
                  <p className="mt-1.5 text-[14px] leading-[1.75] text-ink text-pretty">{activeTask.referenceAnswer}</p>
                </div>
              )}

              {/* V12.2.1: AI Practice Feedback — never an official score */}
              {aiLoading && (
                <div className="rounded-xl bg-surface-2 px-5 py-4">
                  <p className="text-[13.5px] font-medium text-ink">
                    <T en="Getting your AI practice feedback…" zh="正在生成 AI 练习反馈…" />
                  </p>
                </div>
              )}
              {aiFeedback && (
                <div className="enter rounded-xl bg-surface-2 px-5 py-4">
                  <p className="t-caption">
                    <T en="AI Practice Feedback" zh="AI 练习反馈" />
                    <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">
                      <T en="(practice guidance — not an official score)" zh="（练习指导——非官方成绩）" />
                    </span>
                  </p>
                  {aiFeedback.strengths.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ok-text"><T en="Strengths" zh="做得好的" /></p>
                      <ul className="mt-1 space-y-0.5">
                        {aiFeedback.strengths.map((s, i) => <li key={i} className="text-[13px] leading-relaxed text-ink-2">· {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiFeedback.problems.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-warn-text"><T en="Problems" zh="问题" /></p>
                      <ul className="mt-1 space-y-0.5">
                        {aiFeedback.problems.map((s, i) => <li key={i} className="text-[13px] leading-relaxed text-ink-2">· {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiFeedback.suggestions.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent-text"><T en="Suggestions" zh="建议" /></p>
                      <ul className="mt-1 space-y-0.5">
                        {aiFeedback.suggestions.map((s, i) => <li key={i} className="text-[13px] leading-relaxed text-ink-2">· {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiFeedback.revisionTargets.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-2"><T en="Revision targets" zh="修改目标" /></p>
                      <ul className="mt-1 space-y-0.5">
                        {aiFeedback.revisionTargets.map((s, i) => <li key={i} className="text-[13px] leading-relaxed text-ink-2">· {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {/* Revise: apply the feedback yourself */}
                  <p className="mt-4 t-caption"><T en="Revise — apply the targets yourself" zh="修改——自己落实这些目标" /></p>
                  <textarea
                    value={reviseText}
                    onChange={(e) => setReviseText(e.target.value)}
                    rows={6}
                    className="input-base mt-2 w-full resize-y px-4 py-3 text-[14px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFreeText(reviseText);
                      setAiFeedback(null);
                      setResult(null);
                    }}
                    disabled={reviseText.trim().length < 10}
                    className={`${btn.primary} mt-3`}
                  >
                    <T en="Submit revised draft" zh="提交修改稿" />
                  </button>
                </div>
              )}

              {/* exam-mode advance (manual submit = move to next section) */}
              {mode === "exam" && examSession && (
                <button
                  type="button"
                  onClick={() => void advanceExamSection(false)}
                  className={btn.primary}
                >
                  <T en={examSession.currentSection === "translation" ? "Submit exam" : "Submit & next section"} zh={examSession.currentSection === "translation" ? "提交整场考试" : "提交并进入下一部分"} />
                </button>
              )}
              <div className="flex gap-2.5">
                {mode === "learning" && !aiFeedback && (
                  <button type="button" onClick={retry} className={btn.primary}>
                    <T en="Try again" zh="再试一次" />
                  </button>
                )}
                <button type="button" onClick={back} className={btn.secondary}>
                  <T en="Back to sections" zh="返回分区" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── section overview ─────────────────────────────────────────────────────
  return (
    <div className="shell-wide">
      <header className="mb-6">
        <h1 className="text-display">
          <T en={`${examLabel} Practice`} zh={`${isCet4 ? "四级" : "六级"}练习`} />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T
            en={`The written test has four sections: writing 15% · listening 35% · reading 35% · translation 15%. Practice material is clearly labeled — never presented as official exam questions.`}
            zh={`笔试四个部分：写作 15% · 听力 35% · 阅读 35% · 翻译 15%。练习材料明确标注——绝不冒充官方真题。`}
          />
        </p>
      </header>

      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("learning")}
          className={`press rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ${
            mode === "learning" ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
          }`}
        >
          <T en="Learning mode" zh="学习模式" />
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("exam");
            void startExam();
          }}
          className={`press rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ${
            mode === "exam" ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
          }`}
        >
          <T en="Exam mode (timed)" zh="考试模式（计时）" />
        </button>
        <span className="ml-2 text-[11.5px] text-ink-3">
          {mode === "learning"
            ? <T en="transcripts + retry available" zh="可看原文、可重试" />
            : <T en={`official section order & timing · total ${exam === "cet4" ? "125" : "130"} min (shortened in this practice build)`} zh={`官方分区顺序与计时 · 共 ${exam === "cet4" ? "125" : "130"} 分钟（练习版缩短）`} />}
        </span>
      </div>

      {/* exam mode = one sequential flow, no section cards */}
      {mode === "exam" && examSession ? (
        <div className="card-specular rounded-card bg-surface p-6">
          <SectionTimer session={examSession} onExhausted={() => void advanceExamSection(true)} />
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            <T en="The exam runs in official section order. Each section auto-advances when its time runs out — your answers are saved as you go." zh="考试按官方分区顺序进行。每部分到时自动进入下一部分——作答全程保存。" />
          </p>
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const count = tasks.filter((t) => t.section === s.key).length;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSection(s.key);
                if (sectionTasks[0]) setActiveTask(sectionTasks[0]);
                else if (tasks.filter((t) => t.section === s.key)[0]) setActiveTask(tasks.filter((t) => t.section === s.key)[0]);
              }}
              disabled={count === 0}
              className="press card-specular rounded-2xl bg-surface p-5 text-left disabled:opacity-40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
                  <Icon size={17} strokeWidth={1.7} className="text-accent-text" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">
                    <T en={s.en} zh={s.zh} />
                  </p>
                  <p className="text-[12px] text-ink-3">
                    {count > 0
                      ? <T en={`${count} task${count > 1 ? "s" : ""} available`} zh={`${count} 个任务`} />
                      : <T en="No tasks yet — import material" zh="暂无任务——导入材料" />}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
