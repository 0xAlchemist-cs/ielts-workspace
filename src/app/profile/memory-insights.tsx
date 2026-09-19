"use client";

import { useState } from "react";
import { Brain, Check, ChevronDown, Sparkles } from "lucide-react";
import { T } from "@/components/i18n";
import type { Insight, LearningMemory } from "@/server/services/learning-memory";

export type { Insight, LearningMemory };

/* ── Learning Memory insights (V15: merged from the standalone /memory page
 *    into Progress) — "what the system has learned about you", human-first.
 *    Every claim opens into Why? → real evidence rows. No scores, no engine
 *    words, no fabricated insights. The learning-memory service also feeds
 *    the planner — this UI is its visible half. */

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

export function MemoryInsights({ memory }: { memory: LearningMemory }) {
  if (!memory.enoughEvidence) {
    return (
      <section id="memory" className="scroll-mt-20">
        <span className="t-section">
          <T en="Learning memory" zh="学习记忆" />
        </span>
        <div className="card-specular mt-3 rounded-card bg-surface p-6 text-center">
          <Brain size={22} strokeWidth={1.5} className="mx-auto text-ink-3" />
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
            <T
              en="You're still building your learning profile — after a few more sessions, personal patterns will appear here."
              zh="你的学习画像还在建立中——再完成几次学习，个人模式就会出现在这里。"
            />
          </p>
        </div>
      </section>
    );
  }

  const nothingAtAll =
    memory.challenges.length === 0 &&
    memory.improvements.length === 0 &&
    memory.patterns.length === 0;

  return (
    <section id="memory" className="scroll-mt-20">
      <span className="t-section">
        <T en="Learning memory" zh="学习记忆" />
      </span>
      {nothingAtAll && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          <T
            en="Nothing has repeated enough yet for a reliable picture. Keep practising — patterns need a little more evidence."
            zh="还没有足够重复的证据形成可靠画像。继续练习——模式还需要多一点证据。"
          />
        </p>
      )}
      {memory.challenges.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[12.5px] font-semibold text-ink">
            <T en="What you're working on" zh="你正在攻克什么" />
          </p>
          <div className="space-y-2.5">
            {memory.challenges.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </div>
      )}
      {memory.improvements.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold text-ink">
            <T en="You're getting better at" zh="你正在变强的地方" />
          </p>
          <div className="space-y-2.5">
            {memory.improvements.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </div>
      )}
      {memory.patterns.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold text-ink">
            <T en="Your learning patterns" zh="你的学习模式" />
          </p>
          <div className="space-y-2.5">
            {memory.patterns.map((c) => <InsightCard key={c.key} insight={c} />)}
          </div>
        </div>
      )}
      {memory.recentlyStrengthened.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {memory.recentlyStrengthened.map((s) => (
            <li key={s.text} className="flex items-baseline gap-2.5 text-[13px]">
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
      )}
      {memory.timeline.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {memory.timeline.slice(0, 4).map((t, i) => (
            <li key={i} className="flex items-baseline gap-2.5 text-[12.5px] leading-relaxed text-ink-2">
              <Sparkles size={12} strokeWidth={1.8} className="mt-1 shrink-0 text-ink-3" />
              <T en={t.text.en} zh={t.text.zh} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
