"use client";

import { useState } from "react";
import { Brain, Check, ChevronDown, Sparkles } from "lucide-react";
import { T } from "@/components/i18n";
import type { Insight, LearningMemory } from "@/server/services/learning-memory";

/* ── Learning Memory — "what the system has learned about you", human-first ─
 * Three primary sections; every claim opens into Why? → real evidence rows.
 * No scores, no engine words, no fabricated insights. */

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState<"closed" | "why" | "evidence">("closed");
  return (
    <div className="rounded-xl bg-surface-2 px-5 py-4">
      <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
        <T en={insight.title.en} zh={insight.title.zh} />
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        <T en={insight.desc.en} zh={insight.desc.zh} />
      </p>
      <button
        type="button"
        onClick={() => setOpen(open === "closed" ? "why" : "closed")}
        className="press mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-text"
      >
        <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-150 ${open === "closed" ? "" : "rotate-180"}`} />
        <T en="Why?" zh="为什么？" />
      </button>
      {open !== "closed" && (
        <div className="enter mt-2.5">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            <T en={insight.why.en} zh={insight.why.zh} />
          </p>
          {insight.evidence.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(open === "why" ? "evidence" : "why")}
              className="press mt-2 text-[12px] font-medium text-ink-3 hover:text-ink"
            >
              {open === "evidence"
                ? <T en="Hide examples" zh="收起例子" />
                : <T en="See examples" zh="看例子" />}
            </button>
          )}
          {open === "evidence" && (
            <ul className="enter mt-2 space-y-1.5">
              {insight.evidence.map((e, i) => (
                <li key={i} className="rounded-lg bg-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed">
                  <span className="text-ink-3">{new Date(e.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · </span>
                  <span className="font-medium text-ink">“{e.item}”</span>
                  <span className="text-ink-2">
                    {" "}— <T en={e.activity.en} zh={e.activity.zh} /> · <T en={e.result.en} zh={e.result.zh} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function MemoryView({ memory }: { memory: LearningMemory }) {
  if (!memory.enoughEvidence) {
    return (
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-display">
            <T en="Learning Memory" zh="学习记忆" />
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <T en="What we're learning about you." zh="我们正在了解的你。" />
          </p>
        </header>
        <div className="card-specular rounded-card bg-surface p-8 text-center">
          <Brain size={26} strokeWidth={1.5} className="mx-auto text-ink-3" />
          <p className="mt-4 text-[15px] font-semibold text-ink">
            <T en="You're still building your learning profile." zh="你的学习画像还在建立中。" />
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">
            <T
              en="After a few sessions — reading, recalling, using what you learned — real personal patterns will start appearing here."
              zh="完成几次学习——阅读、回忆、用上学过的表达——真实的个人模式就会出现在这里。"
            />
          </p>
        </div>
      </div>
    );
  }

  const nothingAtAll =
    memory.challenges.length === 0 &&
    memory.improvements.length === 0 &&
    memory.patterns.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header>
        <h1 className="text-display">
          <T en="Learning Memory" zh="学习记忆" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T en="What we're learning about you." zh="我们正在了解的你。" />
        </p>
      </header>

      {nothingAtAll && (
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          <T
            en="Nothing has repeated enough yet for a reliable picture. Keep practising — patterns need a little more evidence."
            zh="还没有足够重复的证据形成可靠画像。继续练习——模式还需要多一点证据。"
          />
        </p>
      )}

      {memory.challenges.length > 0 && (
        <section>
          <span className="t-section">
            <T en="What you're working on" zh="你正在攻克什么" />
          </span>
          <div className="mt-3 space-y-2.5">
            {memory.challenges.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </section>
      )}

      {memory.improvements.length > 0 && (
        <section>
          <span className="t-section">
            <T en="You're getting better at" zh="你正在变强的地方" />
          </span>
          <div className="mt-3 space-y-2.5">
            {memory.improvements.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </section>
      )}

      {memory.patterns.length > 0 && (
        <section>
          <span className="t-section">
            <T en="Your learning patterns" zh="你的学习模式" />
          </span>
          <div className="mt-3 space-y-2.5">
            {memory.patterns.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </section>
      )}

      {memory.unstable.length > 0 && (
        <section>
          <span className="t-section">
            <T en="Getting better — but still drops" zh="在变好——但还会掉" />
          </span>
          <div className="mt-3 space-y-2.5">
            {memory.unstable.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </section>
      )}

      {memory.recentlyStrengthened.length > 0 && (
        <section>
          <span className="t-section">
            <T en="Recently strengthened" zh="最近变牢的" />
          </span>
          <ul className="mt-3 space-y-1.5">
            {memory.recentlyStrengthened.map((s) => (
              <li key={s.text} className="flex items-baseline gap-2.5 text-[13.5px]">
                <Check size={13} strokeWidth={2.4} className="mt-1 shrink-0 text-accent-text" />
                <span>
                  <span className="font-medium text-ink">{s.text}</span>
                  <span className="ml-2 text-[12px] text-ink-3">
                    <T en={s.note.en} zh={s.note.zh} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {memory.timeline.length > 0 && (
        <section>
          <span className="t-section">
            <T en="This week" zh="这一周" />
          </span>
          <ul className="mt-3 space-y-1.5">
            {memory.timeline.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[13px] leading-relaxed text-ink-2">
                <Sparkles size={12} strokeWidth={1.8} className="mt-1 shrink-0 text-ink-3" />
                <T en={t.text.en} zh={t.text.zh} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
