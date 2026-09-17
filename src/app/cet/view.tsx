"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Headphones, PenLine, RotateCcw, X } from "lucide-react";
import { T, useBilingual } from "@/components/i18n";
import { btn } from "@/components/ui";
import type { CetTaskRow } from "@/server/services/cet-engine";

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
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setActiveTask(null);
    setResponses({});
    setFreeText("");
    setResult(null);
  };

  const retry = () => {
    setResult(null);
    setResponses({});
    setFreeText("");
  };

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
              <div className="flex gap-2.5">
                {mode === "learning" && (
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
        {[["learning", "Learning"], ["exam", "Exam"]].map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m as Mode)}
            className={`press rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ${
              mode === m ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            {label === "Learning" ? <T en="Learning mode" zh="学习模式" /> : <T en="Exam mode" zh="考试模式" />}
          </button>
        ))}
        <span className="ml-2 text-[11.5px] text-ink-3">
          {mode === "learning"
            ? <T en="transcripts + retry available" zh="可看原文、可重试" />
            : <T en="no hints, one submission" zh="无提示、一次交卷" />}
        </span>
      </div>

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
    </div>
  );
}
