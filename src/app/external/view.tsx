"use client";

import { useState, useTransition } from "react";
import { logExternalSessionAction } from "@/app/actions";
import { Badge, Card, btn, inputCls } from "@/components/ui";
import { toast } from "@/components/motion";
import { T } from "@/components/i18n";
import type { ExternalCoach } from "@/lib/external-coaches";

interface SessionLog {
  id: number;
  skill: string;
  durationMinutes: number;
  difficulty: string;
  selfAssessment: number;
  struggledWith: string | null;
  createdAt: number;
}

export function ExternalCoachView({
  coaches,
  missionId,
  sessions,
}: {
  coaches: ExternalCoach[];
  missionId: number;
  sessions: SessionLog[];
}) {
  const [showLog, setShowLog] = useState(false);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-display">
          <T en="External Learning Hub" zh="外部学习中心" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T
            en="Launch external AI coaches from here, then log your session when you return. Workspace tracks the learning event — not the conversation."
            zh="从这里启动外部 AI 教练，回来后记录训练时间。Workspace 记录学习事件——不追踪对话内容。"
          />
        </p>
      </header>

      {/* Coach Cards */}
      <div className="stagger grid gap-4 sm:grid-cols-2">
        {coaches.map((coach) => (
          <div key={coach.id} className="card-specular card-lift rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0071e3]/10 text-[20px]">
                {coach.skill === "speaking" ? "🎤" : "🎧"}
              </div>
              <Badge tone="accent">{coach.skill}</Badge>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.015em] text-ink">
              {coach.name}
              <span className="ml-2 text-[12px] font-normal text-ink-3">{coach.nameZh}</span>
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{coach.description}</p>
            <div className="mt-3 rounded-xl bg-black/[0.03] px-3.5 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                <T en="Recommended for" zh="推荐用于" />
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{coach.recommendedFor}</p>
            </div>
            <div className="mt-4 flex gap-2.5">
              <a
                href={coach.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn.primary} flex-1 text-center`}
              >
                <T en="Open Coach →" zh="启动教练 →" />
              </a>
            </div>
            <p className="mt-2 text-center text-[10.5px] text-ink-3">
              <T en="Opens in new tab · Workspace stays here" zh="新窗口打开 · Workspace 保持不动" />
            </p>
          </div>
        ))}
      </div>

      {/* Log Session */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            <T en="Log External Session" zh="记录外部训练" />
          </h2>
          <button onClick={() => setShowLog(!showLog)} className={showLog ? btn.ghost : btn.secondary}>
            {showLog ? "− Cancel" : <T en="+ Log a session" zh="＋ 记录训练" />}
          </button>
        </div>

        {showLog && <LogSessionForm missionId={missionId} onDone={() => setShowLog(false)} />}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div className="mt-4 space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white px-4 py-3 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06)]">
                <Badge tone={s.skill === "speaking" ? "accent" : "purple"}>{s.skill}</Badge>
                <span className="text-[12.5px] text-ink-2">{s.durationMinutes} min · {s.difficulty}</span>
                <span className="text-[12.5px] text-ink-3">
                  <T en="Self-assessment" zh="自评" />: {"★".repeat(s.selfAssessment)}{"☆".repeat(5 - s.selfAssessment)}
                </span>
                {s.struggledWith && (
                  <span className="text-[11.5px] italic text-ink-3">"{s.struggledWith.slice(0, 50)}"</span>
                )}
                <span className="ml-auto font-mono text-[10.5px] text-ink-3">
                  {new Date(s.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Honesty note */}
      <div className="mt-8 rounded-xl bg-[#ff9f0a]/[0.06] px-5 py-4">
        <p className="text-[12px] leading-relaxed text-ink-2">
          <T
            en="⚠ Self-assessment is auxiliary data only. It does NOT increase IELTS Band, Retrieval Strength, or LanguageItem Strength. Only verified learning events (retrieval, production, transfer) inside the Workspace move real metrics."
            zh="⚠ 自评仅作为辅助数据，不会增加雅思分数、提取强度或语言项强度。只有 Workspace 内的可验证学习事件才会推动真实指标。"
          />
        </p>
      </div>
    </div>
  );
}

function LogSessionForm({ missionId, onDone }: { missionId: number; onDone: () => void }) {
  const [skill, setSkill] = useState("listening");
  const [duration, setDuration] = useState(10);
  const [difficulty, setDifficulty] = useState("medium");
  const [selfAssessment, setSelfAssessment] = useState(3);
  const [struggled, setStruggled] = useState("");
  const [busy, start] = useTransition();

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink-2"><T en="Skill" zh="技能" /></label>
          <div className="inline-flex rounded-xl bg-black/[0.05] p-1">
            {["listening", "speaking"].map((s) => (
              <button key={s} type="button" onClick={() => setSkill(s)}
                className={`press rounded-lg px-4 py-1.5 text-[12.5px] font-medium transition-all ${
                  skill === s ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-ink-2"
                }`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink-2"><T en="Duration" zh="时长" /></label>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
            {[5, 10, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m}+ min</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink-2"><T en="Difficulty" zh="难度" /></label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputCls}>
            {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink-2"><T en="Self-assessment" zh="自评" /></label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setSelfAssessment(n)}
                className={`press h-9 w-9 rounded-lg text-[14px] font-semibold transition-colors ${
                  selfAssessment >= n ? "bg-[#ff9f0a]/15 text-[#9a6200]" : "bg-black/[0.04] text-ink-3"
                }`}>★</button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-medium text-ink-2">
            <T en="What did you struggle with? (optional)" zh="哪里遇到了困难？（可选）" />
          </label>
          <input
            value={struggled}
            onChange={(e) => setStruggled(e.target.value)}
            placeholder="e.g. Part 3 abstract questions, connected speech in fast audio..."
            className={inputCls}
          />
        </div>
      </div>
      <button
        disabled={busy}
        onClick={() =>
          start(async () => {
            await logExternalSessionAction({
              skill,
              durationMinutes: duration,
              difficulty,
              selfAssessment,
              struggledWith: struggled || undefined,
              missionId,
            });
            toast("External session logged — learning event recorded", "success");
            onDone();
          })
        }
        className={`${btn.primary} mt-4 w-full`}
      >
        {busy ? "..." : <T en="Log session ✓" zh="记录 ✓" />}
      </button>
    </Card>
  );
}
