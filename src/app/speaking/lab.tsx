"use client";

import { useState } from "react";
import { markStepAction } from "@/app/actions";
import { Badge, Card, MockBadge, btn, inputCls } from "@/components/ui";
import { Segmented, toast } from "@/components/motion";
import { useRecorder, useSpeech, useSpeechRecognition } from "@/hooks/speech";
import { T } from "@/components/i18n";
import { AiNudge } from "@/components/ai-nudge";
import type { SpeakingFeedback } from "@/lib/types";

interface ReqChunk {
  id: number;
  text: string;
  meaningZh: string;
}

export function SpeakingLab({
  aiLive,
  missionPrompt,
  isMissionStepDone,
  requiredChunks,
  extraPrompts,
  shadowingSentences,
  history,
}: {
  aiLive?: boolean;
  missionPrompt: string;
  isMissionStepDone: boolean;
  requiredChunks: ReqChunk[];
  extraPrompts: string[];
  shadowingSentences: string[];
  history: { id: number; prompt: string; overall: number | null; date: number }[];
}) {
  const [mode, setMode] = useState<"talk" | "shadow">("talk");

  return (
    <div>
      <AiNudge aiLive={!!aiLive} />

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">
            <T en="Speaking Lab" zh="口语实验室" />
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <T
              en="The AI's job is to make YOU talk more. Short answers get pushed: why, how, what if."
              zh="AI 的任务是让你多说。短回答会被持续追问：为什么、怎样、如果……"
            />
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "talk", label: <T en="Conversation" zh="对话" /> },
            { value: "shadow", label: <T en="Shadowing" zh="跟读" /> },
          ]}
        />
      </header>

      {mode === "talk" ? (
        <Conversation
          missionPrompt={missionPrompt}
          isMissionStepDone={isMissionStepDone}
          requiredChunks={requiredChunks}
          extraPrompts={extraPrompts}
        />
      ) : (
        <Shadowing sentences={shadowingSentences} />
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            Recent attempts
          </h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-2.5 text-[12.5px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]"
              >
                <span className="min-w-0 truncate text-ink-2">{h.prompt}</span>
                <span className="shrink-0 font-mono text-[12px] text-ink-3">
                  {new Date(h.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Conversation rounds ──────────────────────────────────────────────────── */

function Conversation({
  missionPrompt,
  isMissionStepDone,
  requiredChunks,
  extraPrompts,
}: {
  missionPrompt: string;
  isMissionStepDone: boolean;
  requiredChunks: ReqChunk[];
  extraPrompts: string[];
}) {
  const [prompt, setPrompt] = useState(missionPrompt);
  const [isMission, setIsMission] = useState(true);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(isMissionStepDone);
  const { speak, speaking, stop } = useSpeech();
  const rec = useSpeechRecognition();

  const liveTranscript = rec.state === "listening" ? `${rec.transcript} ${rec.interim}`.trim() : text;

  const submit = async () => {
    const transcript = liveTranscript.trim();
    if (!transcript || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          transcript,
          requiredChunkIds: requiredChunks.map((c) => c.id),
          round,
          missionSpeaking: isMission,
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        setFeedback(data.feedback);
        setText("");
        setRound((r) => r + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Prompt */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="mb-2 flex items-center gap-2">
          {isMission && <Badge tone="accent"><T en="Today's Mission · step ⑤" zh="今日任务 · 第⑤步" /></Badge>}
          <span className="text-[12px] text-ink-3">Round {round}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[16px] font-medium leading-relaxed text-ink">{prompt}</p>
          <button
            onClick={() => (speaking ? stop() : speak(prompt))}
            className="press shrink-0 rounded-lg bg-black/[0.05] px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-black/[0.09]"
          >
            {speaking ? "■" : "▶︎ hear"}
          </button>
        </div>
        {requiredChunks.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#0071e3]/[0.05] px-3.5 py-2.5">
            <span className="text-[12px] font-semibold text-[#0068d0]"><T en="Must try to use:" zh="必须尝试用上：" /></span>
            {requiredChunks.map((c) => (
              <span key={c.id} className="rounded-md bg-white px-2 py-0.5 text-[12px] font-semibold text-ink shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]" title={c.meaningZh}>
                {c.text}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {extraPrompts.slice(0, 4).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPrompt(p);
                setIsMission(false);
                setFeedback(null);
                setRound(1);
              }}
              className="press max-w-[260px] truncate rounded-lg bg-black/[0.04] px-2.5 py-1 text-[12px] text-ink-2 hover:bg-black/[0.07]"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-ink-2"><T en="Your answer — speak or type" zh="你的回答 —— 说出或打字" /></span>
          {rec.supported ? (
            <button
              onClick={() => (rec.state === "listening" ? rec.stop() : rec.start())}
              className={`press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 ${
                rec.state === "listening"
                  ? "bg-[#ff3b30] text-white"
                  : "bg-[#0071e3]/10 text-[#0068d0] hover:bg-[#0071e3]/20"
              }`}
            >
              {rec.state === "listening" && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              )}
              {rec.state === "listening" ? "● recording… stop" : "🎤 Speak"}
            </button>
          ) : (
            <span className="text-[12px] text-ink-3"><T en="Mic unavailable in this browser — type below" zh="此浏览器无法使用麦克风 —— 请在下方打字" /></span>
          )}
        </div>
        <textarea
          value={liveTranscript}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="I was going to… but I ended up…"
          className={`${inputCls} resize-none text-[14.5px] leading-relaxed`}
        />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={submit} disabled={busy || !liveTranscript.trim()} className={btn.primary}>
            {busy ? <T en="Coach is listening…" zh="教练正在听…" /> : <T en="Submit answer →" zh="提交回答 →" />}
          </button>
          <span className="text-[12px] text-ink-3"><T en="Aim for 3–5 sentences. Use the target chunks." zh="争取 3–5 句，用上目标语块。" /></span>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="enter space-y-4 rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink"><T en="Coach feedback" zh="教练反馈" /></h3>
            {feedback.isMock && <MockBadge />}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Fluency", feedback.ielts.fluency],
              ["Coherence", feedback.ielts.coherence],
              ["Lexical", feedback.ielts.lexical],
              ["Grammar", feedback.ielts.grammar],
              ["Overall", feedback.overallEstimate],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-xl bg-black/[0.03] px-3 py-2.5 text-center">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{label as string}</div>
                <div className="font-mono text-[18px] font-semibold tabular-nums text-ink">{v as number}</div>
              </div>
            ))}
          </div>

          {feedback.chunksUsed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {feedback.chunksUsed.map((c) => (
                <Badge key={c.text} tone={c.used ? "success" : "warn"}>
                  {c.used ? "✓" : "○"} {c.text}
                </Badge>
              ))}
            </div>
          )}

          <p className="text-[13.5px] leading-relaxed text-ink-2">{feedback.summary}</p>

          {feedback.corrections.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                One fix at a time — highest priority only
              </div>
              {feedback.corrections.map((c, i) => (
                <div key={i} className="rounded-xl bg-[#ff3b30]/[0.06] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                    <Badge tone="danger">{c.priority}</Badge>
                    <span className="text-ink-3 line-through">{c.original}</span>
                    <span className="text-ink-3">→</span>
                    <span className="font-semibold text-ink">{c.improved}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-2">{c.explanation}</p>
                </div>
              ))}
            </div>
          )}

          {feedback.acquisitions.failedRetrievals.length > 0 && (
            <p className="rounded-xl bg-[#ff9f0a]/[0.1] px-4 py-2.5 text-[12.5px] text-ink-2">
              Not yet used: <span className="font-semibold">{feedback.acquisitions.failedRetrievals.join(", ")}</span>{" "}
              — try again in the next round.
            </p>
          )}

          <div className="rounded-xl bg-[#0071e3]/[0.06] px-4 py-3.5">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#0068d0]">
              Follow-up — say more
            </div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-medium text-ink">{feedback.followUp}</p>
              <button
                onClick={() => {
                  setPrompt(feedback.followUp);
                  setIsMission(false);
                  setFeedback(null);
                  setText("");
                  rec.start?.();
                }}
                className={`${btn.secondary} shrink-0 px-3 py-1.5 text-[12px]`}
              >
                Answer →
              </button>
            </div>
          </div>

          {isMission && !done && (
            <button
              onClick={() => {
                setDone(true);
                markStepAction("speaking");
                toast("Speaking step complete", "success");
              }}
              className={btn.secondary}
            >
              ✓ Mark today's speaking step done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Shadowing ────────────────────────────────────────────────────────────── */

function Shadowing({ sentences }: { sentences: string[] }) {
  const [selected, setSelected] = useState(sentences[0]);
  const { speak, speaking, stop } = useSpeech();
  const rec = useRecorder();

  return (
    <div className="space-y-5">
      <Card
        title="Shadowing — Listen → Record → Compare"
        subtitle="Copy the rhythm, not just the words. Connected speech is trained by the mouth, not the ear alone."
      >
        <div className="space-y-2">
          {sentences.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSelected(s);
                rec.reset();
              }}
              className={`press block w-full rounded-xl px-4 py-2.5 text-left text-[13.5px] transition-colors duration-150 ${
                selected === s ? "bg-[#0071e3]/[0.07] font-medium text-ink" : "bg-black/[0.03] text-ink-2 hover:bg-black/[0.05]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      <Card title={<T en="A/B compare" zh="A/B 对比" />}>
        <p className="mb-4 rounded-xl bg-black/[0.03] px-4 py-3 text-[15px] leading-relaxed text-ink">
          {selected}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => (speaking ? stop() : speak(selected, 0.9))} className={btn.primary}>
            {speaking ? <T en="Stop model" zh="停止示范" /> : <T en="1. Listen to model" zh="1. 听示范" />}
          </button>
          <button
            onClick={() => (rec.recording ? rec.stop() : rec.start())}
            className={`press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors duration-200 ${
              rec.recording ? "bg-[#ff3b30] text-white" : "bg-white text-ink shadow-[0_0_0_0.5px_rgba(0,0,0,0.12)] hover:bg-black/[0.03]"
            }`}
          >
            {rec.recording && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
            {rec.recording ? "● 2. Recording… tap to stop" : "🎤 2. Record yourself"}
          </button>
          {rec.url && (
            <>
              <audio controls src={rec.url} className="h-9" />
              <span className="text-[12px] text-ink-3">3. Compare — where does your rhythm break?</span>
            </>
          )}
        </div>
        <div className="mt-4 rounded-xl bg-black/[0.03] px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          Checklist while comparing: ▸ Did you link the words the model links? ▸ Did the weak
          forms stay weak (supposed to, was going to)? ▸ Did the stress land on the content words?
          One focused fix per repetition beats ten careless ones.
        </div>
      </Card>
    </div>
  );
}
