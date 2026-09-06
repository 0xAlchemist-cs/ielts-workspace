"use client";

import { useEffect, useState } from "react";
import { T } from "@/components/i18n";

/** One-time nudge when running on Mock AI — the depth promise needs a real key. */
export function AiNudge({ aiLive }: { aiLive: boolean }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // localStorage is only readable after mount; hydration-safe one-shot read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem("ai-nudge-dismissed")) setHidden(false);
  }, []);

  if (aiLive || hidden) return null;

  return (
    <div className="enter mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#ff9f0a]/[0.1] px-5 py-3.5 shadow-[inset_0_0_0_0.5px_rgba(255,159,10,0.3)]">
      <div className="min-w-0 text-[12.5px] leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">
          <T en="⚡ Running on offline Mock AI" zh="当前为离线 Mock 模式" />
        </span>{" "}
        —{" "}
        <T
          en="sentence analysis, speaking and writing feedback are template-grade right now. Open Settings → AI Provider, paste any OpenAI-compatible endpoint and key (e.g. GLM), and every analysis upgrades instantly — no restart."
          zh="句子分析、口语与写作反馈目前是模板级。打开 设置 → AI 提供商，填入任意 OpenAI 兼容端点和 Key（如智谱 GLM），全站立即升级为真实 AI，无需重启。"
        />
      </div>
      <button
        onClick={() => {
          localStorage.setItem("ai-nudge-dismissed", "1");
          setHidden(true);
        }}
        className="press shrink-0 rounded-lg bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink-2 shadow-[0_0_0_0.5px_rgba(0,0,0,0.1)] hover:text-ink"
      >
        <T en="Got it" zh="知道了" />
      </button>
    </div>
  );
}
