"use client";

import { useTransition } from "react";
import { Zap } from "lucide-react";
import { toggleLiteAction } from "@/app/actions";
import { T } from "@/components/i18n";

/** Toggle today's mission between the 3-step lite core and the full 7 steps. */
export function LiteToggle({ lite }: { lite: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => toggleLiteAction())}
      title={lite ? "切回完整七步任务" : "忙碌日：只做 阅读+注意 → 提取 → 口语 三步核心"}
      className={`press inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 ${
        lite ? "bg-warn/15 text-warn-text" : "bg-surface-2 text-ink-3 hover:text-ink"
      }`}
    >
      <Zap size={12} strokeWidth={2} />
      <T en={lite ? "Lite · switch to full" : "Lite mode"} zh={lite ? "精简中 · 切换完整" : "精简模式"} />
      {pending && "…"}
    </button>
  );
}
