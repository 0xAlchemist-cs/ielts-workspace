"use client";

import { useState, useRef, useEffect } from "react";
import { Badge, MockBadge, btn, inputCls } from "@/components/ui";
import { Drawer } from "@/components/motion";
import { T } from "@/components/i18n";

/* ── Ask Tutor — floating AI coach available from any page ────────────────
 * Reads user's learning context, explains at their level, connects
 * every explanation to a practice opportunity. */

type TutorMode = "explain" | "coach" | "correct" | "compare" | "practice" | "ielts";

interface TutorResult {
  reply: string;
  mode: TutorMode;
  isMock: boolean;
  contextSummary: string;
  suggestedPractice?: string;
  suggestedErrorBank?: { wrongForm: string; correctForm: string; category: string };
}

const MODE_OPTIONS: { value: TutorMode; label: string; zh: string }[] = [
  { value: "explain", label: "Explain", zh: "解释" },
  { value: "coach", label: "Coach", zh: "引导" },
  { value: "correct", label: "Correct", zh: "纠错" },
  { value: "compare", label: "Compare", zh: "对比" },
  { value: "practice", label: "Practice", zh: "练习" },
  { value: "ielts", label: "IELTS", zh: "雅思" },
];

export function AskTutor({
  open,
  onClose,
  initialQuestion,
  pageContext,
}: {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
  pageContext?: string;
}) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [mode, setMode] = useState<TutorMode>("explain");
  const [result, setResult] = useState<TutorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ role: "user" | "tutor"; text: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitRef = useRef<(q?: string, m?: TutorMode) => void>(() => {});
  const prevInitial = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (open && initialQuestion && initialQuestion !== prevInitial.current) {
      prevInitial.current = initialQuestion;
      submitRef.current(initialQuestion, mode);
    }
  }, [open, initialQuestion]);

  const submit = (q?: string, m?: TutorMode) => {
    const text = (q ?? question).trim();
    const useMode = m ?? mode;
    if (!text || busy) return;
    setBusy(true);
    setResult(null);
    setHistory((h) => [...h, { role: "user", text }]);
    fetch("/api/ai/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, mode: useMode, context: pageContext }),
    })
      .then((r) => r.json())
      .then((data: TutorResult) => {
        if (data.reply) {
          setResult(data);
          setHistory((h) => [...h, { role: "tutor", text: data.reply }]);
        }
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={<T en="AI Tutor" zh="AI 导师" />}
      subtitle={<T en="Personal language coach — reads your learning history" zh="个人语言教练——读取你的学习历史" />}
      width="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Mode selector */}
        <div className="flex flex-wrap gap-1.5">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`press rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                mode === m.value ? "chip-on" : "chip"
              }`}
            >
              {m.label} <span className="opacity-50">{m.zh}</span>
            </button>
          ))}
        </div>

        {/* Question input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ask about any word, expression, grammar point, or error…"
            className={inputCls}
            autoFocus
          />
          <button onClick={() => submit()} disabled={busy || !question.trim()} className={`${btn.primary} shrink-0`}>
            {busy ? "…" : "→"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="enter space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="accent">{result.mode}</Badge>
              <span className="text-[12px] text-ink-3">{result.contextSummary}</span>
              {result.isMock && <MockBadge />}
            </div>
            <div className="rounded-xl bg-black/[0.025] px-4 py-3.5 text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">
              {result.reply}
            </div>

            {/* Action buttons */}
            {result.suggestedPractice && (
              <div className="rounded-xl bg-[#0071e3]/[0.05] px-4 py-3">
                <div className="text-[10.5px] font-semibold uppercase text-[#0068d0]">
                  <T en="Practice Now" zh="立即练习" />
                </div>
                <p className="mt-0.5 text-[13px] text-ink">{result.suggestedPractice}</p>
                <div className="mt-2 flex gap-2">
                  <textarea rows={2} placeholder="Your answer…" className={`${inputCls} text-[13px]`} />
                  <button className={`${btn.secondary} shrink-0 self-end text-[12px]`}>
                    <T en="Check" zh="检查" />
                  </button>
                </div>
              </div>
            )}

            {result.suggestedErrorBank && (
              <div className="flex items-center gap-2 rounded-xl bg-[#ff9f0a]/[0.08] px-4 py-2.5">
                <Badge tone="warn">Error Bank</Badge>
                <span className="text-[12px] text-ink-2">
                  "{result.suggestedErrorBank.wrongForm}" → "{result.suggestedErrorBank.correctForm}" ({result.suggestedErrorBank.category})
                </span>
              </div>
            )}
          </div>
        )}

        {/* Recent conversation */}
        {history.length > 2 && (
          <div className="border-t border-black/[0.06] pt-3">
            <div className="mb-2 text-[10.5px] font-semibold uppercase text-ink-3">Recent</div>
            <div className="max-h-[200px] space-y-2 overflow-y-auto">
              {history.slice(-4).map((h, i) => (
                <div key={i} className={`text-[12.5px] leading-relaxed ${h.role === "user" ? "text-ink-2" : "text-ink"}`}>
                  <b>{h.role === "user" ? "You: " : "Tutor: "}</b>
                  {h.text.slice(0, 150)}{h.text.length > 150 ? "…" : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
