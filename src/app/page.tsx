import Link from "next/link";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { ArrowRight, Check } from "lucide-react";
import { db } from "@/db";
import { chunkEvents as chunkEventsT, reviewHistory as reviewHistoryT, vocabularies as vocabT } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";
import { getDashboardStats, getTodayEvidence, getReturningToday } from "@/server/services/progress";
import { getTodaysExpression } from "@/server/services/todays-expression";
import { T } from "@/components/i18n";
import { ExpressionAudio } from "@/components/expression-audio";
import { examConfig } from "@/lib/exam-profiles";
import { LiteToggle } from "./lite-toggle";
import { plural } from "@/lib/plural";
import type { MissionPlan } from "@/lib/types";

/* ── Today — a learning starting point, not a dashboard ────────────────────
 * First screen answers one question: "What should I do now?" Everything that
 * explains the system lives behind /profile (progressive disclosure). A user
 * with no history yet sees a single welcome card instead of a control room. */

function greeting() {
  const h = new Date().getHours();
  // 0–4h is late night, NOT morning — midnight must never greet "Good morning"
  if (h >= 5 && h < 12) return { en: "Good morning.", zh: "早上好。" };
  if (h >= 12 && h < 18) return { en: "Good afternoon.", zh: "下午好。" };
  return { en: "Good evening.", zh: "晚上好。" };
}

