"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Loader2, RotateCcw, X } from "lucide-react";
import { T } from "@/components/i18n";

/* ── Wrong→Practice flow — WHY → Recall → Transfer → Done. One screen at a
 *    time; the correct form is revealed only AFTER grading. No engine
 *    vocabulary — plain language about what just happened. */

interface StartResponse {
  ok: true;
  sessionId: string;
  why: { en: string; zh: string };
  recall: { context: string; scene: string };
  transfer: { context: string; scene: string };
  isMock: boolean;
}

interface SubmitResponse {
  ok: true;
  stage: "retrieval" | "transfer";
  result: "correct" | "partial" | "incorrect";
  quality: 0 | 3 | 5;
  verdict: string;
  targetAnswer: string;
  next: "transfer" | "done" | "review-queue";
}

type Phase = "loading" | "recall" | "recall-feedback" | "transfer" | "transfer-feedback" | "done" | "failed";

export function WrongPracticeView({ errorId, wrongForm, category }: { errorId: number; wrongForm: string; category: string }) {
  const [session, setSession] = useState<StartResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [graded, setGraded] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/wrong-practice/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorId }),
    })
      .then((r) => r.json())
      .then((d: StartResponse) => {
        if (!alive) return;
        if (d.ok) {
          setSession(d);
          setPhase("recall");
        } else {
          setError("Could not start this practice.");
        }
      })
      .catch(() => alive && setError("Could not start this practice."));
    return () => {
      alive = false;
    };
  }, [errorId]);

  const submitStage = useCallback(
    async (stage: "retrieval" | "transfer") => {
      if (!session || !answer.trim() || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/wrong-practice/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId, errorId, stage, response: answer.trim() }),
        });
        const d = await res.json();
        if (d.ok) {
          setGraded(d as SubmitResponse);
          setPhase(stage === "retrieval" ? "recall-feedback" : "transfer-feedback");
        } else {
          setError(d.message ?? "Submission failed.");
        }
      } catch {
        setError("Submission failed — check your connection.");
      } finally {
        setSubmitting(false);
      }
    },
    [session, answer, errorId, submitting],
  );

  if (phase === "loading") {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl items-center justify-center">
        {error ? (
          <p className="text-[13.5px] text-err-text">{error}</p>
        ) : (
          <Loader2 size={20} className="animate-spin text-ink-3" />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* back to where you came from */}
      <Link href="/errors" className="press mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-ink">
        <ChevronDown size={13} className="-rotate-90" />
        <T en="Mistakes" zh="惯犯错误" />
      </Link>

      {/* WHY — plain language, no engine words */}
      <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-3">
        <T en="Practice this mistake" zh="练这个错" />
      </p>
      <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">{wrongForm}</h1>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-2">
        <T en={session?.why.en ?? ""} zh={session?.why.zh ?? ""} />
      </p>

      {/* Stage 1 — Recall */}
      {(phase === "recall" || phase === "recall-feedback") && session && (
        <div className="card-specular mt-6 rounded-2xl bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <T en="Step 1 · Recall" zh="第 1 步 · 回忆" />
          </p>
          {phase === "recall" ? (
            <>
              <p className="mt-2.5 text-[15.5px] font-medium leading-[1.8] text-ink">{session.recall.context}</p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                <T en={`Context: ${session.recall.scene}`} zh={`语境：${session.recall.scene}`} />
              </p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
                <T en="Fill the blank from memory — write the missing expression." zh="凭记忆填空——写出缺的那个表达。" />
              </p>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitStage("retrieval")}
                placeholder="…"
                className="input-base mt-3 text-[14px]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => submitStage("retrieval")}
                disabled={submitting || !answer.trim()}
                className="btn-apple press mt-4 inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-medium text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                <T en="Check" zh="提交" />
              </button>
              {error && <p className="mt-2 text-[12.5px] text-err-text">{error}</p>}
            </>
          ) : (
            <RecallFeedback
              graded={graded}
              onNext={() => {
                if (graded?.next === "transfer") {
                  setAnswer("");
                  setPhase("transfer");
                } else {
                  setPhase("failed");
                }
              }}
            />
          )}
        </div>
      )}

      {/* Stage 2 — Transfer */}
      {(phase === "transfer" || phase === "transfer-feedback") && session && (
        <div className="card-specular mt-4 rounded-2xl bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <T en="Step 2 · New context" zh="第 2 步 · 新语境" />
          </p>
          {phase === "transfer" ? (
            <>
              <p className="mt-2.5 text-[14.5px] leading-[1.8] text-ink">{session.transfer.context}</p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                <T en={`Context: ${session.transfer.scene}`} zh={`语境：${session.transfer.scene}`} />
              </p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
                <T
                  en="Write your own full sentence for this situation, using the correct form."
                  zh="为这个情境写一个你自己的完整句子，用上正确形式。"
                />
              </p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                className="input-base mt-3 text-[14px]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => submitStage("transfer")}
                disabled={submitting || !answer.trim()}
                className="btn-apple press mt-4 inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-medium text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                <T en="Check" zh="提交" />
              </button>
              {error && <p className="mt-2 text-[12.5px] text-err-text">{error}</p>}
            </>
          ) : (
            <TransferFeedback graded={graded} onDone={() => setPhase("done")} />
          )}
        </div>
      )}

      {/* Done / Failed screens */}
      {phase === "done" && (
        <div className="card-specular mt-4 rounded-2xl bg-surface p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/[0.12]">
            <Check size={22} strokeWidth={2.4} className="text-ok-text" />
          </span>
          <p className="mt-3.5 text-[16px] font-semibold text-ink">
            <T en="Done — for now." zh="完成——暂时。" />
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">
            <T
              en="You produced it from memory and used it in a new context. It stays in your review schedule and will come back until it's solid."
              zh="你凭记忆产出了它，并在新语境里用了一次。它会留在复习安排里，直到真正牢为止。"
            />
          </p>
          <div className="mt-5 flex items-center justify-center gap-4">
            <Link href="/review" className="btn-apple press inline-flex h-10 items-center rounded-lg px-5 text-[13.5px] font-medium text-white">
              <T en="Back to practice" zh="回去练习" />
            </Link>
            <Link href="/errors" className="press text-[13px] font-medium text-ink-3 hover:text-ink">
              <T en="Mistakes" zh="惯犯错误" />
            </Link>
          </div>
        </div>
      )}
      {phase === "failed" && graded && (
        <div className="card-specular mt-4 rounded-2xl bg-surface p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-err/[0.1]">
            <RotateCcw size={20} strokeWidth={2} className="text-err-text" />
          </span>
          <p className="mt-3.5 text-[16px] font-semibold text-ink">
            <T en="Not yet." zh="还没到。" />
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">
            <T
              en="That's exactly what practice is for — this one is back in your review queue and will return soon."
              zh="这正是练习的意义——它已回到你的复习队列，很快会再出现。"
            />
          </p>
          <div className="mt-5 flex items-center justify-center gap-4">
            <Link href="/review" className="btn-apple press inline-flex h-10 items-center rounded-lg px-5 text-[13.5px] font-medium text-white">
              <T en="Review now" zh="去复习" />
            </Link>
            <Link href="/errors" className="press text-[13px] font-medium text-ink-3 hover:text-ink">
              <T en="Mistakes" zh="惯犯错误" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function RecallFeedback({ graded, onNext }: { graded: SubmitResponse | null; onNext: () => void }) {
  if (!graded) return null;
  const good = graded.result === "correct";
  const partial = graded.result === "partial";
  return (
    <div className="enter">
      <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold">
        {good ? (
          <>
            <Check size={17} strokeWidth={2.6} className="text-ok-text" />
            <T en="Correct" zh="正确" />
          </>
        ) : partial ? (
          <>
            <X size={17} strokeWidth={2.6} className="text-warn-text" />
            <T en="Almost" zh="接近" />
          </>
        ) : (
          <>
            <X size={17} strokeWidth={2.6} className="text-err-text" />
            <T en="Not this time" zh="这次没有" />
          </>
        )}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{graded.verdict}</p>
      {graded.result !== "correct" && (
        <p className="mt-2 text-[13.5px] font-medium text-ink">
          <T en={`Correct form: ${graded.targetAnswer}`} zh={`正确形式：${graded.targetAnswer}`} />
        </p>
      )}
      {graded.next === "transfer" ? (
        <>
          <p className="mt-3.5 text-[12.5px] leading-relaxed text-ink-2">
            <T en="Now use it once more — in a different situation." zh="现在再用一次——换一个情境。" />
          </p>
          <button
            type="button"
            onClick={onNext}
            className="btn-apple press mt-3 inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-medium text-white"
          >
            <T en="New context" zh="新语境" />
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        </>
      ) : (
        <button type="button" onClick={onNext} className="press mt-3.5 text-[13px] font-medium text-ink-3 hover:text-ink">
          <T en="Continue" zh="继续" />
        </button>
      )}
    </div>
  );
}

function TransferFeedback({ graded, onDone }: { graded: SubmitResponse | null; onDone: () => void }) {
  if (!graded) return null;
  return (
    <div className="enter">
      <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold">
        {graded.result === "correct" ? (
          <>
            <Check size={17} strokeWidth={2.6} className="text-ok-text" />
            <T en="Transferred" zh="迁移成功" />
          </>
        ) : graded.result === "partial" ? (
          <>
            <X size={17} strokeWidth={2.6} className="text-warn-text" />
            <T en="Almost — both forms appeared" zh="接近——两种形式都出现了" />
          </>
        ) : (
          <>
            <X size={17} strokeWidth={2.6} className="text-err-text" />
            <T en="Not this time" zh="这次没有" />
          </>
        )}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{graded.verdict}</p>
      <p className="mx-auto mt-4 max-w-sm text-[12.5px] leading-relaxed text-ink-3">
        <T
          en="Either way, this stays in your review schedule — the engine decides when it returns, not this page."
          zh="无论结果如何，它都留在复习安排里——何时再现由系统决定，不在这里。"
        />
      </p>
      <button
        type="button"
        onClick={onDone}
        className="btn-apple press mt-4 inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-medium text-white"
      >
        <T en="Done" zh="完成" />
      </button>
    </div>
  );
}
