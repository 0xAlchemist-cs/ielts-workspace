"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { addErrorAction, toggleErrorAction } from "@/app/actions";
import { Badge, Card, EmptyState, MockBadge, btn, inputCls } from "@/components/ui";
import { Drawer, ElapsedWait, toast } from "@/components/motion";
import { T } from "@/components/i18n";
import { AskTutor } from "@/components/ask-tutor";
import type { DrillSet, ErrorCategory } from "@/lib/types";

interface ErrorItem {
  id: number;
  category: ErrorCategory;
  wrongForm: string;
  correctForm: string;
  explanation: string;
  occurrenceCount: number;
  source: string;
  status: string;
}

const CATEGORIES: { value: ErrorCategory; label: string; tone: "danger" | "warn" | "accent" | "purple" | "neutral" }[] = [
  { value: "grammar", label: "Grammar", tone: "danger" },
  { value: "vocabulary", label: "Vocabulary", tone: "purple" },
  { value: "preposition", label: "Preposition", tone: "accent" },
  { value: "naturalness", label: "Naturalness", tone: "warn" },
  { value: "chinese_english", label: "Chinese English", tone: "danger" },
];

export function ErrorBankView({ errors }: { errors: ErrorItem[] }) {
  const [rows, setRows] = useState(errors);
  const [form, setForm] = useState({ category: "grammar" as ErrorCategory, wrong: "", correct: "", explanation: "" });
  const [pending, start] = useTransition();
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState("");
  const [drillErr, setDrillErr] = useState<ErrorItem | null>(null);

  const active = rows.filter((r) => r.status === "active");
  const resolved = rows.filter((r) => r.status === "resolved");

  return (
    <div className="shell-wide">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">
            <T en="My English Problems" zh="我的英语问题库" />
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <T
              en="Every correction lands here and returns in retrieval practice until it's dead."
              zh="每一条纠正都会存在这里，并在提取练习中反复回来，直到你彻底消灭它。不再重复的错误是涨分最快的途径。"
            />
          </p>
        </div>
        {active.length > 0 && (
          <Link href="/review" className={btn.primary}>
            <T en={`Revenge practice (${active.length})`} zh={`复仇练习（${active.length}）`} />
          </Link>
        )}
      </header>

      <Card
        title={<T en="Add an error you noticed yourself" zh="添加一个你自己发现的错误" />}
        subtitle={<T en="Self-noticed errors stick twice as hard." zh="自己发现的错误，记得更牢。" />}
        className="mb-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setForm((f) => ({ ...f, category: c.value }))}
              className={`press rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 ${
                form.category === c.value ? "chip-on" : "chip"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={form.wrong}
            onChange={(e) => setForm((f) => ({ ...f, wrong: e.target.value }))}
            placeholder="✗ what you said/wrote"
            className={inputCls}
          />
          <input
            value={form.correct}
            onChange={(e) => setForm((f) => ({ ...f, correct: e.target.value }))}
            placeholder="✓ the correct form"
            className={inputCls}
          />
          <button
            disabled={pending || !form.wrong.trim() || !form.correct.trim()}
            onClick={() =>
              start(async () => {
                await addErrorAction({
                  category: form.category,
                  wrongForm: form.wrong.trim(),
                  correctForm: form.correct.trim(),
                  explanation: form.explanation.trim(),
                });
                setRows((r) => [
                  {
                    id: -Date.now(), // optimistic temp key; server id arrives on refresh
                    category: form.category,
                    wrongForm: form.wrong.trim(),
                    correctForm: form.correct.trim(),
                    explanation: "",
                    occurrenceCount: 1,
                    source: "manual",
                    status: "active",
                  },
                  ...r,
                ]);
                setForm({ category: "grammar", wrong: "", correct: "", explanation: "" });
                toast("Error banked — it will return in retrieval practice", "warn");
              })
            }
            className={btn.secondary}
          >
            + Bank it
          </button>
        </div>
        <input
          value={form.explanation}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          placeholder="Why? (optional — the rule or the contrast)"
          className={`${inputCls} mt-2`}
        />
      </Card>

      {active.length === 0 ? (
        <EmptyState
          title="No active errors"
          hint="They collect automatically from speaking feedback, and you can add your own. The AI coach banks P1/P2 corrections here."
        />
      ) : (
        <div className="stagger space-y-2.5">
          {active.map((e) => (
            <ErrorRow key={e.id} e={e} onToggle={() => {
              toggleErrorAction(e.id);
              setRows((r) => r.map((x) => (x.id === e.id ? { ...x, status: "resolved" } : x)));
            }} onAskTutor={(q) => { setTutorQuestion(q); setTutorOpen(true); }} onDrills={() => setDrillErr(e)} />
          ))}
        </div>
      )}

      <DrillDrawer key={drillErr?.id ?? "none"} error={drillErr} onClose={() => setDrillErr(null)} />

      {resolved.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            Resolved ({resolved.length})
          </h3>
          <div className="space-y-2">
            {resolved.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-2 text-[12.5px] text-ink-3">
                <span>
                  <span className="line-through">{e.wrongForm}</span> → {e.correctForm}
                </span>
                <button
                  onClick={() => {
                    toggleErrorAction(e.id);
                    setRows((r) => r.map((x) => (x.id === e.id ? { ...x, status: "active" } : x)));
                  }}
                  className="press text-[12px] font-medium text-ink-3 hover:text-ink"
                >
                  it came back ↺
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AskTutor
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
        initialQuestion={tutorQuestion}
        pageContext="error_bank"
      />
    </div>
  );
}

function ErrorRow({ e, onToggle, onAskTutor, onDrills }: { e: ErrorItem; onToggle: () => void; onAskTutor: (q: string) => void; onDrills: () => void }) {
  const meta = CATEGORIES.find((c) => c.value === e.category);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? e.category}</Badge>
          <span className="text-ink-3 line-through">{e.wrongForm}</span>
          <span className="text-ink-3">→</span>
          <span className="font-semibold text-ink">{e.correctForm}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[12px] tabular-nums text-ink-3">×{e.occurrenceCount}</span>
          {e.source === "ai" && <Badge tone="neutral">AI-spotted</Badge>}
          <button onClick={onToggle} className={`${btn.ghost} text-[#1e7d34]`}>
            ✓ killed it
          </button>
        </div>
      </div>
      {e.explanation && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{e.explanation}</p>}
      <button
        onClick={() => onAskTutor(`Why do I keep making the mistake "${e.wrongForm}" instead of "${e.correctForm}"? This has happened ${e.occurrenceCount} times.`)}
        className={`${btn.ghost} mt-2 text-[#0068d0]`}
      >
        🤖 <T en="Ask Tutor why" zh="问导师为什么" />
      </button>
      <button onClick={onDrills} className={`${btn.ghost} mt-2 ml-1 text-[#0068d0]`}>
        <T en="Parallel drills" zh="平行操练" />
      </button>
    </div>
  );
}

/* ── Parallel drills — the same error pattern re-tested in 3 NEW contexts,
 * so killing it stops depending on remembering the original sentence. ──── */
const normAnswer = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9'\s]/g, "").replace(/\s+/g, " ").trim();

function DrillDrawer({ error, onClose }: { error: ErrorItem | null; onClose: () => void }) {
  const [set, setSet] = useState<DrillSet | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const recorded = useRef(false);

  // parent remounts this drawer per error (key), so state starts clean —
  // the effect only fetches
  useEffect(() => {
    if (!error) return;
    fetch("/api/ai/drills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorId: error.id }),
    })
      .then((r) => r.json())
      .then((d: DrillSet) => d.items?.length && setSet(d));
  }, [error?.id]);

  if (!error) return null;
  const check = (i: number) => {
    const item = set?.items[i];
    if (!item || checked[i] !== undefined) return;
    const ok = (() => {
      const a = normAnswer(answers[i] ?? "");
      const want = normAnswer(item.answer);
      return !!a && (a === want || a.includes(want));
    })();
    setChecked((c) => ({ ...c, [i]: ok }));
    const correctCount = Object.values({ ...checked, [i]: ok }).filter(Boolean).length;
    if (correctCount > 0 && !recorded.current) {
      recorded.current = true;
      fetch("/api/ai/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errorId: error.id, record: { correct: 1 } }),
      }).catch(() => {});
      toast("Retrieval counted — it appears in today's evidence.", "success");
    }
  };

  return (
    <Drawer
      open={!!error}
      onClose={onClose}
      title={<T en="Parallel drills" zh="平行操练" />}
      subtitle={
        <>
          <span className="line-through">{error.wrongForm}</span> → <b>{error.correctForm}</b>
          {set?.isMock && <MockBadge />}
        </>
      }
    >
      {!set ? (
        <ElapsedWait en="Writing your drills — usually under 60 s" zh="生成操练句中 — 通常 60 秒内" />
      ) : (
        <div className="space-y-5">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            <T
              en="Same pattern, three new scenes. Fill the blank from memory — no peeking at the answer."
              zh="同一个错误模式，三个新场景。凭记忆填空——先别看答案。"
            />
          </p>
          {set.items.map((item, i) => (
            <div key={i} className="rounded-xl bg-surface-2 px-4 py-3">
              {item.scene && <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.05em] text-ink-3">{item.scene}</p>}
              <p className="text-[14px] leading-relaxed text-ink">{item.context}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && check(i)}
                  disabled={checked[i] !== undefined}
                  placeholder="____"
                  className="input-base w-44 px-3 py-1.5 text-[13px]"
                />
                {checked[i] === undefined ? (
                  <button onClick={() => check(i)} className={`${btn.secondary} px-3 py-1.5 text-[12px]`}>
                    <T en="Check" zh="检查" />
                  </button>
                ) : checked[i] ? (
                  <span className="text-[12.5px] font-medium text-ok-text">✓</span>
                ) : (
                  <span className="text-[12.5px] text-ink-2">
                    → <b className="text-ink">{item.answer}</b>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
