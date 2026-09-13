"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  CircleAlert,
  GraduationCap,
  Layers,
  Mic,
  PenLine,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";
import { completeTourAction } from "./actions";

/* ── First-time tour — meet the rooms before you study in them ──────────────
 * The onboarding teaches WHERE things live (one category per screen, one
 * sentence each), not the learning science. The guided first loop stays
 * available as an optional link on the final screen — trying it is a choice,
 * never the opening move. */

interface Stop {
  icon: LucideIcon;
  name: { en: string; zh: string };
  line: { en: string; zh: string }; // what it is, in one sentence
  detail: { en: string; zh: string }; // when you'd use it
}

const STOPS: Stop[] = [
  {
    icon: Target,
    name: { en: "Today", zh: "今日" },
    line: { en: "Every day starts here.", zh: "每天从这里开始。" },
    detail: {
      en: "It answers one question — what to practice today, and why. One tap starts the day's session.",
      zh: "它只回答一个问题——今天练什么、为什么是它。点一下就开始当天的练习。",
    },
  },
  {
    icon: RotateCcw,
    name: { en: "Practice", zh: "练习" },
    line: { en: "Recall from memory.", zh: "凭记忆回想。" },
    detail: {
      en: "The system picks the expressions you most need to review. Failing to recall is normal — the attempt itself is what makes memory stick.",
      zh: "系统会挑出你最该复习的表达来考你。想不起来很正常——正是\"回想\"这个动作让记忆变牢。",
    },
  },
  {
    icon: BookOpen,
    name: { en: "Library", zh: "内容库" },
    line: { en: "Your reading & listening material.", zh: "你的阅读和听力材料。" },
    detail: {
      en: "Browse by topic and level. While reading, tap any word to look it up or save it — noticing happens in context.",
      zh: "按主题和难度浏览。阅读时点任何词都能查、能存进你的语言库——在语境中注意到它。",
    },
  },
  {
    icon: TrendingUp,
    name: { en: "Progress", zh: "进步" },
    line: { en: "Real evidence, not feelings.", zh: "真实证据，不是感觉。" },
    detail: {
      en: "What you actually did today, which expressions are getting solid, and where your weakest link is.",
      zh: "你今天真实完成了什么、哪些表达正在变牢固、最弱的一环在哪——全在这里。",
    },
  },
];

const MORE: { icon: LucideIcon; name: { en: string; zh: string }; note: { en: string; zh: string } }[] = [
  { icon: PenLine, name: { en: "Writing", zh: "写作" }, note: { en: "Write, get AI feedback, rewrite it yourself", zh: "写作 + AI 反馈 + 自己重写" } },
  { icon: Mic, name: { en: "Speaking", zh: "口语" }, note: { en: "Launch your external AI speaking coach", zh: "启动外部 AI 口语教练" } },
  { icon: GraduationCap, name: { en: "IELTS", zh: "雅思练习" }, note: { en: "Real exam questions, skill by skill", zh: "真题逐项练习" } },
  { icon: ClipboardCheck, name: { en: "Mock exam", zh: "全真模考" }, note: { en: "Full 150-min Listening + Reading + Writing paper", zh: "150 分钟听力+阅读+写作整卷" } },
  { icon: CircleAlert, name: { en: "Mistakes", zh: "惯犯错误" }, note: { en: "Errors that keep coming back — retested in new contexts", zh: "反复出的错——换场景再测" } },
  { icon: Layers, name: { en: "Language", zh: "语言库" }, note: { en: "Everything you've saved: expressions, words, patterns", zh: "你存下的一切：表达、词、句式" } },
  { icon: Sparkles, name: { en: "AI Lab", zh: "AI 实验室" }, note: { en: "Drop in any sentence for a deep analysis", zh: "丢进任何句子做深度分析" } },
];

const TOTAL = 6; // welcome + 4 stops + more — completion is the 7th screen

