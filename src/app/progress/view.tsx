"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Check, Headphones, PenLine, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { T, useBilingual } from "@/components/i18n";
import type { LearningStory, StoryEvent } from "@/server/services/learning-story";

/* ── Progress — a story, not a BI report. Four quiet sections; every claim
 *    is a real event or a threshold-enforced memory fact. Links to /profile
 *    for long-term patterns; /review for what happens next. */

const MODULE_ICON: Record<StoryEvent["module"], typeof BookOpen> = {
  reading: BookOpen, listening: Headphones, review: RotateCcw,
  practice: Sparkles, writing: PenLine, exam: TrendingUp,
};

const CATEGORY_QUIET: Record<string, { en: string; zh: string }> = {
  overdue: { en: "due", zh: "到期" },
  weak_retrieval: { en: "weak", zh: "薄弱" },
  recurring_error: { en: "error", zh: "错题" },
  retention_check: { en: "check", zh: "检验" },
  at_risk: { en: "slipping", zh: "生疏" },
  new_item: { en: "new", zh: "新学" },
};

export function ProgressView({ story }: { story: LearningStory }) {
  const bilingual = useBilingual();
  const fmt = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-9">
      <header>
        <h1 className="text-display">
          <T en="Progress" zh="进步" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T
            en="What happened lately, what is strengthening, and what comes next."
            zh="最近发生了什么、什么正在变牢、接下来是什么。"
          />
        </p>
      </header>

      {/* ── 1 · 最近学习 ──────────────────────────────────────────────── */}
      <section>
        <span className="t-section">
          <T en="Recent learning" zh="最近学习" />
        </span>
        {story.recent.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            <T
              en="Nothing recorded yet — your reading, practice and review will show up here."
              zh="还没有记录——你读的、练的、复习的都会出现在这里。"
            />
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {story.recent.map((e, i) => {
              const Icon = MODULE_ICON[e.module];
              return (
                <li key={i} className="flex items-baseline gap-3 py-2.5">
                  <Icon size={14} strokeWidth={1.8} className="mt-1 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-ink">
                      <T en={e.en} zh={e.zh} />
                      {e.item && <span className="ml-1.5 font-medium text-ink">· {e.item}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">{fmt(e.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 2 · 正在变强 ──────────────────────────────────────────────── */}
      <section>
        <span className="t-section">
          <T en="Getting stronger" zh="正在变强" />
        </span>
        {story.strengthening.facts.length === 0 && story.strengthening.improvements.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            <T
              en="Nothing has repeated enough yet to call it strengthening — keep practising and real patterns will appear."
              zh="还没有足够的重复证据称为变强——继续练习，真实的模式会出现。"
            />
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {story.strengthening.facts.map((f) => (
              <p key={f.text} className="flex items-baseline gap-2.5 text-[13.5px]">
                <Check size={13} strokeWidth={2.4} className="mt-1 shrink-0 text-accent-text" />
                <span>
                  <span className="font-medium text-ink">{f.text}</span>
                  <span className="ml-2 text-[12px] text-ink-3">
                    <T en={f.note.en} zh={f.note.zh} />
                  </span>
                </span>
              </p>
            ))}
            {story.strengthening.improvements.map((imp) => (
              <p key={imp.key} className="text-[13.5px] leading-relaxed text-ink-2">
                <T en={imp.desc.en} zh={imp.desc.zh} />
              </p>
            ))}
          </div>
        )}
        <p className="mt-3 text-[12px] text-ink-3">
          <T en="Long-term patterns live in " zh="长期模式在" />
          <Link href="/profile" className="press font-medium text-accent-text">
            <T en="your profile" zh="学习画像" />
          </Link>
          <T en="." zh="。" />
        </p>
      </section>

      {/* ── 3 · 还在反复出现的问题 ────────────────────────────────────── */}
      {story.problems.length > 0 && (
        <section>
          <span className="t-section">
            <T en="Still coming back" zh="还在反复出现" />
          </span>
          <div className="mt-3 space-y-2">
            {story.problems.map((p) => (
              <div key={p.errorId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-3">
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <span className="text-ink-3 line-through">{p.wrongForm}</span>
                  <span className="mx-1.5 text-ink-3">→</span>
                  <span className="font-medium text-ink">{p.correctForm}</span>
                  <span className="ml-2 text-[11.5px] text-ink-3">
                    {bilingual ? `出现 ${p.occurrenceCount} 次` : `seen ${p.occurrenceCount}×`}
                    {p.lastPractice && (
                      <>
                        {" · "}
                        <T
                          en={`last practice: ${p.lastPractice.result}`}
                          zh={`上次练习：${p.lastPractice.result === "correct" ? "通过" : p.lastPractice.result === "partial" ? "接近" : "未过"}`}
                        />
                      </>
                    )}
                    {p.queued && <span className="ml-1 text-accent-text">· <T en="in review queue" zh="已进复习队列" /></span>}
                  </span>
                </span>
                <Link
                  href={`/practice/${p.errorId}`}
                  className="press inline-flex items-center gap-1 rounded-lg bg-accent/[0.1] px-2.5 py-1 text-[12px] font-medium text-accent-text"
                >
                  <RotateCcw size={12} />
                  <T en="Practice this mistake" zh="重新练习" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 4 · 接下来 ───────────────────────────────────────────────── */}
      <section>
        <span className="t-section">
          <T en="What's next" zh="接下来" />
        </span>
        {story.next.count === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            <T
              en="Nothing is due right now. New learning won't be crowded out by review backlog."
              zh="当前没有到期项。新的学习不会被复习积压挤掉。"
            />
          </p>
        ) : (
          <div className="card-specular mt-3 rounded-2xl bg-surface p-5">
            <p className="text-[15px] font-semibold text-ink">
              <T
                en={`${story.next.count} items to review · ~${story.next.estMinutes} min`}
                zh={`${story.next.count} 项复习 · 约 ${story.next.estMinutes} 分钟`}
              />
            </p>
            {Object.keys(story.next.composition).length > 0 && (
              <p className="mt-1.5 text-[12.5px] text-ink-3">
                {Object.entries(story.next.composition)
                  .map(([k, n]) => `${n} ${CATEGORY_QUIET[k]?.[bilingual ? "zh" : "en"] ?? k}`)
                  .join(" · ")}
              </p>
            )}
            <Link
              href="/review"
              className="btn-apple press mt-4 inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-medium text-white"
            >
              <T en="Start review" zh="开始复习" />
              <ArrowRight size={15} strokeWidth={2} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
