"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Map } from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";
import { completeTourAction, ensureWelcomeUser } from "./actions";
import { setLearningLevelAction } from "@/app/actions";

/* ── Welcome chooser — three honest doors, one obvious default ──────────────
 * IELTS first-timers pick a starting level first (self-assessment — no fake
 * external test link; the project has none). Primary: guided first session.
 * Secondary: look around first. Quiet: skip. */

const PICK_LEVELS: { value: string; en: string; zh: string }[] = [
  { value: "A2", en: "A2 — I can handle everyday basics with simple sentences.", zh: "A2 —— 能用简单句处理日常基础表达。" },
  { value: "B1", en: "B1 — I can give opinions and describe experiences.", zh: "B1 —— 能表达观点、描述经历。" },
  { value: "B2", en: "B2 — I can discuss nuanced topics in connected paragraphs.", zh: "B2 —— 能就较复杂话题连贯讨论。" },
  { value: "C1", en: "C1 — I can argue precisely and understand abstract texts.", zh: "C1 —— 能精确论证、理解抽象文本。" },
];

export function WelcomeChooser({ needsLevel }: { needsLevel: boolean }) {
  const [step, setStep] = useState<"welcome" | "level">("welcome");
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const skip = () => {
    start(async () => {
      await completeTourAction();
      window.location.href = "/";
    });
  };

  const goLoop = async () => {
    if (!picked) return;
    await ensureWelcomeUser();
    await setLearningLevelAction(picked);
    window.location.href = "/welcome/loop";
  };

  if (step === "level") {
    return (
      // div, not main — AppShell already owns the page's <main>
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-6 py-16">
        <div className="enter">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
            <T en="Let's find your starting level." zh="先找到你的起点水平。" />
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
            <T
              en="Pick the description that fits you best. We'll use it to choose reading materials and speaking practice at the right difficulty — and you can change it anytime in Settings."
              zh="选择最符合你现状的一档。我们会据此推荐合适难度的阅读材料和口语练习——之后随时可以在设置里修改。"
            />
          </p>
          <div className="mt-6 space-y-2">
            {PICK_LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setPicked(l.value)}
                className={`press block w-full rounded-xl px-4 py-3.5 text-left text-[13.5px] leading-relaxed transition-colors duration-150 ${
                  picked === l.value
                    ? "bg-accent/[0.08] font-semibold text-accent-text"
                    : "bg-surface-2 text-ink-2 hover:text-ink"
                }`}
              >
                <T en={l.en} zh={l.zh} />
              </button>
            ))}
          </div>
          {picked && (
            <button type="button" onClick={goLoop} disabled={pending} className={`${btn.primary} press mt-7 inline-flex h-11 items-center gap-2 px-6`}>
              <T en={pending ? "Setting up…" : `Continue with ${picked}`} zh={pending ? "准备中…" : `以 ${picked} 继续`} />
              {!pending && <ArrowRight size={15} strokeWidth={2} />}
            </button>
          )}
          <p className="mt-5 text-[12.5px] text-ink-3">
            <T en="This helps us choose: reading at the right difficulty · speaking practice at your level · vocabulary that's useful for you." zh="它帮助我们选择：合适难度的阅读 · 符合水平的口语练习 · 对你有用的词汇。" />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-6 py-16">
      <div className="enter">
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
          <T en="Let's build your English ability." zh="来建立你真正的英语能力。" />
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          <T
            en="You don't need to understand the system yet. We'll guide you through your first session — about three minutes."
            zh="你现在不需要理解这个系统。我们会带你完成第一次学习——大约三分钟。"
          />
        </p>
        {needsLevel ? (
          <button type="button" onClick={() => setStep("level")} className={`${btn.primary} press mt-8 inline-flex h-11 items-center gap-2 px-6`}>
            <T en="Let's find your starting level" zh="先找到你的起点水平" />
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        ) : (
          <Link href="/welcome/loop" className={`${btn.primary} press mt-8 inline-flex h-11 items-center gap-2 px-6`}>
            <T en="Start your first session" zh="开始第一次学习" />
            <ArrowRight size={15} strokeWidth={2} />
          </Link>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <Link href="/welcome/tour" className="press inline-flex items-center gap-1.5 font-medium text-accent-text hover:underline">
            <Map size={13} strokeWidth={2} />
            <T en="Look around first (30s)" zh="先逛一圈（30 秒）" />
          </Link>
          <button type="button" onClick={skip} disabled={pending} className="press text-ink-3 hover:text-ink">
            <T en={pending ? "Taking you there…" : "Skip — I'll just start"} zh={pending ? "正在进入…" : "跳过——直接开始"} />
          </button>
        </div>
      </div>
    </div>
  );
}
