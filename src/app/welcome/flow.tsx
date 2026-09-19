"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { T, useBilingual } from "@/components/i18n";
import { btn } from "@/components/ui";
import { saveWelcomeChunk } from "./actions";

/* ── First-session guided loop — teach the product by doing, not by tour ────
 * Read → Notice → Recall → Use → Done. Every step writes real learning data
 * through the same production endpoints the rest of the app uses, so "your
 * practice will adapt" is literally true the moment the loop ends. */

export interface WelcomeMaterial {
  passageTitle: string;
  passage: string;
  corpusChunkId: number;
  expression: string;
  meaningEn: string;
  meaningZh: string;
  example: string | null;
}

interface GradeResult {
  quality: 0 | 3 | 5;
  correct: boolean;
  verdict: string;
  targetAnswer: string;
}

interface GenerationVerdict {
  pass: boolean;
  feedback: string;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;

export function WelcomeFlow({ material }: { material: WelcomeMaterial }) {
  const bilingual = useBilingual();
  const [step, setStep] = useState<Step>(0);
  const [revealed, setRevealed] = useState(false);
  const [ids, setIds] = useState<{ chunkId: number; retrievalItemId: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [sentence, setSentence] = useState("");
  const [sending, setSending] = useState(false);
  const [useFeedback, setUseFeedback] = useState<GenerationVerdict | null>(null);

  const startRetrieve = async () => {
    setSaving(true);
    const saved = await saveWelcomeChunk(material.corpusChunkId);
    setSaving(false);
    if (saved) setIds(saved);
    setStep(3);
  };

  const check = async () => {
    if (!ids || !answer.trim() || checking) return;
    setChecking(true);
    const res = await fetch("/api/review/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retrievalItemId: ids.retrievalItemId, mode: "production", response: answer }),
    });
    setGrade(await res.json());
    setChecking(false);
  };

  const sendSentence = async () => {
    if (!ids || !sentence.trim() || sending) return;
    setSending(true);
    const res = await fetch("/api/ai/generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunkId: ids.chunkId, sentence }),
    });
    const data = await res.json();
    setUseFeedback(data.verdict ?? null);
    setSending(false);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-6 py-16">
      {/* step dots — 5 marks, no labels */}
      {step > 0 && step < 5 && (
        <div className="mb-10 flex items-center gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={`h-[5px] flex-1 rounded-full ${step >= n ? "bg-accent" : "bg-surface-2"}`}
            />
          ))}
        </div>
      )}

      {/* ── 0 · Welcome ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="enter">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
            <T en="Let's build your English ability." zh="来建立你真正的英语能力。" />
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            <T
              en="You don't need to understand the system yet. We'll guide you through your first session — it takes about three minutes."
              zh="你现在不需要理解这个系统。我们会带你完成第一次学习——大约三分钟。"
            />
          </p>
          <button type="button" onClick={() => setStep(1)} className={`${btn.primary} mt-8 h-11 px-6`}>
            <T en="Start your first session" zh="开始第一次学习" />
            <ArrowRight size={15} strokeWidth={2} className="ml-2" />
          </button>
        </div>
      )}

      {/* ── 1 · Read ────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="enter">
          <p className="t-caption">
            <T en="Step 1 · Read" zh="第一步 · 阅读" />
          </p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Read this." zh="读一读这段话。" />
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            <T en="Just read it naturally — no test yet." zh="自然地读就好——现在还不考你。" />
          </p>
          <div className="mt-6 rounded-card bg-surface p-5 sm:p-6">
            <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">{material.passageTitle}</p>
            <p className="mt-3 text-[15.5px] leading-[1.75] text-ink text-pretty">{material.passage}</p>
          </div>
          <button type="button" onClick={() => setStep(2)} className={`${btn.primary} mt-7 h-11 px-6`}>
            <T en="Continue" zh="继续" />
          </button>
        </div>
      )}

      {/* ── 2 · Notice ──────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="enter">
          <p className="t-caption">
            <T en="Step 2 · Notice" zh="第二步 · 注意" />
          </p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.015em] text-ink">
            <T en="What do you think this means?" zh="你觉得这是什么意思？" />
          </h2>
          <p className="mt-6 text-center text-[24px] font-semibold tracking-[-0.015em] text-ink text-pretty">
            {material.expression}
          </p>
          {!revealed ? (
            <>
              <p className="mt-3 text-center text-[13px] text-ink-3">
                <T en="Take a guess first — thinking is the learning." zh="先猜一猜——思考本身就是学习。" />
              </p>
              <button type="button" onClick={() => setRevealed(true)} className={`${btn.ghost} mt-7 h-10 px-5`}>
                <T en="Show me" zh="看看答案" />
              </button>
            </>
          ) : (
            <div className="enter mt-5 rounded-card bg-surface p-5 text-center sm:p-6">
              <p className="text-[15px] leading-relaxed text-ink">{material.meaningEn}</p>
              {bilingual && material.meaningZh && (
                <p className="mt-1 text-[13px] text-ink-3">{material.meaningZh}</p>
              )}
              {material.example && (
                <p className="mt-3 border-t border-line pt-3 text-[13.5px] leading-relaxed text-ink-2 text-pretty">
                  {material.example}
                </p>
              )}
            </div>
          )}
          {revealed && (
            <button type="button" onClick={startRetrieve} disabled={saving} className={`${btn.primary} mt-7 h-11 px-6`}>
              <T en={saving ? "Saving…" : "Continue"} zh={saving ? "保存中…" : "继续"} />
            </button>
          )}
        </div>
      )}

      {/* ── 3 · Recall ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="enter">
          <p className="t-caption">
            <T en="Step 3 · Recall" zh="第三步 · 回忆" />
          </p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Now say it in English." zh="现在用英语说出它。" />
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            <T en="From memory — that's what makes it stick." zh="凭记忆——这样才记得住。" />
          </p>
          <div className="mt-6 rounded-card bg-surface p-5 sm:p-6">
            <p className="text-[20px] font-medium leading-relaxed text-ink text-pretty">
              {bilingual && material.meaningZh ? material.meaningZh : material.meaningEn}
            </p>
            {!grade ? (
              <>
                <textarea
                  autoFocus
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={2}
                  placeholder={bilingual ? "Type the expression · 输入这个英文表达" : "Type the expression…"}
                  className="input-base mt-4 w-full resize-none px-4 py-3 text-[15px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      check();
                    }
                  }}
                />
                <button type="button" onClick={check} disabled={checking || !answer.trim()} className={`${btn.primary} mt-4 h-11 px-6`}>
                  <T en={checking ? "Checking…" : "Check"} zh={checking ? "检查中…" : "检查"} />
                </button>
              </>
            ) : (
              <div className="enter mt-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      grade.quality === 5
                        ? "bg-ok/[0.12] text-ok-text"
                        : grade.quality === 3
                          ? "bg-warn/[0.12] text-warn-text"
                          : "bg-err/[0.09] text-err-text"
                    }`}
                  >
                    {grade.quality === 5 ? <Check size={13} strokeWidth={2.5} /> : grade.quality === 3 ? <span className="text-[12px] font-semibold">~</span> : <X size={13} strokeWidth={2.5} />}
                  </span>
                  <p className="text-[15px] font-medium text-ink">
                    {grade.quality === 5 ? (
                      <T en="You remembered it." zh="你记住了。" />
                    ) : grade.quality === 3 ? (
                      <T en="Close — this is the expression:" zh="很接近——它是这样说的：" />
                    ) : (
                      <T en="Not yet — here it is:" zh="还没记住——它是：" />
                    )}
                  </p>
                </div>
                {grade.quality < 5 && (
                  <p className="mt-2 pl-[34px] text-[16px] font-semibold text-ink">“{grade.targetAnswer}”</p>
                )}
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                  {grade.quality === 5 ? (
                    <T en="It's now in your memory queue — we'll ask again before you forget." zh="它已进入你的记忆队列——在遗忘之前我们会再问你。" />
                  ) : (
                    <T en="That's fine — forgetting is part of it. We'll ask again soon." zh="没关系——遗忘是学习的一部分。很快会再问你。" />
                  )}
                </p>
                <button type="button" onClick={() => setStep(4)} className={`${btn.primary} mt-5 h-11 px-6`}>
                  <T en="Continue" zh="继续" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4 · Use ─────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="enter">
          <p className="t-caption">
            <T en="Step 4 · Use" zh="第四步 · 使用" />
          </p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Now use it yourself." zh="现在自己用一次。" />
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            <T en="One sentence about your own life." zh="用一句话说说你自己的生活。" />
          </p>
          <div className="mt-6 rounded-card bg-surface p-5 sm:p-6">
            <p className="text-center text-[18px] font-semibold text-ink">{material.expression}</p>
            {!useFeedback ? (
              <>
                <textarea
                  autoFocus
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  rows={2}
                  placeholder={bilingual ? "Your sentence · 你的句子" : "Your sentence…"}
                  className="input-base mt-4 w-full resize-none px-4 py-3 text-[15px]"
                />
                <button type="button" onClick={sendSentence} disabled={sending || !sentence.trim()} className={`${btn.primary} mt-4 h-11 px-6`}>
                  <T en={sending ? "Checking…" : "Check my sentence"} zh={sending ? "检查中…" : "检查我的句子"} />
                </button>
              </>
            ) : (
              <div className="enter mt-4">
                <p className="text-[14px] leading-relaxed text-ink-2">{useFeedback.feedback}</p>
                <button type="button" onClick={() => setStep(5)} className={`${btn.primary} mt-5 h-11 px-6`}>
                  <T en="Finish" zh="完成" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5 · Done ────────────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="enter">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
            <T en="You just completed your first learning loop." zh="你刚完成了第一个学习循环。" />
          </h1>
          <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.07em] text-ink-3">
            <T en="Read → Notice → Recall → Use" zh="阅读 → 注意 → 回忆 → 使用" />
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            <T
              en="Everything you just did left a real learning record. From now on, the system schedules your review and practice from those results — nothing to configure. Just come back tomorrow."
              zh="你刚做的每一步都留下了真实的学习记录。从现在起，系统会根据这些结果安排你的复习和练习——不需要设置什么，明天回来就行。"
            />
          </p>
          <Link href="/" className={`${btn.primary} press mt-8 inline-flex h-11 items-center px-6`}>
            <T en="See what I should practice next" zh="看看我接下来该练什么" />
            <ArrowRight size={15} strokeWidth={2} className="ml-2" />
          </Link>
        </div>
      )}
    </div>
  );
}
