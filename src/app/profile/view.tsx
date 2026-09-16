"use client";

import { useEffect, useState } from "react";
import { updateProfileAction } from "@/app/actions";
import {
  grammarWeaknessOptions,
  listeningWeaknessOptions,
  speakingWeaknessOptions,
} from "@/lib/banks";
import { Badge, Card, ProgressBar, Sparkline, Stat, btn, inputCls } from "@/components/ui";
import { EvidenceFunnel } from "@/components/funnel";
import { toast } from "@/components/motion";
import { T, useBilingual } from "@/components/i18n";
import { plural } from "@/lib/plural";
import type { CEFR, MissionCounters } from "@/lib/types";
import type { FullLearningProfile, ErrorPattern } from "@/server/services/learning-profile";
import type { SkillTrend, Bottleneck, WeeklyReview } from "@/lib/types";

interface TrajectoryData {
  trends: SkillTrend[];
  bottleneck: Bottleneck | null;
  plateau: { skill: string; detail: string }[];
  acceleration: { skill: string; detail: string }[];
  snapshotCount: number;
}

interface EfficiencyData {
  eventsPerHour: number;
  retrievalPerHour: number;
  transferPerHour: number;
  errorResolutionRate: number;
  rating: string;
  detail: string;
}

const MISS_ZH: Record<string, string> = {
  unknown: "生词", known_not_recognized: "认识但听不出", connected_speech: "连读",
  weak_form: "弱读", reduction: "缩读", speed: "语速", attention: "走神", meaning_integration: "句意整合",
};

interface ProfileData {
  ieltsOverall: number | null;
  ieltsListening: number | null;
  ieltsReading: number | null;
  ieltsWriting: number | null;
  ieltsSpeaking: number | null;
  cefr: CEFR;
  immersionLevel: number;
  dailyMinutes: number;
  grammarWeaknesses: string[];
  speakingWeaknesses: string[];
  listeningWeaknesses: string[];
}

const fmtScore = (n: number) => (n === 0 ? "—" : String(n));

