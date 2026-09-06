import Link from "next/link";
import { Fragment } from "react";
import { desc } from "drizzle-orm";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Headphones } from "lucide-react";
import { db } from "@/db";
import { contents as contentsT } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
import { getDashboardStats, getTodayFunnel, getReturningToday, getTomorrowPreview } from "@/server/services/progress";
import { getTrajectory } from "@/server/services/trajectory";
import { T } from "@/components/i18n";
import { LiteToggle } from "./lite-toggle";
import type { MissionPlan } from "@/lib/types";

/* ── Mission Control — a personal learning workspace, not a dashboard ────────
 * Composition: Hero → Today's Mission (the one card) → Review + Continue →
 * Your English → today's quiet ledger. Hierarchy through typography and
 * spacing; exactly one elevated surface and one accent button on the page. */

function greeting() {
  const h = new Date().getHours();
  // 0–4h is late night, NOT morning — midnight must never greet "Good morning"
  if (h >= 5 && h < 12) return { en: "Good morning.", zh: "早上好。" };
  if (h >= 12 && h < 18) return { en: "Good afternoon.", zh: "下午好。" };
  return { en: "Good evening.", zh: "晚上好。" };
}

const humanize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Step = {
  key: string;
  short: { en: string; zh: string };
  desc?: string;
  href: string;
  done: boolean;
  skipped: boolean;
};

/* The learning journey — nodes on a hairline, never a progress bar. */
function Journey({ steps, current }: { steps: Step[]; current: Step }) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const isCurrent = s === current && !s.done;
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <div className={`mt-[11px] h-px min-w-2 flex-1 ${steps[i - 1].done ? "bg-accent/35" : "bg-line"}`} />
            )}
            <Link
              href={s.href}
              title={s.desc ?? s.short.en}
              className="group flex w-[46px] shrink-0 flex-col items-center gap-[7px] sm:w-[64px]"
            >
              <span className="flex h-[22px] items-center justify-center">
                {s.done ? (
                  <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full bg-accent">
                    <Check size={10} strokeWidth={3} className="text-white" />
                  </span>
                ) : s.skipped ? (
                  <span className="h-[7px] w-[7px] rounded-full border border-line-strong" />
                ) : isCurrent ? (
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent shadow-[0_0_0_5px_var(--accent-quiet)]">
                    <span className="h-[7px] w-[7px] rounded-full bg-white" />
                  </span>
                ) : (
                  <span className="h-[7px] w-[7px] rounded-full bg-line-strong transition-colors duration-150 group-hover:bg-ink-3" />
                )}
              </span>
              <span
                className={`whitespace-nowrap text-[12px] sm:text-[12px] ${
                  s.skipped
                    ? "text-ink-3/50 line-through"
                    : isCurrent
                      ? "font-medium text-ink"
                      : s.done
                        ? "text-ink-2"
                        : "text-ink-3"
                }`}
              >
                <T en={s.short.en} zh={s.short.zh} stack />
              </span>
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}

