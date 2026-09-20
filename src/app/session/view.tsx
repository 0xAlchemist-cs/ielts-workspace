"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Headphones, Mic, PenLine, RotateCcw, Sparkles } from "lucide-react";
import { T } from "@/components/i18n";
import { btn } from "@/components/ui";
import type { SessionActivity } from "@/server/services/session-plan";

/* ── Session Shell — one activity at a time, transitions, never a checklist ─
 * The learner sees: the current activity → do it in its existing module →
 * come back → [Continue] → next. Completion = existing mission step.
 * V16 hardening: position/total come from the shared session plan (stable
 * denominator — finishing a step no longer shrinks the total), and when the
 * cold-start gate is active the finish button waits for a real saved item. */

const TYPE_ICON: Record<string, typeof BookOpen> = {
  reading: BookOpen, listening: Headphones, notice: Sparkles,
  deep: PenLine, retrieval: RotateCcw, speaking: Mic, transfer: ArrowRight,
};

const TYPE_LABEL: Record<string, { en: string; zh: string }> = {
  reading: { en: "Reading", zh: "阅读" }, listening: { en: "Listening", zh: "听力" },
  notice: { en: "Notice", zh: "注意" }, deep: { en: "Use it", zh: "用一次" },
  retrieval: { en: "Recall", zh: "回忆" }, speaking: { en: "Speaking", zh: "口语" },
  transfer: { en: "Apply", zh: "应用" },
};

export function SessionView({
  activities,
  position,
  totalCount,
  elapsedMinutes,
  totalMinutes,
  blocked,
  onComplete,
}: {
  activities: SessionActivity[];
  position: number;
  totalCount: number;
  elapsedMinutes: number;
  totalMinutes: number;
  blocked: boolean;
  missionId: number;
  onComplete: (step: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<"activity" | "transition" | "complete">(activities.length === 0 ? "complete" : "activity");
  // keep the finished list for the complete screen — after the final refresh the
  // pending list is empty, but the learner should still see what they did
  const [finishedList, setFinishedList] = useState<SessionActivity[]>([]);

  const current = activities[0];
  const next = activities[1];

  // ── Activity screen ─────────────────────────────────────────────────────
  if (phase === "activity" && current) {
    const Icon = TYPE_ICON[current.type] ?? BookOpen;
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center">
        <div className="enter">
          {/* progress — quiet, just direction (stable total from the plan) */}
          <div className="mb-6 flex items-center justify-between text-[12px] text-ink-3">
            <span>
              <T en={`${Math.min(position, totalCount)} of ${totalCount}`} zh={`第 ${Math.min(position, totalCount)} / ${totalCount} 项`} />
            </span>
            <span className="tabular-nums">
              <T en={`${elapsedMinutes}/${totalMinutes} min`} zh={`${elapsedMinutes}/${totalMinutes} 分钟`} />
            </span>
          </div>

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
            <Icon size={22} strokeWidth={1.7} className="text-accent-text" />
          </div>
          <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
            <T en={TYPE_LABEL[current.type]?.en ?? current.type} zh={TYPE_LABEL[current.type]?.zh ?? ""} />
          </p>
          <h2 className="mt-2 text-[24px] font-semibold leading-snug tracking-[-0.02em] text-ink text-pretty">
            <T en={current.title.en} zh={current.title.zh} />
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            <T en={current.desc.en} zh={current.desc.zh} />
          </p>

          {/* V13.2: why this piece, at this level — one quiet meta line */}
          {(current.strength?.en || current.why) && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
              {current.strength?.en && (
                <span className="font-medium text-ink-2">
                  <T en={current.strength.en} zh={current.strength.zh ?? ""} />
                </span>
              )}
              {current.strength?.en && current.why && " · "}
              {current.why && <T en={current.why.en} zh={current.why.zh} />}
            </p>
          )}

          {/* primary: go do the activity in its module */}
          <a
            href={current.href}
            className="btn-apple press mt-8 inline-flex h-12 items-center gap-2 rounded-lg px-6 text-[15px] font-medium text-white"
          >
            <T en={`Start · ${current.minutes} min`} zh={`开始 · ${current.minutes} 分钟`} />
            <ArrowRight size={16} strokeWidth={2} />
          </a>

          <div className="mt-6 flex items-center gap-4">
            {/* come back after doing it — gated at cold start until the action
                is real (a saved item exists), never fabricated evidence */}
            <button
              type="button"
              disabled={pending || blocked}
              onClick={() => {
                setPhase("transition");
              }}
              className="press text-[13px] font-medium text-accent-text disabled:cursor-not-allowed disabled:text-ink-3"
              title={blocked ? "Save one expression first, then come back." : undefined}
            >
              <T en="I've finished this →" zh="我完成了 →" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="press text-[12.5px] text-ink-3 hover:text-ink"
            >
              <T en="Exit session" zh="退出练习" />
            </button>
          </div>
          {blocked && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
              <T
                en="Save one real expression first (the button above takes you there) — then come back and continue."
                zh="先存一个真实表达（上面的按钮会带你去）——回来这里再继续。"
              />
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Transition screen ───────────────────────────────────────────────────
  if (phase === "transition" && current) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center">
        <div className="enter text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/[0.12]">
            <Check size={22} strokeWidth={2.4} className="text-ok-text" />
          </span>
          <p className="mt-4 text-[18px] font-semibold text-ink">
            <T en="Nice." zh="好。" />
          </p>
          {next ? (
            <>
              <p className="mt-2 text-[14px] text-ink-3">
                <T en="Next:" zh="接下来：" />
                <span className="ml-1.5 font-medium text-ink">
                  <T en={next.title.en} zh={next.title.zh} />
                </span>
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await onComplete(current.key);
                    setPhase("activity");
                    router.refresh();
                  })
                }
                className="btn-apple press mt-7 inline-flex h-11 items-center gap-2 rounded-lg px-6 text-[14px] font-medium text-white"
              >
                <T en={pending ? "Saving…" : "Continue"} zh={pending ? "保存中…" : "继续"} />
                {!pending && <ArrowRight size={15} strokeWidth={2} />}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setFinishedList([...(current ? [current] : []), ...activities.slice(1)]);
                  await onComplete(current.key);
                  setPhase("complete");
                  router.refresh();
                })
              }
              className="btn-apple press mt-7 inline-flex h-11 items-center gap-2 rounded-lg px-6 text-[14px] font-medium text-white"
            >
              <T en={pending ? "Saving…" : "Finish session"} zh={pending ? "保存中…" : "完成练习"} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Complete screen ─────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center">
      <div className="enter">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">
          <T en="Today's learning complete." zh="今天的学习完成了。" />
        </h1>
        <div className="mt-5 space-y-1.5">
          {(finishedList.length ? finishedList : activities).map((a, i) => (
            <p key={a.key} className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <Check size={13} strokeWidth={2.4} className="shrink-0 text-accent-text" />
              <T en={a.title.en} zh={a.title.zh} />
              <span className="text-[11px] text-ink-3">{a.minutes} min</span>
            </p>
          ))}
        </div>
        <div className="mt-7 flex items-center gap-3">
          <a href="/" className="btn-apple press inline-flex h-11 items-center gap-2 rounded-lg px-6 text-[14px] font-medium text-white">
            <T en="Back to Today" zh="回到今日" />
            <ArrowRight size={15} strokeWidth={2} />
          </a>
        </div>
      </div>
    </div>
  );
}