export function WelcomeTour() {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  const next = () => setStep((s) => s + 1);

  const finish = () => {
    // mark the tour done (cookie + ensures the user row exists) before landing
    start(async () => {
      await completeTourAction();
      window.location.href = "/";
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-6 py-16">
      {step > 0 && (
        <div className="mb-10 flex items-center gap-1.5">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} className={`h-[5px] flex-1 rounded-full ${step > i ? "bg-accent" : "bg-surface-2"}`} />
          ))}
        </div>
      )}

      {/* ── 0 · Welcome ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="enter">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
            <T en="Welcome. Let's look around." zh="欢迎。先带你逛一圈。" />
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            <T
              en="Thirty seconds to see what's where — no setup, no test. You'll know exactly where to go for everything."
              zh="三十秒看完每个地方是干嘛的——不用设置、不用做题。看完你就知道每件事该去哪做。"
            />
          </p>
          <button type="button" onClick={next} className={`${btn.primary} mt-8 h-11 px-6`}>
            <T en="Start the tour" zh="开始导览" />
            <ArrowRight size={15} strokeWidth={2} className="ml-2" />
          </button>
        </div>
      )}

      {/* ── 1–4 · One category per screen ───────────────────────────────── */}
      {STOPS.map((stop, i) =>
        step === i + 1 ? (
          <div key={stop.name.en} className="enter">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <stop.icon size={22} strokeWidth={1.7} className="text-accent-text" />
            </div>
            <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
              <T en={stop.name.en} zh={stop.name.zh} />
            </p>
            <h2 className="mt-2 text-[24px] font-semibold leading-snug tracking-[-0.02em] text-ink text-pretty">
              <T en={stop.line.en} zh={stop.line.zh} />
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
              <T en={stop.detail.en} zh={stop.detail.zh} />
            </p>
            <button type="button" onClick={next} className={`${btn.primary} mt-8 h-11 px-6`}>
              <T en="Next" zh="下一个" />
              <ArrowRight size={15} strokeWidth={2} className="ml-2" />
            </button>
          </div>
        ) : null,
      )}

      {/* ── 5 · Everything else, at a glance ────────────────────────────── */}
      {step === 5 && (
        <div className="enter">
          <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
            <T en="More, when you need it" zh="更多，需要时再用" />
          </p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink text-pretty">
            <T en="The rest of the toolbox" zh="工具箱的其余部分" />
          </h2>
          <div className="mt-5 space-y-2.5">
            {MORE.map((m) => (
              <div key={m.name.en} className="flex items-center gap-3.5 rounded-xl bg-surface px-4 py-3">
                <m.icon size={16} strokeWidth={1.7} className="shrink-0 text-ink-3" />
                <div className="min-w-0">
                  <span className="text-[13.5px] font-semibold text-ink">
                    <T en={m.name.en} zh={m.name.zh} />
                  </span>
                  <span className="ml-2 text-[12px] text-ink-3">
                    <T en={m.note.en} zh={m.note.zh} />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={next} className={`${btn.primary} mt-8 h-11 px-6`}>
            <T en="Finish" zh="完成" />
            <ArrowRight size={15} strokeWidth={2} className="ml-2" />
          </button>
        </div>
      )}

      {/* ── 6 · Done ────────────────────────────────────────────────────── */}
      {step === 6 && (
        <div className="enter">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
            <T en="That's the whole map." zh="地图就这么多。" />
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            <T
              en="The system remembers what you actually know and what you keep missing. You just come back each day and press Start."
              zh="系统会记住你真正会的和一直没掌握的。你只需要每天回来，点开始。"
            />
          </p>
          <button type="button" onClick={finish} disabled={pending} className={`${btn.primary} mt-8 h-11 px-6`}>
            <T en={pending ? "Taking you there…" : "Go to Today"} zh={pending ? "正在进入…" : "进入今日"} />
            {!pending && <ArrowRight size={15} strokeWidth={2} className="ml-2" />}
          </button>
          <p className="mt-5 text-[12.5px] text-ink-3">
            <T en="Curious how a session feels? " zh="想先感受一次学习循环？ " />
            <Link href="/welcome/loop" className="font-medium text-accent-text hover:underline">
              <T en="Try a 3-minute first loop" zh="试试 3 分钟的第一次学习" />
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