export default async function HomePage() {
  const cu = await requireUser();
  const userId = cu.user.id;
  const mission = await getOrCreateTodayMission(userId);
  const plan = mission.plan as MissionPlan;
  const [stats, funnel, returning, tomorrow, fullProfile] = await Promise.all([
    getDashboardStats(userId, cu.profile.ieltsOverall),
    getTodayFunnel(userId),
    getReturningToday(userId),
    getTomorrowPreview(userId),
    getTrajectory(userId, 30),
  ]);
  const recentContents = await db
    .select({
      id: contentsT.id,
      type: contentsT.type,
      title: contentsT.title,
      topic: contentsT.topic,
      cefr: contentsT.cefr,
      minutes: contentsT.minutes,
    })
    .from(contentsT)
    .orderBy(desc(contentsT.createdAt), desc(contentsT.id))
    .limit(3);

  /* seven-step spine of today's mission — a missing content never links to a
   * dead /read/0 route: it becomes an "add content" trip to the Library. */
  const steps: Step[] = [
    { key: "reading", short: { en: "Read", zh: "阅读" }, desc: plan.reading.title, href: plan.reading.contentId ? `/read/${plan.reading.contentId}` : "/library", done: plan.reading.status === "done", skipped: plan.reading.status === "skipped" },
    { key: "listening", short: { en: "Listen", zh: "听力" }, desc: plan.listening.title, href: plan.listening.contentId ? `/listen/${plan.listening.contentId}` : "/library", done: plan.listening.status === "done", skipped: plan.listening.status === "skipped" },
    { key: "notice", short: { en: "Notice", zh: "注意" }, href: plan.notice.contentId ? `/read/${plan.notice.contentId}` : "/library", done: plan.notice.status === "done", skipped: plan.notice.status === "skipped" },
    { key: "deep", short: { en: "Deep", zh: "深加工" }, href: "/chunks", done: plan.deep.status === "done", skipped: plan.deep.status === "skipped" },
    { key: "retrieval", short: { en: "Retrieve", zh: "提取" }, href: "/review", done: plan.retrieval.status === "done", skipped: plan.retrieval.status === "skipped" },
    { key: "speaking", short: { en: "Speak", zh: "口语" }, href: "/speaking", done: plan.speaking.status === "done", skipped: plan.speaking.status === "skipped" },
    { key: "transfer", short: { en: "Transfer", zh: "迁移" }, href: "/ielts", done: plan.transfer.status === "done", skipped: plan.transfer.status === "skipped" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const activeSteps = steps.filter((s) => !s.skipped);
  const allDone = mission.status === "completed";
  const current = activeSteps.find((s) => !s.done) ?? steps[steps.length - 1];

  const est =
    plan.length === "quick" ? "10–15 min" : plan.length === "standard" ? "25–35 min" : plan.length === "deep" ? "45–60 min" : "25–35 min";

  /* focus & mission title — human words from the priority engine, never its internals */
  const pf = plan.rationale?.primaryFocus;
  const focus = pf
    ? humanize(pf.skill)
    : stats.weakestLink
      ? humanize(stats.weakestLink.area.split(" · ")[0])
      : "Keep showing up";
  const missionTitle = pf
    ? `Build your ${pf.skill}${pf.subSkill ? ` → ${pf.subSkill}` : ""} skill.`
    : "A balanced day of input and retrieval.";
  const why = stats.weakestLink?.detail;
  const urgent = plan.rationale?.urgentItems ?? [];

  const trendMap = new Map(fullProfile.trends.map((t) => [t.key, t]));
  const skills: { key: string; en: string; zh: string; v: number | null }[] = [
    { key: "reading", en: "Reading", zh: "阅读", v: cu.profile.ieltsReading },
    { key: "listening", en: "Listening", zh: "听力", v: cu.profile.ieltsListening },
    { key: "speaking", en: "Speaking", zh: "口语", v: cu.profile.ieltsSpeaking },
    { key: "writing", en: "Writing", zh: "写作", v: cu.profile.ieltsWriting },
  ];

  const g = greeting();
  const overall = cu.profile.ieltsOverall;

  return (
    <div className="space-y-12">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header>
        <p className="t-caption">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {stats.daysStudied > 0 && ` · Day ${stats.daysStudied}`}
        </p>
        <h1 className="t-display mt-2">
          <T en={g.en} zh={g.zh} />
        </h1>
        <p className="t-section mt-7">
          <T en="Today's focus" zh="今日焦点" />
        </p>
        <p className="mt-1.5 text-[26px] font-semibold tracking-[-0.022em] text-ink">{focus}</p>
      </header>

      {/* ── Today's Mission — the one elevated surface ────────────────────── */}
      <section className="card-specular rounded-card bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="t-section">
            <T en="Today's Mission" zh="今日任务" />
          </span>
          <LiteToggle lite={!!plan.lite} />
        </div>

        <h2 className="mt-3 text-[20px] font-semibold leading-snug tracking-[-0.018em] text-ink text-pretty">
          {missionTitle}
        </h2>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {est} · {steps.length} <T en="steps" zh="步" />
        </p>

        {why && (
          <div className="mt-5">
            <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
              <T en="Why today" zh="为什么是今天" />
            </p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">{why}</p>
          </div>
        )}

        <div className="mt-7">
          <Link
            href={allDone ? "/profile#trajectory" : current.href}
            className="btn-apple press inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13.5px] font-medium text-white"
          >
            {allDone ? (
              <T en="Mission complete — see progress" zh="任务完成 — 查看进步" />
            ) : doneCount > 0 ? (
              <T en="Resume mission" zh="继续任务" />
            ) : (
              <T en="Start mission" zh="开始任务" />
            )}
            <ArrowRight size={15} strokeWidth={2} />
          </Link>
        </div>

        <div className="mt-10 pt-2">
          <Journey steps={steps} current={current} />
        </div>

        {(urgent.length > 0 || returning.length > 0 || tomorrow.count > 0) && (
          <p className="mt-6 text-[12px] text-ink-3">
            {urgent.length > 0 && <span>{urgent[0]}</span>}
            {urgent.length > 0 && returning.length > 0 && " · "}
            {returning.length > 0 && (
              <span>
                <T en={`${returning.length} due for review today`} zh={`${returning.length} 项今天到期待复习`} />
              </span>
            )}
            {(urgent.length > 0 || returning.length > 0) && tomorrow.count > 0 && " · "}
            {tomorrow.count > 0 && (
              <span>
                <T en={`${tomorrow.count} tomorrow`} zh={`明日 ${tomorrow.count} 项`} />
              </span>
            )}
          </p>
        )}
      </section>

      {/* ── Review · Continue Learning — no boxes, just hierarchy ─────────── */}
      <section className="grid gap-10 lg:grid-cols-5 lg:gap-12">
        <div className="lg:col-span-2">
          <span className="t-section">
            <T en="Review" zh="复习" />
          </span>
          <p className="mt-3 text-[20px] font-semibold tracking-[-0.015em] text-ink">
            {stats.dueNow === 1 && <T en="1 item due" zh="1 项到期" />}
            {stats.dueNow !== 1 && (stats.dueNow > 1 ? <T en={`${stats.dueNow} items due`} zh={`${stats.dueNow} 项到期`} /> : <T en="Nothing due" zh="暂无到期" />)}
          </p>
          <Link
            href="/review"
            className="press mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text"
          >
            <T en="Start review" zh="开始复习" />
            <ArrowRight size={13} strokeWidth={2} />
          </Link>
          <p className="mt-2 text-[12px] text-ink-3">
            {urgent.length > 0 ? (
              <T
                en={`> ${urgent.length} item${urgent.length > 1 ? "s" : ""} need${urgent.length > 1 ? "" : "s"} attention.`}
                zh={`> ${urgent.length} 项需要关注。`}
              />
            ) : (
              <T en="Retention is healthy." zh="记忆保持良好。" />
            )}
          </p>
        </div>

        <div className="min-w-0 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <span className="t-section">
              <T en="Continue Learning" zh="继续学习" />
            </span>
            <Link href="/library" className="text-[12px] font-medium text-accent-text hover:underline">
              <T en="All content" zh="全部内容" />
            </Link>
          </div>
          {recentContents.length === 0 ? (
            <div className="mt-4 py-6">
              <p className="text-[13px] text-ink-3">
                <T en="No content yet — paste an article to begin." zh="还没有内容 — 粘贴一篇文章开始。" />
              </p>
              <Link href="/library" className="press mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text">
                <T en="Add content" zh="添加内容" />
                <ArrowRight size={13} strokeWidth={2} />
              </Link>
            </div>
          ) : (
            <div className="mt-2">
              {recentContents.map((c) => {
                const isListen = c.type === "listening";
                return (
                  <Link
                    key={c.id}
                    href={isListen ? `/listen/${c.id}` : `/read/${c.id}`}
                    className="group -mx-2.5 flex items-center gap-3 rounded-md px-2.5 py-[11px] transition-colors duration-150 nav-hover"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-3 group-hover:text-ink">
                      {isListen ? <Headphones size={13} strokeWidth={1.7} /> : <BookOpen size={13} strokeWidth={1.7} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">{c.title}</div>
                      <div className="truncate text-[12px] text-ink-3">
                        {c.topic} · {c.cefr} · {c.minutes} min
                      </div>
                    </div>
                    <ArrowUpRight
                      size={14}
                      strokeWidth={1.7}
                      className="shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Your English — quiet bars with live trend ────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between">
          <span className="t-section">
            <T en="Your English" zh="你的英语" />
          </span>
          <span className="text-[12px] text-ink-3">
            <T
              en={`IELTS est. ${overall != null ? overall.toFixed(1) : "—"}`}
              zh={`雅思预估 ${overall != null ? overall.toFixed(1) : "—"}`}
            />
          </span>
        </div>
        <div className="mt-5 space-y-4">
          {skills.map((s) => {
            const t = trendMap.get(s.key);
            return (
              <div key={s.key} className="flex items-center gap-4">
                <span className="w-[92px] shrink-0 text-[13px] text-ink-2">
                  <T en={s.en} zh={s.zh} />
                </span>
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                    style={{ width: `${s.v != null ? (s.v / 9) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[13px] font-medium tabular-nums text-ink">
                  {s.v != null ? s.v.toFixed(1) : "—"}
                </span>
                <span
                  className={`w-4 shrink-0 text-center text-[12px] ${
                    t?.direction === "improving" ? "text-ok-text" : t?.direction === "declining" ? "text-err-text" : "text-ink-3"
                  }`}
                  title={t?.direction ?? undefined}
                >
                  {t?.direction === "improving" ? "↑" : t?.direction === "declining" ? "↓" : "→"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Today's ledger — one honest line ─────────────────────────────── */}
      <p className="t-caption">
        <T
          en={`Today — exposed ${funnel.exposure} · understood ${funnel.understood} · retrieved ${funnel.retrieved} · used ${funnel.used}`}
          zh={`今日 — 接触 ${funnel.exposure} · 理解 ${funnel.understood} · 提取 ${funnel.retrieved} · 使用 ${funnel.used}`}
        />
      </p>
    </div>
  );
}
