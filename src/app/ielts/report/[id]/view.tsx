"use client";

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, Locate, TrendingUp, Trophy, X } from "lucide-react";
import { T } from "@/components/i18n";
import { deriveErrorType } from "@/lib/ieltscb/adapter";

/* ── External reading report view — evidence first: every miss shows WHERE
 *    the answer lives in the passage before any explanation. Attempts on the
 *    same passage stack (never overwritten) so growth is visible. */

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

export interface AttemptHistoryRow {
  attemptId: number;
  createdAt: number;
  correct: number;
  incorrect: number;
  score: number | null;
  durationSeconds: number | null;
}

export function IeltsReportView({
  attemptId: currentAttemptId,
  title,
  sourceUrl,
  createdAt,
  score,
  band,
  bandBasis,
  durationSeconds,
  rightNumText,
  totalQuestions,
  officialGuide,
  passageDisplay,
  attemptHistory,
  persistentWrong,
  mastered,
  bankedWrongForms,
  questions,
  synonyms,
  coreWords,
}: {
  attemptId: number;
  title: string;
  sourceUrl: string | null;
  createdAt: number;
  score: number | null;
  band: number | null;
  bandBasis: string | null;
  durationSeconds: number | null;
  rightNumText: string | null;
  totalQuestions: number;
  officialGuide: string | null;
  passageDisplay: { label: string | null; sentences: { text: string; tags: string[] }[] }[];
  attemptHistory: AttemptHistoryRow[];
  persistentWrong: number[];
  mastered: number[];
  bankedWrongForms: Set<string>;
  questions: ReportQuestion[];
  synonyms: { questionNumber: number | null; questionWord: string; passageWords: string }[];
  coreWords: { text: string; note: string | null }[];
}) {
  const wrong = questions.filter((q) => q.isCorrect === false);
  // wrong questions open, right ones collapsed — misses are the point
  const [open, setOpen] = useState<Set<number>>(new Set(wrong.map((q) => q.number)));
  const [showPassage, setShowPassage] = useState(false);
  const [focusQuestion, setFocusQuestion] = useState<number | null>(null);

  const toggle = (n: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  /** 查看原文：open the passage, scroll to the paragraph carrying this
   *  question's evidence, flash its tagged sentences. */
  const locateEvidence = (n: number) => {
    setShowPassage(true);
    setFocusQuestion(n);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`evi-q${n}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    });
  };

  const date = new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const mins = durationSeconds != null ? Math.round(durationSeconds / 60) : null;
  const isFullTest = totalQuestions >= 40;

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
        {band != null && !isFullTest && (
          <span className="tabular-nums">
            <T en={`converted reference ≈ ${band}`} zh={`本篇练习换算参考 ≈ ${band}`} />
          </span>
        )}
        {band != null && isFullTest && (
          <span className="tabular-nums">
            <T en={`Practice Reading Estimate ${band}`} zh={`阅读练习估算 ${band}`} />
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
      {/* scoring caption derived from CURRENT semantics so attempts imported
   *  before a copy change also read correctly (stored bandBasis kept only
   *  as provenance) */}
      <p className="mt-1 text-[11.5px] text-ink-3">
        {isFullTest
          ? "Practice Reading Estimate — full 40-question test, unofficial range"
          : "Passage practice reference — scaled to the 40-question Cambridge AC table; not an official IELTS band"}
      </p>

      {/* attempt history — same passage, every imported session */}
      {attemptHistory.length > 1 && (
        <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
          <h3 className="text-[14px] font-semibold text-ink">
            <T en="Attempts on this passage" zh="这篇的答题记录" />
          </h3>
          <div className="mt-3 space-y-1.5">
            {attemptHistory.map((a, i) => (
              <button
                key={a.attemptId}
                type="button"
                onClick={() => {
                  if (a.attemptId !== currentAttemptId) window.location.href = `/ielts/report/${a.attemptId}`;
                }}
                className={`press flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${
                  a.attemptId === currentAttemptId ? "bg-accent/[0.07]" : "nav-hover"
                }`}
              >
                <span className="w-[68px] shrink-0 font-medium text-ink">Attempt {i + 1}</span>
                <span className="tabular-nums text-ink-2">
                  {a.correct} <T en="correct" zh="对" /> · {a.incorrect} <T en="wrong" zh="错" />
                </span>
                {a.score != null && <span className="tabular-nums text-ink-3">{a.score}%</span>}
                {a.durationSeconds != null && (
                  <span className="tabular-nums text-ink-3">{Math.round(a.durationSeconds / 60)} min</span>
                )}
                {a.attemptId === currentAttemptId && (
                  <span className="ml-auto text-[11px] font-medium text-accent-text">
                    <T en="current" zh="当前" />
                  </span>
                )}
              </button>
            ))}
          </div>
          {(persistentWrong.length > 0 || mastered.length > 0) && (
            <div className="mt-4 space-y-2 border-t border-line pt-3.5">
              {persistentWrong.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                  <X size={13} className="shrink-0 text-err-text" />
                  <T en="Still wrong every time:" zh="持续错误：" />
                  {persistentWrong.map((n) => (
                    <button key={n} type="button" onClick={() => locateEvidence(n)} className="press rounded-md bg-err/[0.09] px-1.5 py-0.5 font-medium text-err-text">
                      Q{n}
                    </button>
                  ))}
                </p>
              )}
              {mastered.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                  <Trophy size={13} className="shrink-0 text-ok-text" />
                  <T en="Turned around since last time:" zh="已掌握：" />
                  {mastered.map((n) => (
                    <button key={n} type="button" onClick={() => locateEvidence(n)} className="press rounded-md bg-ok/[0.1] px-1.5 py-0.5 font-medium text-ok-text">
                      Q{n}
                    </button>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* weakness summary */}
      <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
        <p className="text-[14px] leading-relaxed text-ink">
          {wrong.length === 0 ? (
            <T en="All correct — nothing to attack this time." zh="全对——这次没有需要攻克的错题。" />
          ) : (
            <T
              en={`${wrong.length} wrong of ${questions.length}. Open a miss: the evidence sentence comes first — where the answer lives — then the official guide and the paraphrase that bridged question and passage.`}
              zh={`${questions.length} 题错了 ${wrong.length} 道。点开一道错题：先看证据句——答案在原文哪里——再看官方定位与连接题目和原文的同义替换。`}
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
          const errType = wrongQ
            ? deriveErrorType({ userAnswer: q.userAnswer || null, type: q.type, paraphrases: q.explanation?.paraphrases ?? [] })
            : null;
          const qKeyword = q.explanation?.paraphrases[0]?.questionWord ?? null;
          const pPhrase = q.explanation?.paraphrases[0]?.passageWords ?? null;
          const banked = wrongQ && q.explanation?.paraphrases.some((p) => bankedWrongForms.has(p.questionWord));
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
                    {errType && (
                      <span className="rounded-md bg-err/[0.08] px-1.5 py-px text-[10.5px] font-medium text-err-text">
                        <T en={errType.en} zh={errType.zh} />
                      </span>
                    )}
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
                <div className="enter space-y-3 border-t border-line px-4 py-4 text-[13px] leading-relaxed">
                  {/* evidence FIRST — where the answer lives */}
                  <div className="rounded-xl bg-accent/[0.06] p-3.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                      <Locate size={12} />
                      <T en="Evidence" zh="证据" />
                      {q.explanation.evidence[0]?.paragraphLabel && (
                        <span className="rounded bg-accent/[0.12] px-1.5 py-px text-[10.5px]">
                          <T en={`Paragraph ${q.explanation.evidence[0].paragraphLabel}`} zh={`${q.explanation.evidence[0].paragraphLabel} 段`} />
                        </span>
                      )}
                    </p>
                    <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-ink">{q.explanation.evidenceEn}</p>
                    {q.explanation.evidenceZh && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{q.explanation.evidenceZh}</p>}
                    <button type="button" onClick={() => locateEvidence(q.number)} className="press mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent-text">
                      <T en="View in passage →" zh="查看原文 →" />
                    </button>
                  </div>

                  {(qKeyword || pPhrase) && (
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
                      {qKeyword && (
                        <span className="text-ink-2">
                          <span className="text-[11px] uppercase tracking-[0.05em] text-ink-3">
                            <T en="Question keyword" zh="题目关键词" />{" "}
                          </span>
                          <span className="font-medium text-ink">{qKeyword}</span>
                        </span>
                      )}
                      {qKeyword && pPhrase && <span className="text-ink-3">→</span>}
                      {pPhrase && (
                        <span className="text-ink-2">
                          <span className="text-[11px] uppercase tracking-[0.05em] text-ink-3">
                            <T en="Passage phrase" zh="原文表述" />{" "}
                          </span>
                          <span className="font-medium text-ink">{pPhrase}</span>
                        </span>
                      )}
                    </p>
                  )}

                  <ExplainLine label={{ en: "Where", zh: "定位" }} text={q.explanation.guide} mono />
                  <ExplainLine label={{ en: "Why", zh: "解析" }} text={q.explanation.reasoning} />
                  {q.explanation.paraphrases.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">
                        <T en="Synonym mapping" zh="同义替换" />
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
                  {banked && (
                    <p className="flex items-center gap-1.5 text-[12px] text-ok-text">
                      <TrendingUp size={13} />
                      <T
                        en="In your Error Bank — it will return in review until it sticks."
                        zh="已进入错误银行——复习时会反复出现，直到记牢。"
                      />
                    </p>
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

      {/* passage — paragraphs with evidence sentences highlighted */}
      <div className="card-specular mt-5 rounded-2xl bg-surface p-5">
        <button type="button" onClick={() => setShowPassage((s) => !s)} className="press flex w-full items-center justify-between text-left">
          <h3 className="text-[14px] font-semibold text-ink">
            <T en="Passage" zh="原文" />
          </h3>
          <ChevronDown size={15} className={`text-ink-3 transition-transform duration-200 ${showPassage ? "rotate-180" : ""}`} />
        </button>
        {showPassage && (
          <div className="mt-3 space-y-3.5">
            {passageDisplay.length === 0 && (
              <p className="whitespace-pre-line text-[13.5px] leading-[1.85] text-ink-2">
                <T en="Passage not tagged by the source for this import." zh="本篇导入时来源未提供句级标记。" />
              </p>
            )}
            {passageDisplay.map((p, pi) => {
              const seenTags = new Set<string>();
              return (
                <div key={pi} id={`evi-para-${p.label ?? pi}`}>
                  {p.label && <span className="mr-2 font-semibold text-ink-3">{p.label}.</span>}
                  {p.sentences.map((s, si) => {
                    const tagged = s.tags.length > 0;
                    const isFocus = focusQuestion != null && s.tags.includes(`Q${focusQuestion}`);
                    const firstTag = s.tags[0];
                    const anchorId = firstTag && !seenTags.has(firstTag) ? `evi-${firstTag.toLowerCase()}` : undefined;
                    if (firstTag) seenTags.add(firstTag);
                    return (
                      <span
                        key={si}
                        id={anchorId}
                        className={
                          isFocus
                            ? "rounded bg-accent/[0.22] px-0.5 transition-colors duration-500"
                            : tagged
                              ? "bg-accent/[0.09] px-0.5"
                              : undefined
                        }
                        title={tagged ? s.tags.join(", ") : undefined}
                      >
                        {s.text}{" "}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
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
