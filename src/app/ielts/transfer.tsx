"use client";

import { useState } from "react";
import Link from "next/link";
import { markStepAction } from "@/app/actions";
import { Badge, btn } from "@/components/ui";
import { toast } from "@/components/motion";
import { T } from "@/components/i18n";

export function TodayTransfer({
  cueCard,
  part3,
  chunks,
  stepDone,
}: {
  cueCard: string;
  part3: string[];
  chunks: { id: number; text: string; meaningZh: string }[];
  stepDone: boolean;
}) {
  const [done, setDone] = useState(stepDone);
  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="accent">Today's Transfer · step ⑥</Badge>
        <span className="text-[12px] text-ink-3">Move today's expressions into exam format</span>
      </div>

      <div className="rounded-xl border border-[#0071e3]/20 bg-[#0071e3]/[0.04] px-5 py-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#0068d0]">
          Speaking Part 2 — cue card
        </div>
        <p className="text-[14.5px] leading-relaxed text-ink">{cueCard}</p>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Then push into Part 3
        </div>
        <ul className="space-y-1.5">
          {part3.map((q, i) => (
            <li key={i} className="rounded-lg bg-black/[0.03] px-3.5 py-2 text-[13px] text-ink-2">
              {q}
            </li>
          ))}
        </ul>
      </div>

      {chunks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#34c759]/[0.07] px-4 py-2.5">
          <span className="text-[12px] font-semibold text-[#1e7d34]">Bring these with you:</span>
          {chunks.map((c) => (
            <span
              key={c.id}
              title={c.meaningZh}
              className="rounded-md bg-white px-2 py-0.5 text-[12px] font-semibold text-ink shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]"
            >
              {c.text}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href="/speaking" className={btn.primary}>
          <T en="Practise in Speaking Lab" zh="去口语实验室练习" />
        </Link>
        {!done && (
          <button
            onClick={() => {
              setDone(true);
              markStepAction("transfer");
              toast("Transfer step complete — mission closed 🎯", "success");
            }}
            className={btn.secondary}
          >
            ✓ Done today's transfer
          </button>
        )}
      </div>
    </div>
  );
}
