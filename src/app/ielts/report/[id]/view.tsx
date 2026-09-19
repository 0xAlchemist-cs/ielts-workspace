"use client";

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, X } from "lucide-react";
import { T } from "@/components/i18n";

/* ── External reading report view — every miss with its official evidence.
 *    Quiet, hierarchical, bilingual; wrong questions expand first. */

interface QExplanation {
  questionNumber: number;
  answer: string | null;
  guide: string | null;
  evidenceEn: string | null;
  evidenceZh: string | null;
  reasoning: string | null;
  paraphrase: string | null;
  paraphrases: { questionWord: string; passageWords: string }[];
  evidence: { paragraphLabel: string; sentenceId: string | null; text: string }[];
}

export interface ReportQuestion {
  number: number;
  type: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  acceptedAnswers: string[];
  userAnswer: string;
  isCorrect: boolean | null;
  explanation: QExplanation | null;
}

export function IeltsReportView({
  attemptId: _attemptId,
  title,
  rightNumText,
  sourceUrl,
  createdAt,
  score,
  band,
  bandBasis,
  durationSeconds,
  passageText,
  officialGuide,
  questions,
  synonyms,
  coreWords,
}: {
  attemptId: number;
  title: string;
  breadcrumb?: string | null;
  sourceUrl: string | null;
  createdAt: number;
  score: number | null;
  band: number | null;
  bandBasis: string | null;
  durationSeconds: number | null;
  rightNumText: string | null;
  passageText: string;
  officialGuide: string | null;
  questions: ReportQuestion[];
  synonyms: { questionNumber: number | null; questionWord: string; passageWords: string }[];
  coreWords: { text: string; note: string | null }[];
}) {
  const wrong = questions.filter((q) => q.isCorrect === false);
  const correct = questions.filter((q) => q.isCorrect === true);
  // wrong questions open, right ones collapsed — misses are the point
  const [open, setOpen] = useState<Set<number>>(new Set(wrong.map((q) => q.number)));
  const [showPassage, setShowPassage] = useState(false);

  const toggle = (n: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const date = new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const mins = durationSeconds != null ? Math.round(durationSeconds / 60) : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* header */}
      <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
        <T en="External reading report" zh="外部阅读报告" />
      </p>
      <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">{title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
        <span>{date}</span>
        {rightNumText && (
          <span className="font-semibold tabular-nums text-ink">
            <T en={`${rightNumText} correct`} zh={`答对 ${rightNumText}`} />
          </span>
        )}
        {band != null && (
          <span className="tabular-nums">
            <T en={`Band ≈ ${band} (passage estimate)`} zh={`约 Band ${band}（单篇估算）`} />
          </span>
        )}
        {mins != null && (
          <span>
            <T en={`${mins} min`} zh={`${mins} 分钟`} />
          </span>
        )}
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="press inline-flex items-center gap-1 font-medium text-accent-text">
            ieltscb.com
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      {bandBasis && <p className="mt-1 text-[11.5px] text-ink-3">{bandBasis}</p>}

      {/* weakness summary */}
      <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
        <p className="text-[14px] leading-relaxed text-ink">
          {wrong.length === 0 ? (
            <T en="All correct — nothing to attack this time." zh="全对——这次没有需要攻克的错题。" />
          ) : (
            <T
              en={`${wrong.length} wrong of ${questions.length}. Each miss below carries the official locator, the evidence sentence, and the paraphrase that bridged question and passage.`}
              zh={`${questions.length} 题错了 ${wrong.length} 道。下面每道错题都带官方定位、原文证据句、以及连接题目与原文的同义替换。`}
            />
          )}
        </p>
        {wrong.length > 0 && wrong.some((q) => q.explanation?.paraphrases.length) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {wrong
              .filter((q) => q.explanation?.paraphrases.length)
              .flatMap((q) => q.explanation!.paraphrases.map((p, i) => (
                <span key={`${q.number}-${i}`} className="chip-on rounded-lg px-2.5 py-1 text-[12px]">
                  {p.questionWord} = {p.passageWords}
                </span>
              )))}
          </div>
        )}
      </div>

      {/* per-question list */}
      <div className="mt-5 space-y-2">
        {questions.map((q) => {
          const isOpen = open.has(q.number);
          const wrongQ = q.isCorrect === false;
          return (
            <div key={q.number} className="card-specular rounded-xl bg-surface">
              <button
                type="button"
                onClick={() => toggle(q.number)}
                className="press flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
                    q.isCorrect === true ? "bg-ok/[0.12]" : wrongQ ? "bg-err/[0.1]" : "bg-surface-2"
                  }`}
                >
                  {q.isCorrect === true ? (
                    <Check size={13} strokeWidth={2.6} className="text-ok-text" />
                  ) : wrongQ ? (
                    <X size={13} strokeWidth={2.6} className="text-err-text" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">Q{q.number}</span>
                    <span className="text-[11px] text-ink-3">{q.type}</span>
                  </span>
                  <span className="mt-1 block truncate text-[13px] text-ink-2">{q.questionText}</span>
                  {wrongQ && (
                    <span className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[12.5px]">
                      <span className="text-err-text">
                        <T en={`You: ${q.userAnswer || "(blank)"}`} zh={`你答：${q.userAnswer || "（空白）"}`} />
                      </span>
                      <span className="font-medium text-ok-text">
                        <T en={`Answer: ${q.correctAnswer}`} zh={`答案：${q.correctAnswer}`} />
                      </span>
                      {q.acceptedAnswers.length > 0 && (
                        <span className="text-[11.5px] text-ink-3">+ {q.acceptedAnswers.join(" / ")}</span>
                      )}
                    </span>
                  )}
                </span>
                <ChevronDown size={15} className={`mt-1 shrink-0 text-ink-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && q.explanation && (
                <div className="enter space-y-2.5 border-t border-line px-4 py-4 text-[13px] leading-relaxed">
                  <ExplainLine label={{ en: "Where", zh: "定位" }} text={q.explanation.guide} mono />
                  <ExplainLine label={{ en: "Evidence", zh: "原文" }} text={q.explanation.evidenceEn} />
                  <ExplainLine label={{ en: "Translation", zh: "译文" }} text={q.explanation.evidenceZh} dim />
                  <ExplainLine label={{ en: "Why", zh: "解析" }} text={q.explanation.reasoning} />
                  {q.explanation.paraphrases.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">
                        <T en="Paraphrase" zh="同义替换" />
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {q.explanation.paraphrases.map((p, i) => (
                          <span key={i} className="chip rounded-lg px-2.5 py-1 text-[12px]">
                            {p.questionWord} = {p.passageWords}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isOpen && !q.explanation && (
                <p className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
                  <T en="No official explanation on the source for this question." zh="来源网站没有提供这道题的官方解析。" />
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* whole-paper strategy guide */}
      {officialGuide && (
        <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
          <h3 className="text-[14px] font-semibold text-ink">
            <T en="Official strategy notes for this paper" zh="本篇官方策略笔记" />
          </h3>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{officialGuide}</p>
        </div>
      )}

      {/* passage */}
      <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
        <button type="button" onClick={() => setShowPassage((s) => !s)} className="press flex w-full items-center justify-between text-left">
          <h3 className="text-[14px] font-semibold text-ink">
            <T en="Passage" zh="原文" />
          </h3>
          <ChevronDown size={15} className={`text-ink-3 transition-transform duration-200 ${showPassage ? "rotate-180" : ""}`} />
        </button>
        {showPassage && <p className="mt-3 whitespace-pre-line text-[13.5px] leading-[1.85] text-ink-2">{passageText}</p>}
      </div>

      {/* synonyms + core words side by side on wide screens */}
      {(synonyms.length > 0 || coreWords.length > 0) && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {synonyms.length > 0 && (
            <div className="card-specular rounded-2xl bg-surface p-5">
              <h3 className="text-[14px] font-semibold text-ink">
                <T en="Synonym mappings" zh="同义替换清单" />
              </h3>
              <div className="mt-2.5 space-y-1.5">
                {synonyms.map((s, i) => (
                  <p key={i} className="text-[12.5px] text-ink-2">
                    {s.questionNumber != null && <span className="mr-1.5 font-medium text-ink-3">Q{s.questionNumber}</span>}
                    {s.questionWord} <span className="text-ink-3">=</span> {s.passageWords}
                  </p>
                ))}
              </div>
            </div>
          )}
          {coreWords.length > 0 && (
            <div className="card-specular rounded-2xl bg-surface p-5">
              <h3 className="text-[14px] font-semibold text-ink">
                <T en="Core words" zh="核心词" />
              </h3>
              <p className="mt-1 text-[11.5px] text-ink-3">
                <T en="Reference list from the source — not added to your vocabulary." zh="来源网站的核心词参考——未加入你的个人词库。" />
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {coreWords.map((w, i) => (
                  <span key={i} className="chip rounded-lg px-2 py-0.5 text-[12px]" title={w.note ?? undefined}>
                    {w.text}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExplainLine({ label, text, mono, dim }: { label: { en: string; zh: string }; text: string | null; mono?: boolean; dim?: boolean }) {
  if (!text) return null;
  return (
    <p className={dim ? "text-ink-3" : "text-ink-2"}>
      <span className="mr-2 inline-block min-w-[64px] text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3 align-top">
        <T en={label.en} zh={label.zh} />
      </span>
      <span className={mono ? "font-medium text-ink" : ""}>{text}</span>
    </p>
  );
}
