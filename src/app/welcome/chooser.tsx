"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Map } from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";
import { completeTourAction } from "./actions";

/* ── Welcome chooser — three honest doors, one obvious default ──────────────
 * Primary: the guided first session (learn by doing). Secondary: look around
 * first (the category tour). Quiet: skip entirely — the system will still
 * explain itself one line at a time inside Today. */
export function WelcomeChooser() {
  const [pending, start] = useTransition();

  const skip = () => {
    start(async () => {
      await completeTourAction();
      window.location.href = "/";
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-6 py-16">
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
        <Link href="/welcome/loop" className={`${btn.primary} press mt-8 inline-flex h-11 items-center gap-2 px-6`}>
          <T en="Start your first session" zh="开始第一次学习" />
          <ArrowRight size={15} strokeWidth={2} />
        </Link>
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
    </main>
  );
}