export default async function HomePage() {
  const cu = await requireUser();
  const userId = cu.user.id;
  const mission = await getOrCreateTodayMission(userId);
  const plan = mission.plan as MissionPlan;
  const [stats, evidence, returning, expr, histEv, histRh, histVocab] = await Promise.all([
    getDashboardStats(userId, cu.profile.ieltsOverall),
    getTodayEvidence(userId),
    getReturningToday(userId),
    getTodaysExpression(userId),
    db.select({ n: sql<number>`count(*)` }).from(chunkEventsT).where(eq(chunkEventsT.userId, userId)),
    db.select({ n: sql<number>`count(*)` }).from(reviewHistoryT).where(eq(reviewHistoryT.userId, userId)),
    db.select({ n: sql<number>`count(*)` }).from(vocabT).where(eq(vocabT.userId, userId)),
  ]);
  const bilingual = (cu.profile.immersionLevel ?? 1) <= 2;
  // beginner = no learning history AND hasn't seen the tour (tour completion
  // sets the tour_done cookie via completeTourAction)
  const tourDone = (await cookies()).get("tour_done")?.value === "1";
  const isBeginner = !tourDone && histEv[0].n === 0 && histRh[0].n === 0 && histVocab[0].n === 0;
  const g = greeting();

  /* ── Beginner: one card, one button — the loop is taught at /welcome ──── */
  if (isBeginner) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-[560px] flex-col justify-center">
        <header>
          <p className="t-caption">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="t-display mt-2">
            <T en={g.en} zh={g.zh} />
          </h1>
        </header>
        <section className="mt-10 rounded-card bg-surface p-6 sm:p-8">
          <h2 className="text-[24px] font-semibold leading-snug tracking-[-0.02em] text-ink text-pretty">
            <T en="Let's build your English ability." zh="来建立你真正的英语能力。" />
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            <T
              en="A quick tour first — see what each part of this workspace is for. Thirty seconds, no test."
              zh="先快速逛一圈——看看这个工作台的每个部分是干嘛的。三十秒，不做题。"
            />
          </p>
          <Link
            href="/welcome"
            className="btn-apple press mt-6 inline-flex h-11 items-center gap-2 rounded-lg px-6 text-[14px] font-medium text-white"
          >
            <T en="Start the tour" zh="开始导览" />
            <ArrowRight size={15} strokeWidth={2} />
          </Link>
        </section>
      </div>
    );
  }

  /* ── Regular: greeting → today's expression → today's practice ───────── */

  // START target: the first unfinished step of today's plan (never a dead link)
  const stepHrefs: { href: string; done: boolean; skipped: boolean }[] = [
    { href: plan.reading.contentId ? `/read/${plan.reading.contentId}` : "/library", done: plan.reading.status === "done", skipped: plan.reading.status === "skipped" },
    { href: plan.listening.contentId ? `/listen/${plan.listening.contentId}` : "/library", done: plan.listening.status === "done", skipped: plan.listening.status === "skipped" },
    { href: plan.notice.contentId ? `/read/${plan.notice.contentId}` : "/library", done: plan.notice.status === "done", skipped: plan.notice.status === "skipped" },
    { href: "/review", done: plan.retrieval.status === "done", skipped: plan.retrieval.status === "skipped" },
    { href: "/external", done: plan.speaking.status === "done", skipped: plan.speaking.status === "skipped" },
    { href: "/ielts", done: plan.transfer.status === "done", skipped: plan.transfer.status === "skipped" },
  ];
  const allDone = mission.status === "completed";
  const startHref = allDone ? "/profile#trajectory" : (stepHrefs.find((st) => !st.done && !st.skipped)?.href ?? stepHrefs.find((st) => !st.done)?.href ?? "/review");
  const doneCount = stepHrefs.filter((st) => st.done).length;

  const est =
    plan.length === "quick" ? "10–15 min" : plan.length === "standard" ? "25–35 min" : plan.length === "deep" ? "45–60 min" : "25–35 min";

  // the day's action, in learner words — never the engine's skill path
  const dueNow = stats.dueNow;
  const practiceTitle =
    dueNow > 0
      ? { en: `Learn & use ${plural(dueNow, "expression")}`, zh: `学习并使用 ${dueNow} 个表达` }
      : { en: "Read something new", zh: "读点新东西" };

  // ONE why line — recent activity, not engine rationale
  // V10: the planner's data-backed balance line leads; fall back to the
  // generic returning-items line, then the weakest-link detail
  const planWhy = plan.rationale?.planWhy;
  const whyLine = planWhy
    ? { en: planWhy.en, zh: planWhy.zh }
    : returning.length > 0
      ? {
          en: "These need more practice based on your recent activity.",
          zh: "根据你最近的学习情况，这些表达需要再练。",
        }
      : stats.weakestLink?.detail
        ? { en: stats.weakestLink.detail, zh: stats.weakestLink.detail }
        : null;

  // today's quiet progress line — real counts only, hidden on a quiet day
  const progressBits: { en: string; zh: string }[] = [];
  if (evidence.reviewAnswers > 0)
    progressBits.push({
      en: `${evidence.reviewCorrect}/${evidence.reviewAnswers} recalled`,
      zh: `${evidence.reviewCorrect}/${evidence.reviewAnswers} 已回忆`,
    });
  if (evidence.activated > 0 || evidence.usedInOutput > 0)
    progressBits.push({
      en: plural(evidence.activated + evidence.usedInOutput, "used"),
      zh: `用出 ${evidence.activated + evidence.usedInOutput} 个`,
    });

  return (
    <div className="space-y-14">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header>
        <p className="t-caption">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {stats.daysStudied > 0 && ` · Day ${stats.daysStudied}`}
        </p>
        <h1 className="t-display mt-2">
          <T en={g.en} zh={g.zh} />
        </h1>
      </header>

      {/* ── Today's expression — one item from your own memory, met first ── */}
      {expr && (
        <section className="rounded-card bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="t-caption">
              <T en="Today's expression" zh="今日表达" />
            </span>
            {(() => {
              const whyHere: Record<string, { en: string; zh: string }> = {
                overdue: { en: "Time to review", zh: "该复习了" },
                at_risk: { en: "Starting to slip", zh: "开始生疏" },
                retention_check: { en: "Long-term memory check", zh: "长期保持检查" },
                weak_retrieval: { en: "Often forgotten", zh: "经常想不起来" },
                new_item: { en: "New to your memory", zh: "刚进入记忆库" },
                recurring_error: { en: "Recurring mistake", zh: "惯犯错误" },
              };
              const tag = whyHere[expr.category];
              if (!tag) return null;
              return (
                <span className="text-[11px] text-ink-3">
                  <T en={tag.en} zh={tag.zh} />
                </span>
              );
            })()}
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[20px] font-semibold leading-snug tracking-[-0.015em] text-ink text-pretty">
                {expr.title}
              </p>
              {(expr.meaningEn || expr.meaningZh) && (
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                  {expr.meaningEn || expr.meaningZh}
                  {bilingual && expr.meaningZh && expr.meaningZh !== expr.meaningEn && (
                    <span className="ml-2 text-[12px] opacity-[0.72]">{expr.meaningZh}</span>
                  )}
                </p>
              )}
              {expr.example && (
                <p className="mt-2.5 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-3 text-pretty">
                  {expr.example}
                </p>
              )}
            </div>
            <ExpressionAudio text={expr.title} audioUrl={expr.audioUrl} />
          </div>
          <Link
            href="/review"
            className="press mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text"
          >
            <T en="Retrieve it from memory" zh="闭卷回忆它" />
            <ArrowRight size={13} strokeWidth={2} />
          </Link>
        </section>
      )}

      {/* ── Today's practice — THE primary surface ───────────────────────── */}
      <section className="card-specular rounded-card bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="t-section">
            {cu.user.examProfile === "ielts" ? (
              <T en="Today's practice" zh="今日练习" />
            ) : (
              <T
                en={`Today's ${examConfig(cu.user.examProfile).label} practice`}
                zh={`今日 ${examConfig(cu.user.examProfile).zh}练习`}
              />
            )}
          </span>
          <LiteToggle lite={!!plan.lite} />
        </div>

        <h2 className="mt-3 text-[24px] font-semibold leading-snug tracking-[-0.02em] text-ink text-pretty">
          <T en={practiceTitle.en} zh={practiceTitle.zh} />
        </h2>
        {whyLine && (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            <T en={whyLine.en} zh={whyLine.zh} />
          </p>
        )}

        <div className="mt-7">
          <Link
            href={startHref}
            className="btn-apple press inline-flex h-11 items-center gap-2 rounded-lg px-6 text-[14px] font-medium text-white"
          >
            {allDone ? (
              <T en="All done — see your progress" zh="都完成了 — 看看你的进步" />
            ) : doneCount > 0 ? (
              <T en="Resume" zh="继续" />
            ) : (
              <T en="Start" zh="开始" />
            )}
            <ArrowRight size={15} strokeWidth={2} />
          </Link>
          <p className="mt-3 text-[12px] text-ink-3">
            {est}
            {dueNow > 0 && (
              <>
                {" · "}
                <T en={`${plural(dueNow, "item")} from memory`} zh={`凭记忆练 ${dueNow} 项`} />
              </>
            )}
          </p>
        </div>
      </section>

      {/* ── Today's quiet progress line — secondary, real counts ─────────── */}
      {progressBits.length > 0 && (
        <p className="text-[12px] text-ink-3">
          <T en="Today · " zh="今天 · " />
          {progressBits.map((b, i) => (
            <span key={i} className="ml-1 inline-flex items-center gap-1">
              {i > 0 && " · "}
              <Check size={11} strokeWidth={2.4} className="text-accent-text" />
              <T en={b.en} zh={b.zh} />
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
