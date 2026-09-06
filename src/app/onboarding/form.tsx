"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { onboardAction, quickStartAction } from "@/app/actions";
import {
  grammarWeaknessOptions,
  listeningWeaknessOptions,
  speakingWeaknessOptions,
} from "@/lib/banks";
import { T } from "@/components/i18n";
import { btn, inputCls } from "@/components/ui";

const CEFR_LEVELS = ["A2", "B1", "B2", "C1"] as const;
const BANDS = ["", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btn.primary} w-full py-3 text-sm`}>
      {pending ? "Building your workspace…" : "Start Today's Mission →"}
    </button>
  );
}

function SubmitQuickButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={quickStartAction}
      disabled={pending}
      className={`${btn.primary} shrink-0`}
    >
      {pending ? "Building…" : "⚡ Quick start · 30 秒开始 →"}
    </button>
  );
}

function CheckGrid({ name, options }: { name: string; options: string[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = checked.has(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() =>
              setChecked((prev) => {
                const next = new Set(prev);
                if (next.has(o)) next.delete(o);
                else next.add(o);
                return next;
              })
            }
            className={`press rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
              on ? "bg-[#0071e3] text-white" : "bg-black/[0.04] text-ink-2 hover:bg-black/[0.07]"
            }`}
          >
            {on ? "✓ " : ""}
            {o}
            {on && <input type="hidden" name={name} value={o} />}
          </button>
        );
      })}
    </div>
  );
}

export function OnboardingForm() {
  const [cefr, setCefr] = useState("B1");
  const [immersion, setImmersion] = useState(1);
  const [sent, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => onboardAction(fd))}
      className="stagger space-y-4"
    >
      {/* 30-second path — everything adjustable later in Profile */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_4px_24px_rgba(0,0,0,0.06)]">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.015em] text-ink">In a hurry?</div>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            <T
              en="Start with sensible defaults (B1 · bilingual · 45 min/day) — tune everything later in Profile."
              zh="默认配置直接开始（B1 · 双语 · 每天 45 分钟）——所有设置稍后都可在学习画像中调整。"
            />
          </p>
        </div>
        <SubmitQuickButton />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">Who is learning · 学习者</h2>
          <p className="mt-0.5 text-xs text-ink-3">Your name appears on the workspace only — everything stays local.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Name</span>
            <input name="name" required defaultValue="Learner" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Daily time budget</span>
            <select name="dailyMinutes" defaultValue="45" className={inputCls}>
              {["20", "30", "45", "60", "90"].map((m) => (
                <option key={m} value={m}>
                  {m} minutes / day
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">Baseline · 当前水平</h2>
        <p className="mb-5 text-xs text-ink-3">
          Be honest, not modest — the system schedules difficulty from this. You can retake or update anytime.
        </p>
        <div className="mb-5">
          <span className="mb-2 block text-xs font-medium text-ink-2">CEFR self-estimate</span>
          <div className="inline-flex rounded-xl bg-black/[0.05] p-1">
            {CEFR_LEVELS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCefr(c)}
                className={`press rounded-lg px-5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  cefr === c ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-ink-2 hover:text-ink"
                }`}
                style={{ transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
              >
                {c}
              </button>
            ))}
          </div>
          <input type="hidden" name="cefr" value={cefr} />
        </div>
        <div className="grid grid-cols-5 gap-3">
          {[
            ["ieltsOverall", "Overall"],
            ["ieltsListening", "Listening"],
            ["ieltsReading", "Reading"],
            ["ieltsWriting", "Writing"],
            ["ieltsSpeaking", "Speaking"],
          ].map(([name, label]) => (
            <label key={name} className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</span>
              <select name={name} defaultValue="" className={`${inputCls} px-2 py-2 text-center text-[13px]`}>
                {BANDS.map((b) => (
                  <option key={b || "na"} value={b}>
                    {b || "—"}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">Weak spots · 弱点</h2>
        <p className="mb-4 text-xs text-ink-3">The Mission Planner attacks these first. Pick all that apply.</p>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-2">Grammar</div>
            <CheckGrid name="grammarWeaknesses" options={grammarWeaknessOptions} />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-2">Speaking</div>
            <CheckGrid name="speakingWeaknesses" options={speakingWeaknessOptions} />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-2">Listening</div>
            <CheckGrid name="listeningWeaknesses" options={listeningWeaknessOptions} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">Language · 语言显示</h2>
        <p className="mb-4 text-xs text-ink-3">How much Chinese support the workspace shows. You can switch anytime.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            [1, "中英 · Bilingual", "English + Chinese assistance 英文为主，中文辅助"],
            [4, "沉浸 · Immersion", "English only 纯英文环境，减少母语刺激"],
          ].map(([v, title, desc]) => (
            <button
              type="button"
              key={v as number}
              onClick={() => setImmersion(v as number)}
              className={`press flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${
                immersion === v
                  ? "border-[#0071e3] bg-[#0071e3]/[0.05]"
                  : "border-black/[0.08] hover:bg-black/[0.02]"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  immersion === v ? "border-[#0071e3]" : "border-black/20"
                }`}
              >
                {immersion === v && <span className="h-2 w-2 rounded-full bg-[#0071e3]" />}
              </span>
              <span>
                <span className="block text-[13px] font-medium text-ink">{title as string}</span>
                <span className="block text-[12px] text-ink-3">{desc as string}</span>
              </span>
            </button>
          ))}
        </div>
        <input type="hidden" name="immersionLevel" value={immersion} />
      </div>

      <div className="pb-6">
        <SubmitButton />
        <p className="mt-3 text-center text-[12px] text-ink-3">
          No account, no cloud — your learning data lives in a local SQLite file.
        </p>
      </div>
    </form>
  );
}