export function ProfileView({
  profile,
  fullProfile,
  trajectory,
  efficiency,
  weeklyReview,
  stats,
  funnel,
  evidence,
}: {
  profile: ProfileData;
  fullProfile: FullLearningProfile;
  trajectory: TrajectoryData;
  efficiency: EfficiencyData;
  weeklyReview: WeeklyReview | null;
  stats: {
    activeVocabulary: number;
    passiveVocabulary: number;
    activeChunks: number;
    retrievalAccuracy: number;
    averageStrength: number;
    daysStudied: number;
    dueNow: number;
    totalItems: number;
    todayFunnel: MissionCounters;
    vocabStatusCounts: { passive: number; active: number };
    chunkCount: number;
    trend: { days: string[]; produced: number[]; accuracy: number[] };
    listening: { profile: Record<string, string>; misses: Record<string, number> };
  };
  funnel: MissionCounters;
  evidence: {
    activated: number;
    usedInOutput: number;
    reviewAnswers: number;
    reviewCorrect: number;
    savedExpressions: number;
    wordsAdded: number;
    errorsCaptured: number;
  };
}) {
  const bilingual = useBilingual();
  const [immersion, setImmersion] = useState(profile.immersionLevel);
  const [grammar, setGrammar] = useState(new Set(profile.grammarWeaknesses));
  const [speakingW, setSpeakingW] = useState(new Set(profile.speakingWeaknesses));
  const [listeningW, setListeningW] = useState(new Set(profile.listeningWeaknesses));
  const [saved, setSaved] = useState(false);
  const [drillDown, setDrillDown] = useState<string | null>(null);
  // numbers disclosure — statements & focus stay visible; charts/metrics open
  // only when asked (persisted, so a data-curious learner never re-opens twice)
  const [showNumbers, setShowNumbers] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("pf-numbers") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted disclosure state once
      setShowNumbers(true);
    }
  }, []);
  const toggleNumbers = () => {
    setShowNumbers((v) => {
      try {
        localStorage.setItem("pf-numbers", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  // Sidebar "Progress" lands on /profile#trajectory — Next doesn't reliably
  // scroll to the anchor on cross-page navigation, so do it once on mount.
  useEffect(() => {
    if (window.location.hash === "#trajectory") {
      document.getElementById("trajectory")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const fmtScore = (n: number) => n === 0 ? "—" : n;

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-display">
              <T en="Your progress" zh="你的进步" />
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-2">
              <T
                en="Every number traces to real learning events. Click any dimension to see the evidence."
                zh="每一个数字都可追溯到真实学习事件。点击任何维度查看证据。"
              />
            </p>
          </div>
          <a href="/api/export" className={btn.secondary} download>
            <T en="Export my data (JSON)" zh="导出学习数据" />
          </a>
          <button type="button" onClick={toggleNumbers} className={`${btn.ghost} ml-2`}>
            <T en={showNumbers ? "Fewer numbers" : "Show the numbers"} zh={showNumbers ? "收起数字" : "显示数字"} />
          </button>
        </div>
      </header>

      {/* Today — the evidence layer that used to live on the homepage:
       * real counts from real events, plus the honest funnel. (inside the
       * numbers disclosure: statements + focus stay above it) */}
      {showNumbers && (() => {
        const lines: { en: string; zh: string }[] = [];
        if (evidence.activated > 0)
          lines.push({ en: `Activated ${plural(evidence.activated, "expression")} — passive → active`, zh: `激活 ${evidence.activated} 个表达 — 被动 → 主动` });
        if (evidence.usedInOutput > 0)
          lines.push({ en: `Produced ${plural(evidence.usedInOutput, "expression")} in real output`, zh: `在口语/写作中真实用出 ${evidence.usedInOutput} 个表达` });
        if (evidence.reviewAnswers > 0)
          lines.push({ en: `${plural(evidence.reviewAnswers, "recall")} answered · ${evidence.reviewCorrect} correct`, zh: `完成 ${evidence.reviewAnswers} 次回忆练习 · 答对 ${evidence.reviewCorrect} 次` });
        if (evidence.savedExpressions > 0)
          lines.push({ en: `Saved ${plural(evidence.savedExpressions, "new expression")} while reading`, zh: `阅读时存入 ${evidence.savedExpressions} 个新表达` });
        if (evidence.wordsAdded > 0)
          lines.push({ en: `Added ${plural(evidence.wordsAdded, "word")} to your bank`, zh: `收录 ${evidence.wordsAdded} 个生词` });
        if (evidence.errorsCaptured > 0)
          lines.push({ en: `Captured ${plural(evidence.errorsCaptured, "error")} to conquer`, zh: `记下 ${evidence.errorsCaptured} 个待改错误` });
        if (lines.length === 0) return null;
        return (
          <div className="mb-6">
            <p className="t-section">
              <T en="What changed today" zh="今天你拿下了什么" />
            </p>
            <ul className="mt-3 space-y-1.5">
              {lines.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                  <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
                  <T en={l.en} zh={l.zh} />
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <EvidenceFunnel counters={funnel} />
            </div>
          </div>
        );
      })()}

      {/* Who am I as a learner — meaningful statements first, numbers only as
       * supporting evidence (spec: prefer sentences over percentages) */}
      {(() => {
        const named: [string, number | null, { en: string; zh: string }][] = [
          ["listening", profile.ieltsListening, { en: "Listening", zh: "听力" }],
          ["reading", profile.ieltsReading, { en: "Reading", zh: "阅读" }],
          ["writing", profile.ieltsWriting, { en: "Writing", zh: "写作" }],
          ["speaking", profile.ieltsSpeaking, { en: "Speaking", zh: "口语" }],
        ];
        const scored = named.filter(([, v]) => typeof v === "number" && v > 0) as [string, number, { en: string; zh: string }][];
        const stmts: { en: string; zh: string }[] = [];
        if (scored.length >= 2) {
          scored.sort((a, b) => b[1] - a[1]);
          const top = scored[0];
          const low = scored[scored.length - 1];
          const gap = top[1] - low[1];
          if (gap >= 0.5) {
            stmts.push({
              en: `Your ${top[2].en.toLowerCase()} leads at ${top[1].toFixed(1)}, while ${low[2].en.toLowerCase()} trails at ${low[1].toFixed(1)} — that ${gap.toFixed(1)}-band gap is where the fastest points hide.`,
              zh: `你的${top[2].zh}最强（${top[1].toFixed(1)}），${low[2].zh}最弱（${low[1].toFixed(1)}）——这 ${gap.toFixed(1)} 分的差距是最快涨分的地方。`,
            });
          } else {
            stmts.push({
              en: `Your four skills are balanced around ${top[1].toFixed(1)} — improvement now comes from depth (retrieval & production), not another skill.`,
              zh: `你的四科水平接近（约 ${top[1].toFixed(1)}）——现在提升靠深度（提取与产出），而不是再换一科。`,
            });
          }
        }
        // the raw weakest-link evidence ("1 word in personal vocabulary")
        // reads like engine output — the actionable version already lives in
        // the "What to focus on" card below, so it is not repeated here
        if (!stmts.length) return null;
        return (
          <div className="mb-6 rounded-2xl bg-surface px-6 py-5">
            <p className="t-section">
              <T en="Who you are as a learner" zh="你是怎样的学习者" />
            </p>
            <ul className="mt-2.5 space-y-2">
              {stmts.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed text-ink">
                  <span className="mt-[8px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
                  <T en={s.en} zh={s.zh} />
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Weakest Link — the single most actionable insight (hidden until
       * verified numeric evidence exists; null = not enough evidence yet) */}
      {(fullProfile.weakestLink.score ?? 0) > 0 && (
        <div className="mb-6 rounded-2xl bg-[#ff3b30]/[0.05] px-6 py-4 shadow-[0_0_0_0.5px_rgba(255,59,48,0.15)]">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#d70015]">
            <T en="What to focus on · today's practice targets this" zh="今日焦点 · 今日练习针对此安排" />
          </div>
          <p className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-ink">
            {fullProfile.weakestLink.skill} → {fullProfile.weakestLink.subSkill}
            <span className="ml-3 font-mono text-[14px] text-[#d70015]">{fullProfile.weakestLink.score}</span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">↳ {fullProfile.weakestLink.evidence}</p>
        </div>
      )}

      {/* Overall metrics — first block of the numbers disclosure */}
      {showNumbers && (
        <>
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active Vocab" labelZh="主动词汇" value={stats.activeVocabulary} tone="accent" sub={`+${stats.passiveVocabulary} passive`} />
        <Stat label="Active Chunks" labelZh="主动语块" value={stats.activeChunks} sub={bilingual ? `强度 ${stats.averageStrength}` : `avg strength ${stats.averageStrength}`} />
        <Stat label="Retrieval Acc" labelZh="提取正确率" value={`${stats.retrievalAccuracy}%`} sub="near 30 days" />
        <Stat label="Due now" labelZh="待复习" value={stats.dueNow} sub={`${stats.totalItems} tracked`} />
        <Stat label="Total Events" labelZh="学习事件" value={fullProfile.totalEvents} sub="all modules" />
      </div>

      {/* Four skills with drill-down */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <SkillCard title="Listening" zh="听力" dimensions={fullProfile.listening} onDrill={setDrillDown} drillKey={drillDown} />
        <SkillCard title="Reading" zh="阅读" dimensions={fullProfile.reading} onDrill={setDrillDown} drillKey={drillDown} />
        <SkillCard title="Speaking" zh="口语" dimensions={fullProfile.speaking} onDrill={setDrillDown} drillKey={drillDown} />
        <SkillCard title="Writing" zh="写作" dimensions={fullProfile.writing} onDrill={setDrillDown} drillKey={drillDown} />
      </div>

      {/* Error Patterns */}
      {fullProfile.errorPatterns.length > 0 && (
        <Card
          title={<T en="Mistakes that keep coming back" zh="反复出现的错误" />}
          subtitle={<T en="When the same slip shows up across your writing and speaking, it lands here" zh="同一个错误在写作和口语中反复出现时，会归到这里" />}
          className="mb-6"
        >
          <div className="space-y-2.5">
            {fullProfile.errorPatterns.map((p) => (
              <div key={p.key} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-black/[0.03] px-4 py-3">
                <Badge tone={p.severity === "high" ? "danger" : p.severity === "medium" ? "warn" : "neutral"}>
                  {p.severity.toUpperCase()}
                </Badge>
                <span className="text-[13.5px] font-semibold text-ink">{p.label}</span>
                <span className="font-mono text-[12px] text-ink-3">×{p.occurrences} · {p.category}</span>
                <span className="ml-auto text-[12px] text-ink-3">
                  {p.examples.length > 0 && `${p.examples[0].wrong} → ${p.examples[0].correct}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 14-day trend */}
      <Card title={<T en="Last 14 days · the compounding" zh="近 14 天 · 复利曲线" />} className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-4 py-3">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3"><T en="Retrieved / day" zh="每日提取" /></div>
              <div className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-ink">{stats.trend.produced[13] ?? 0}</div>
            </div>
            <Sparkline values={stats.trend.produced} color="#0071e3" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-4 py-3">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3"><T en="Accuracy %" zh="正确率" /></div>
              <div className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-ink">{stats.trend.accuracy[13] ?? 0}%</div>
            </div>
            <Sparkline values={stats.trend.accuracy} color="#34c759" />
          </div>
        </div>
        <p className="mt-3 text-[12px] text-ink-3">{stats.trend.days[0]} → {stats.trend.days[13]}</p>
      </Card>

      {/* Listening misses breakdown */}
      {Object.keys(stats.listening.misses).length > 0 && (
        <Card title={<T en="Why you miss things when listening" zh="听力漏听原因" />} className="mb-6">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.listening.misses).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
              <Badge key={cat} tone={cat === "known_not_recognized" ? "warn" : "neutral"}>
                {MISS_ZH[cat] ?? cat} ×{n as number}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Learning Trajectory — sidebar "Progress" anchor */}
      <div id="trajectory" className="scroll-mt-20">
      <Card title={<T en="Learning Trajectory" zh="学习轨迹" />} subtitle={<T en="30-day trends with evidence-based attribution" zh="30 天趋势与证据归因" />} className="mb-6">
        {trajectory.trends.length > 0 ? (
          <div className="space-y-3">
            {trajectory.trends.map((t) => (
              <div key={t.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[12px] font-medium text-ink-2">{t.label}</span>
                <span className="w-10 text-right font-mono text-[13px] font-semibold text-ink">{t.current || "—"}</span>
                <span className={`w-16 text-right font-mono text-[12px] ${
                  t.trend30 > 0 ? "text-[#1f7a37]" : t.trend30 < 0 ? "text-[#d70015]" : "text-ink-3"
                }`}>
                  {t.trend30 > 0 ? "+" : ""}{t.trend30}/30d
                </span>
                <Badge tone={t.direction === "improving" ? "success" : t.direction === "declining" ? "danger" : t.direction === "plateau" ? "warn" : "neutral"}>
                  {t.direction === "improving" ? "↗ improving" : t.direction === "declining" ? "↘ declining" : t.direction === "plateau" ? "→ plateau" : "— data"}
                </Badge>
              </div>
            ))}
            {trajectory.trends[0]?.attribution?.map((a, i) => (
              <p key={i} className="text-[12px] leading-relaxed text-ink-3">▸ {a}</p>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">
            <T en="Trajectory data appears after 2+ days of learning. Each daily visit creates a snapshot." zh="轨迹数据需要 2 天以上学习。每天访问自动创建快照。" />
          </p>
        )}
        {trajectory.plateau.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-[#ff9f0a]/[0.08] px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase text-[#9a6200]">Plateau Detected · 检测到平台期</div>
            {trajectory.plateau.map((p, i) => (
              <p key={i} className="text-[12px] text-ink-2">⚠ {p.detail}</p>
            ))}
          </div>
        )}
        {trajectory.acceleration.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-[#34c759]/[0.08] px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase text-[#1f7a37]">Rapid Improvement · 快速提升</div>
            {trajectory.acceleration.map((a, i) => (
              <p key={i} className="text-[12px] text-ink-2">🚀 {a.detail}</p>
            ))}
          </div>
        )}
      </Card>
      </div>

      {/* Learning Efficiency */}
      <Card title={<T en="Learning efficiency" zh="学习效率" />} subtitle={<T en="Meaningful events per study hour — not time spent" zh="每小时有效学习事件——不是学习时长" />} className="mb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-center">
            <div className="font-mono text-[18px] font-semibold text-ink">{efficiency.eventsPerHour}</div>
            <div className="text-[10.5px] font-medium text-ink-3">Events/hr</div>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-center">
            <div className="font-mono text-[18px] font-semibold text-ink">{efficiency.retrievalPerHour}</div>
            <div className="text-[10.5px] font-medium text-ink-3">Retrievals/hr</div>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-center">
            <div className="font-mono text-[18px] font-semibold text-ink">{efficiency.transferPerHour}</div>
            <div className="text-[10.5px] font-medium text-ink-3">Transfers/hr</div>
          </div>
          <div className={`rounded-xl px-4 py-3 text-center ${
            efficiency.rating === "high" ? "bg-[#34c759]/[0.1]" : efficiency.rating === "medium" ? "bg-[#ff9f0a]/[0.08]" : "bg-black/[0.03]"
          }`}>
            <div className={`font-mono text-[18px] font-semibold capitalize ${
              efficiency.rating === "high" ? "text-[#1f7a37]" : efficiency.rating === "medium" ? "text-[#9a6200]" : "text-ink"
            }`}>{efficiency.rating}</div>
            <div className="text-[10.5px] font-medium text-ink-3">Rating</div>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{efficiency.detail}</p>
      </Card>

      {/* Weekly Review */}
      {weeklyReview && (
        <Card title={<T en="Weekly review" zh="每周回顾" />} subtitle={`Week of ${weeklyReview.weekOf}`} className="mb-6">
          <div className="space-y-4">
            {weeklyReview.improved.length > 0 && (
              <div>
                <div className="text-[10.5px] font-semibold uppercase text-[#1f7a37]">What improved · 进步了什么</div>
                {weeklyReview.improved.map((imp, i) => (
                  <p key={i} className="mt-1 text-[12.5px] text-ink-2">↗ {imp.skill} +{imp.delta} — {imp.reason}</p>
                ))}
              </div>
            )}
            {weeklyReview.stillWeak.length > 0 && (
              <div>
                <div className="text-[10.5px] font-semibold uppercase text-[#9a6200]">Still weak · 仍然薄弱</div>
                {weeklyReview.stillWeak.map((w, i) => (
                  <p key={i} className="mt-1 text-[12.5px] text-ink-2">○ {w.skill} ({w.score}) — {w.reason}</p>
                ))}
              </div>
            )}
            <div>
              <div className="text-[10.5px] font-semibold uppercase text-ink-3">Next week priority · 下周优先</div>
              <p className="mt-1 text-[13px] font-medium text-ink">{weeklyReview.nextPriority}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Phone access */}
      <Card title={<T en="Phone (same WiFi)" zh="手机访问（同一 WiFi）" />} className="mb-6">
        <code className="block overflow-x-auto rounded-lg bg-black/[0.05] px-3.5 py-2.5 font-mono text-[12px] text-ink">
          npm run start -- -H 0.0.0.0
        </code>
      </Card>
        </>
      )}

      {/* Edit profile form */}
      <form
        action={async (fd) => {
          await updateProfileAction(fd);
          setSaved(true);
          toast("Profile updated", "success");
        }}
        className="stagger space-y-4 pb-10"
      >
        <Card title={<T en="Baseline scores" zh="基线分数" />}>
          <div className="grid grid-cols-5 gap-3">
            {[
              ["ieltsOverall", "Overall", profile.ieltsOverall],
              ["ieltsListening", "Listening", profile.ieltsListening],
              ["ieltsReading", "Reading", profile.ieltsReading],
              ["ieltsWriting", "Writing", profile.ieltsWriting],
              ["ieltsSpeaking", "Speaking", profile.ieltsSpeaking],
            ].map(([name, label, val]) => (
              <label key={name as string} className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{label as string}</span>
                <select name={name as string} defaultValue={String(val ?? "")} className={`${inputCls} px-2 py-2 text-center text-[13px]`}>
                  {["", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9"].map((b) => (
                    <option key={b || "na"} value={b}>{b || "—"}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            {/* V9: CEFR is configured in Settings, not here — keep the form
             * field (the action expects it) but render it read-only */}
            <div>
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">
                <T en="Learning level" zh="学习水平" />
              </span>
              <span className="text-[13.5px] font-semibold text-ink">{profile.cefr}</span>
              <span className="ml-2 text-[11.5px] text-ink-3">
                <T en="· change it in Settings" zh="· 在设置中修改" />
              </span>
              <input type="hidden" name="cefr" value={profile.cefr} />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Daily minutes</span>
              <select name="dailyMinutes" defaultValue={String(profile.dailyMinutes)} className={`${inputCls} w-36`}>
                {["20", "30", "45", "60", "90"].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
          </div>
        </Card>
        <Card title={<T en="Language display" zh="语言显示" />}>
          <div className="grid gap-2 sm:grid-cols-2">
            {[[1, "中英 · Bilingual", "English + Chinese assistance"], [4, "沉浸 · Immersion", "English only"]].map(([v, title, desc]) => (
              <button type="button" key={v as number} onClick={() => setImmersion(v as number)}
                className={`press flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-[13px] font-medium transition-colors duration-150 ${
                  (immersion <= 2 ? 1 : 4) === v ? "border-accent bg-accent/[0.05] text-ink" : "border-line text-ink-2 nav-hover"
                }`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${immersion <= 2 === (v === 1) ? "border-accent" : "border-line-strong"}`}>
                  {immersion <= 2 === (v === 1) && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span>
                  <span className="block">{title as string}</span>
                  <span className="block text-[12px] font-normal text-ink-3">{desc as string}</span>
                </span>
              </button>
            ))}
          </div>
          <input type="hidden" name="immersionLevel" value={immersion <= 2 ? 1 : 4} />
        </Card>
        <div>
          <button type="submit" className={btn.primary}><T en="Save profile" zh="保存画像" /></button>
          {saved && <span className="ml-3 text-[12px] text-ok-text"><T en="Saved" zh="已保存" /></span>}
        </div>
      </form>

      <ProgressBar value={stats.averageStrength} label="Average chunk retrieval strength (all time)" />
    </div>
  );
}

/* ── Skill card with drill-down evidence ─────────────────────────────────── */

function SkillCard({
  title,
  zh,
  dimensions,
  onDrill,
  drillKey,
}: {
  title: string;
  zh: string;
  dimensions: { key: string; label: string; score: number | null; evidence: string }[];
  onDrill: (key: string | null) => void;
  drillKey: string | null;
}) {
  const bilingual = useBilingual();
  // Average only verified dimensions; unverified (null) ones never drag the
  // number down or fake it upward — no numeric evidence shows as "—".
  const numeric = dimensions.filter((d): d is { key: string; label: string; score: number; evidence: string } => typeof d.score === "number");
  const avg = numeric.length
    ? Math.round(numeric.reduce((a, d) => a + d.score, 0) / numeric.length)
    : null;

  return (
    <div className="card-specular rounded-2xl bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
          {title} {bilingual && <span className="ml-1 text-[12px] font-normal text-ink-3">{zh}</span>}
        </div>
        <span className={`font-mono text-[18px] font-semibold tabular-nums ${avg == null ? "text-ink-3" : avg < 50 ? "text-[#d70015]" : avg < 70 ? "text-[#9a6200]" : "text-[#1f7a37]"}`}>
          {avg ?? "—"}
        </span>
      </div>
      <div className="space-y-2">
        {dimensions.map((d) => {
          const isOpen = drillKey === `${title}:${d.key}`;
          const s = typeof d.score === "number" ? d.score : null;
          return (
            <div key={d.key}>
              <button
                onClick={() => onDrill(isOpen ? null : `${title}:${d.key}`)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="w-32 shrink-0 truncate text-[12px] text-ink-2">{d.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                  {s !== null ? (
                    <div
                      className={`h-full rounded-full ${s >= 70 ? "bg-[#34c759]" : s >= 40 ? "bg-[#0071e3]" : "bg-[#ff3b30]"}`}
                      style={{ width: `${Math.max(s, 2)}%` }}
                    />
                  ) : (
                    <div className="h-full w-full bg-black/[0.06]" aria-hidden />
                  )}
                </div>
                <span className="w-[70px] shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-3">
                  {s !== null ? s : <T en="Developing" zh="发展中" />}
                </span>
              </button>
              {isOpen && (
                <div className="enter mt-1 rounded-lg bg-black/[0.03] px-3 py-2 text-[12px] leading-relaxed text-ink-2">
                  <span className="font-semibold text-ink">Evidence: </span>{d.evidence}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
