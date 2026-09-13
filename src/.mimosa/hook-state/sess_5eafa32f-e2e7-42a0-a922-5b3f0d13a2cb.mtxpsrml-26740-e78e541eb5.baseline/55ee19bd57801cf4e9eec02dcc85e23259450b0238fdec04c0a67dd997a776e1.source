"use client";

import { T } from "@/components/i18n";
import type { MissionCounters } from "@/lib/types";

/* ── Evidence funnel — the product's core intellectual property, made visible
 * Exposed → Understood → Retrieved → Used → Retained. Quiet bars, real
 * counts; never a score, never XP. Seeing is not knowing. */

const STAGES: { key: keyof MissionCounters; en: string; zh: string }[] = [
  { key: "exposure", en: "Exposed", zh: "接触" },
  { key: "understood", en: "Understood", zh: "理解" },
  { key: "retrieved", en: "Retrieved", zh: "提取" },
  { key: "used", en: "Used", zh: "使用" },
  { key: "retained", en: "Retained", zh: "保留" },
];

export function EvidenceFunnel({ counters }: { counters: MissionCounters }) {
  const max = Math.max(...STAGES.map((s) => counters[s.key] ?? 0), 1);
  return (
    <div>
      <p className="t-section mb-3">
        <T en="Today's evidence" zh="今日证据" />
      </p>
      <div className="flex items-end gap-2 sm:gap-3">
        {STAGES.map((s, i) => {
          const n = counters[s.key] ?? 0;
          return (
            <div key={s.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className={`text-[15px] font-semibold tabular-nums ${n > 0 ? "text-ink" : "text-ink-3"}`}>{n}</span>
              <div className="flex h-16 w-full max-w-[72px] items-end overflow-hidden rounded-md bg-surface-2">
                <div
                  className={`w-full rounded-md transition-[height] duration-500 ease-out ${i <= 1 ? "bg-accent/35" : "bg-accent"}`}
                  style={{ height: `${Math.max((n / max) * 100, n > 0 ? 8 : 0)}%` }}
                />
              </div>
              <span className="truncate text-[11.5px] text-ink-3">
                <T en={s.en} zh={s.zh} />
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        <T
          en="Seeing is not knowing — a number only moves down when you produce English from memory."
          zh="见过 ≠ 会用——只有凭记忆产出英语，数字才会往下走。"
        />
      </p>
    </div>
  );
}
