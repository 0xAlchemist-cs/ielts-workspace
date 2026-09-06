"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import {
  attachTranscriptAction,
  logEventAction,
  markStepAction,
  recordExposureAction,
  saveMissAction,
  saveShadowAction,
} from "@/app/actions";
import { Badge, MockBadge, btn, inputCls } from "@/components/ui";
import { toast } from "@/components/motion";
import { T } from "@/components/i18n";
import { useRecorder, useSpeech, useVoiceDraft } from "@/hooks/speech";
import { useAudioController } from "@/hooks/audio-controller";
import type { AudioController } from "@/hooks/audio-controller";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { intonationOf, naturalForm, stressLine } from "@/lib/spoken-form";
import { MISS_LABELS } from "@/lib/listening-labels";
import { AudioPlayerBar } from "./player";
import type { SpeechPhenomenon, SpeakingFeedback } from "@/lib/types";

/* ── LISTENING LAB — active listening, not a listening test ────────────────
 * Listen → Recall → Detect → Transcript → Analyze → Shadow → Retrieve → Reuse.
 * The goal: answer "why didn't I catch that?" — never just "wrong answer". */

export interface ListenClip {
  id: number;
  speaker: string;
  text: string;
  phenomena: SpeechPhenomenon[];
}

export interface ListenTarget {
  chunkId: number;
  retrievalItemId: number;
  text: string;
  pattern: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  speakingPrompt: string;
  cloze?: string;
  clozeAudio?: string;
}

type Phase = "first" | "again" | "recall" | "reveal" | "shadow" | "retrieve" | "transfer" | "done";

const PHASES: { key: Phase; no: string; en: string; zh: string }[] = [
  { key: "first", no: "①", en: "Listen for Meaning", zh: "听大意" },
  { key: "again", no: "②", en: "Detect What You Missed", zh: "定位漏听" },
  { key: "recall", no: "③", en: "Listening Recall", zh: "听后回忆" },
  { key: "reveal", no: "④⑤", en: "Transcript & Speech Analysis", zh: "转写对照与语流分析" },
  { key: "shadow", no: "⑥", en: "Shadowing", zh: "影子跟读" },
  { key: "retrieve", no: "⑦", en: "Listening Retrieval", zh: "听境提取" },
  { key: "transfer", no: "⑧", en: "Speaking Transfer", zh: "口语迁移" },
];

export function ListeningLab({
  contentId,
  title,
  audioUrl,
  transcriptNeeded,
  cefr,
  listeningProfile,
  focusLabel,
  clips,
  targets,
  savedVocab,
}: {
  contentId: number;
  title: string;
  audioUrl: string | null;
  transcriptNeeded: boolean;
  cefr: string;
  listeningProfile: Record<string, string>;
  focusLabel: string;
  clips: ListenClip[];
  targets: ListenTarget[];
  savedVocab: string[];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("first");
  const { speak, stop } = useSpeech();

  useEffect(() => {
    // Rotation engine: entering the listening lab counts as a content use.
    recordExposureAction(contentId);
  }, [contentId]);

  const fullTranscript = useMemo(() => clips.map((c) => c.text).join(" "), [clips]);
  const weakestLevel = Object.values(listeningProfile).sort()[0];

  /* The single source of audio truth — play/pause/seek/segment all flow
   * through it, and the player bar stays mounted across every phase. */
  const audio = useAudioController({
    src: audioUrl,
    onPlayTTS: () => speak(fullTranscript.slice(0, 3000), 0.95),
    ttsStop: stop,
  });

  return (
    <div className="shell-wide">
      {/* passing the ref object itself (not .current) is the standard React pattern */}
      {/* eslint-disable-next-line react-hooks/refs */}
      <audio ref={audio.audioRef} src={audioUrl ?? undefined} preload="auto" />

      <header className="mb-6">
        <p className="t-caption">
          <Link href="/library" className="hover:text-ink">← Library</Link>
          {" · "}
          {audioUrl ? "Real recording 真实录音" : "Synthesised speech 合成语音"}
          {` · ${cefr}`}
          {weakestLevel ? ` · ${weakestLevel}` : ""}
          {focusLabel ? ` · ${focusLabel}` : ""}
        </p>
        <h1 className="text-display mt-1.5">{title}</h1>
        <p className="mt-1.5 text-[13px] font-medium text-ink-2">
          <T en="Active Listening Training" zh="主动听力训练" /> — 认识 ≠ 听得出来
        </p>
      </header>

      {/* the player travels with you through every step */}
      {/* eslint-disable-next-line react-hooks/refs -- controller object carries the ref; only event handlers read .current */}
      <AudioPlayerBar c={audio} />

      {/* phase stepper */}
      <div className="mb-8 mt-8 flex flex-wrap items-center gap-1.5">
        {PHASES.map((p) => (
          <button
            key={p.key}
            disabled={!["first", "again"].includes(phase) && p.key === "first"}
            onClick={() => (p.key === phase ? undefined : (["done"].includes(phase) ? undefined : setPhase(p.key)))}
            className={`press rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
              phase === p.key
                ? "chip-on"
                : PHASES.findIndex((x) => x.key === phase) > PHASES.findIndex((x) => x.key === p.key)
                  ? "bg-ok/[0.10] text-ok-text"
                  : "chip"
            }`}
          >
            {p.no} {p.zh}
          </button>
        ))}
      </div>

      {phase === "first" && (
        <FirstListen onNext={() => setPhase("again")} />
      )}
      {phase === "again" && (
        <DetectMisses
          contentId={contentId}
          // eslint-disable-next-line react-hooks/refs -- controller passed for event handlers only
          audio={audio}
          clips={clips}
          savedVocab={savedVocab}
          onNext={() => setPhase(transcriptNeeded && clips.length === 0 ? "reveal" : "recall")}
        />
      )}
      {phase === "recall" && (
        <ListenRecall targets={targets} replay={() => audio.seekAndPlay(0)} onNext={() => setPhase("reveal")} />
      )}
      {phase === "reveal" && (
        <RevealAnalyze
          contentId={contentId}
          clips={clips}
          targets={targets}
          savedVocab={savedVocab}
          transcriptNeeded={transcriptNeeded}
          onAttached={() => router.refresh()}
          onNext={() => setPhase("shadow")}
        />
      )}
      {phase === "shadow" && (
        <ShadowPhase contentId={contentId} clips={clips} onNext={() => setPhase("retrieve")} />
      )}
      {phase === "retrieve" && (
        <ListenRetrieval targets={targets} onNext={() => setPhase("transfer")} />
      )}
      {phase === "transfer" && (
        <SpeakingTransfer targets={targets} onNext={() => setPhase("done")} />
      )}
      {phase === "done" && (
        <SessionDone
          targets={targets}
          onHome={() => {
            markStepAction("listening");
            router.push("/");
          }}
        />
      )}
    </div>
  );
}

/* ── STEP 1 — global comprehension, no transcript, no Chinese ────────────── */

/** Honest mic feedback — a recognition session that dies instantly almost
 *  always means permissions/device/network; never fail silently. */
function VoiceError({ error }: { error: string | null | undefined }) {
  if (!error || error === "aborted") return null;
  const map: Record<string, { en: string; zh: string }> = {
    "not-allowed": {
      en: "Microphone blocked — allow mic access in the browser (address-bar icon), or type instead.",
      zh: "麦克风被拒绝——请在浏览器地址栏允许麦克风权限，或直接打字输入。",
    },
    "service-not-allowed": {
      en: "This browser view can't use the microphone — open the page in Chrome/Edge, or type instead.",
      zh: "当前浏览器环境无法使用麦克风——请用 Chrome/Edge 打开本页，或直接打字输入。",
    },
    "audio-capture": {
      en: "No microphone found — check the device, or type instead.",
      zh: "未找到麦克风设备——请检查设备，或直接打字输入。",
    },
    "no-speech": {
      en: "No speech detected — speak right after clicking, or type instead.",
      zh: "没有检测到语音——点击后请立即开口说话，或直接打字输入。",
    },
    network: {
      en: "Speech recognition needs internet — check the connection, or type instead.",
      zh: "语音识别需要联网——请检查网络，或直接打字输入。",
    },
  };
  const m = map[error] ?? { en: `Voice input error: ${error} — you can type instead.`, zh: `语音输入出错：${error}——也可以直接打字输入。` };
  return (
    <p className="mt-2 text-[12px] leading-relaxed text-err-text">
      <T en={m.en} zh={m.zh} />
    </p>
  );
}

function FirstListen({ onNext }: { onNext: () => void }) {
  const [mainIdea, setMainIdea] = useState("");
  const [understood, setUnderstood] = useState("");
  const { rec, live } = useVoiceDraft(understood, setUnderstood);

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="card-specular rounded-2xl bg-surface p-7">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          STEP 1 · <T en="Listen for Meaning" zh="听大意" />
        </div>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <T
            en="No transcript. No Chinese. No word hints. Just listen for the overall meaning — who is talking, about what, why."
            zh="无转写、无中文、无词提示。只抓大意：谁在说、说什么、为什么。"
          />
        </p>
        <p className="mt-4 text-[12px] text-ink-3">
          <T
            en="Use the player above — play, pause, scrub back to any moment. Then answer below."
            zh="用上方播放器——播放、暂停、随时拖回去重听，然后在下方作答。"
          />
        </p>
      </div>

      <div className="card-specular space-y-4 rounded-2xl bg-white p-7">
        <div>
          <label className="mb-1.5 block text-[13.5px] font-semibold text-ink">
            <T en="What is this mainly about?" zh="这段话主要在讲什么？" />
          </label>
          <input
            value={mainIdea}
            onChange={(e) => setMainIdea(e.target.value)}
            placeholder="e.g. Two people arranging a trip / A guide explaining a museum…"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13.5px] font-semibold text-ink">
            <T en="What did you understand? (rough is fine)" zh="你听懂了哪些？（粗略即可）" />
          </label>
          <textarea
            value={live}
            onChange={(e) => setUnderstood(e.target.value)}
            rows={3}
            placeholder="Type what you caught — fragments count. 说出/写出你抓到的碎片。"
            className={`${inputCls} resize-none`}
          />
          {rec.supported && (
            <>
              <button
                onClick={() => (rec.state === "listening" ? rec.stop() : rec.start())}
                className={`press mt-2 rounded-xl px-3.5 py-2 text-[12.5px] font-medium ${
                  rec.state === "listening" ? "bg-[#ff3b30] text-white" : "bg-[#0071e3]/10 text-[#0068d0]"
                }`}
              >
                {rec.state === "listening" ? "● recording… click to stop 点击停止" : "🎤 or speak your answer"}
              </button>
              <VoiceError error={rec.lastError} />
            </>
          )}
        </div>
        <button onClick={onNext} disabled={!mainIdea.trim()} className={`${btn.primary} w-full`}>
          <T en="Now find what you missed →" zh="进入漏听定位 →" />
        </button>
      </div>
    </div>
  );
}

/* ── STEP 2 — detect the misses + error taxonomy ─────────────────────────── */

const CATEGORIES = Object.entries(MISS_LABELS) as [keyof typeof MISS_LABELS, { en: string; zh: string }][];

function DetectMisses({
  contentId,
  audio,
  clips,
  savedVocab,
  onNext,
}: {
  contentId: number;
  audio: AudioController;
  clips: ListenClip[];
  savedVocab: string[];
  onNext: () => void;
}) {
  const [misses, setMisses] = useState<{ missed: string; category: keyof typeof MISS_LABELS; known: boolean }[]>([]);
  const [draft, setDraft] = useState("");
  const [cat, setCat] = useState<keyof typeof MISS_LABELS>("connected_speech");
  const [pending, start] = useTransition();

  const vocabSet = useMemo(() => new Set(savedVocab), [savedVocab]);

  const addMiss = () => {
    const text = draft.trim();
    if (!text) return;
    const firstWord = text.toLowerCase().replace(/[^a-z'-]/g, "").split(/\s+/)[0] ?? "";
    const known = vocabSet.has(firstWord);
    setMisses((m) => [...m, { missed: text, category: cat, known }]);
    start(async () => {
      await saveMissAction({ contentId, missed: text, category: cat });
    });
    setDraft("");
  };

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="card-specular rounded-2xl bg-surface p-7">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          STEP 2 · <T en="Detect What You Missed" zh="定位漏听" />
        </div>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <T
            en="Listen again. This time hunt for the exact words and phrases you DIDN'T catch — and diagnose why."
            zh="再听一遍。这次主动搜捕没听清的词句——并诊断原因。系统要知道你“为什么”没听出来。"
          />
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button onClick={() => audio.seekAndPlay(0)} className={`${btn.secondary}`}>
            <Play size={13} strokeWidth={2} />
            <T en="Listen from the start" zh="从头再听" />
          </button>
          <p className="text-[12px] text-ink-3">
            <T
              en="Hear something you missed? Tap “Mark missed” in the player above — it captures the moment for one-tap replay."
              zh="听到没接住的地方？直接点上方播放器的「标记漏听」——自动截取该片段，一键重播。"
            />
          </p>
        </div>
        {audio.segments.length > 0 && (
          <div className="mt-4">
            <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <T en="Missed segments" zh="漏听片段" />
            </p>
            <div className="mt-2 space-y-1.5">
              {audio.segments.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3.5 py-2">
                  <span className="text-[12px] tabular-nums text-ink-2">
                    {audio.fmt(s.start)}–{audio.fmt(s.end)}
                  </span>
                  <button
                    type="button"
                    onClick={() => audio.playSegment(s.start, s.end)}
                    className="press flex items-center gap-1.5 text-[12px] font-medium text-accent-text hover:underline"
                  >
                    <Play size={10} strokeWidth={2.4} />
                    <T en="Replay segment" zh="重播该段" />
                  </button>
                  <button
                    type="button"
                    onClick={() => audio.removeSegment(s.id)}
                    className="ml-auto text-[12px] text-ink-3 hover:text-ink"
                  >
                    <T en="remove" zh="移除" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card-specular space-y-4 rounded-2xl bg-white p-7">
        <label className="block">
          <span className="mb-1.5 block text-[13.5px] font-semibold text-ink">
            <T en="I heard something like…" zh="我听到了类似……（但没接住的）" />
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. take up… / something about a form…"
            className={inputCls}
            onKeyDown={(e) => e.key === "Enter" && addMiss()}
          />
        </label>

        <div>
          <span className="mb-2 block text-[12px] font-medium text-ink-2">
            <T en="Why did you miss it?" zh="为什么没听出来？" />
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCat(key)}
                title={label.en}
                className={`press rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  cat === key ? "chip-on" : "chip"
                }`}
              >
                {label.zh}
              </button>
            ))}
          </div>
        </div>

        <button onClick={addMiss} disabled={!draft.trim() || pending} className={btn.secondary}>
          <T en="+ Record this miss" zh="＋ 记录这条漏听" />
        </button>

        {misses.length > 0 && (
          <div className="space-y-2 border-t border-black/[0.06] pt-4">
            {misses.map((m, i) => (
              <div key={i} className="enter flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-3.5 py-2.5">
                <span className="text-[13px] italic text-ink">{m.missed}</span>
                <Badge tone="neutral">{MISS_LABELS[m.category].zh}</Badge>
                {m.known && (
                  <Badge tone="warn">
                    <T en="Known but not recognized!" zh="认识但听不出" />
                  </Badge>
                )}
              </div>
            ))}
            <button onClick={onNext} className={`${btn.primary} w-full`}>
              <T en="Recall from memory →" zh="凭记忆回忆 →" />
            </button>
          </div>
        )}
        {misses.length === 0 && (
          <button onClick={onNext} className={btn.ghost}>
            <T en="caught everything this round — skip →" zh="这轮全接住了，跳过 →" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── STEP 3 — listening recall (cloze from memory) ────────────────────────── */

function ListenRecall({
  targets,
  replay,
  onNext,
}: {
  targets: ListenTarget[];
  replay: () => void;
  onNext: () => void;
}) {
  const usable = targets.filter((t) => t.cloze).slice(0, 3);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});

  if (usable.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card-specular rounded-2xl bg-white p-8 text-center">
          <p className="text-sm text-ink-2">
            <T
              en="No cloze targets in this material — straight to the transcript."
              zh="本材料暂无填空靶点——直接进入转写对照。"
            />
          </p>
          <button onClick={onNext} className={`${btn.primary} mt-4`}>
            <T en="Reveal transcript →" zh="查看转写 →" />
          </button>
        </div>
      </div>
    );
  }

  const allDone = usable.every((t) => results[t.chunkId] !== undefined);

  return (
    <div className="enter mx-auto max-w-2xl space-y-3">
      <div className="card-specular rounded-2xl bg-white px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          STEP 3 · <T en="Listening Recall" zh="听后回忆" />
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          <T
            en="No transcript yet. Play each sentence and fill the blank FROM MEMORY — this is retrieval, not reading."
            zh="还不给转写。播放句子，凭记忆填空——这是提取，不是阅读。"
          />
        </p>
      </div>

      {usable.map((t) => (
        <div key={t.chunkId} className="card-specular rounded-2xl bg-white p-6">
          <div className="flex items-start justify-between gap-3 rounded-xl bg-[#0071e3]/[0.05] px-4 py-3">
            <p className="text-[15.5px] font-medium leading-relaxed text-ink">{t.cloze}</p>
            <button
              onClick={replay}
              aria-label="Replay audio"
              className="press flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[12px] font-medium text-ink-2 hover:text-ink"
            >
              <Play size={11} strokeWidth={2.2} className="text-accent-text" />
              <T en="replay" zh="重听" />
            </button>
          </div>
          <input
            value={answers[t.chunkId] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [t.chunkId]: e.target.value }))}
            disabled={results[t.chunkId] !== undefined}
            placeholder="what goes in the blank?"
            className={`${inputCls} mt-3`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && answers[t.chunkId]?.trim()) {
                const ok = CHUNK_DETECT[t.text]?.test(answers[t.chunkId]) ?? false;
                setResults((r) => ({ ...r, [t.chunkId]: ok }));
                if (ok) logEventAction(t.chunkId, "listen_recall", answers[t.chunkId]);
              }
            }}
          />
          {results[t.chunkId] !== undefined && (
            <p className={`enter mt-2 text-[13px] ${results[t.chunkId] ? "text-[#1f7a37]" : "text-ink-2"}`}>
              {results[t.chunkId]
                ? "✓ Retrieved it from sound alone."
                : `✗ The blank was “${t.text}” — ${t.pattern || t.meaningEn}`}
            </p>
          )}
        </div>
      ))}

      {allDone && (
        <button onClick={onNext} className={`${btn.primary} w-full`}>
          <T en="Reveal the transcript →" zh="揭晓转写 →" />
        </button>
      )}
    </div>
  );
}

/* ── STEP 4+5 — transcript reveal + spoken-English analysis ──────────────── */

function RevealAnalyze({
  contentId,
  clips,
  targets,
  savedVocab,
  transcriptNeeded,
  onAttached,
  onNext,
}: {
  contentId: number;
  clips: ListenClip[];
  targets: ListenTarget[];
  savedVocab: string[];
  transcriptNeeded: boolean;
  onAttached: () => void;
  onNext: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [busy, start] = useTransition();

  if (clips.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card-specular rounded-2xl bg-white p-7">
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            STEP 4 · <T en="Transcript" zh="转写" />
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            <T
              en="This is a real recording whose transcript isn't stored locally (the source PDF is a scan, and we don't fabricate text). If you have the book, paste the transcript — line-level analysis activates instantly."
              zh="这是真实录音，但本地没有配套转写（源 PDF 是扫描件，我们不伪造文本）。如果你手头有书，把转写贴进来——逐句分析立即激活。"
            />
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            placeholder="Paste the transcript here… 粘贴转写文本"
            className={`${inputCls} mt-4 resize-y font-[450] leading-relaxed`}
          />
          <button
            disabled={busy || !paste.trim()}
            onClick={() =>
              start(async () => {
                const res = await attachTranscriptAction({ contentId, transcript: paste });
                if (res.ok) {
                  toast("Transcript attached — full analysis unlocked", "success");
                  onAttached();
                } else {
                  toast(res.error ?? "failed", "warn");
                }
              })
            }
            className={`${btn.primary} mt-3 w-full`}
          >
            {busy ? "…" : <T en="Attach transcript →" zh="附上转写 →" />}
          </button>
        </div>
        <button onClick={onNext} className={btn.ghost}>
          <T en="skip — keep training without transcript →" zh="跳过（无转写继续）→" />
        </button>
      </div>
    );
  }

  const vocabSet = new Set(savedVocab);

  return (
    <div className="enter space-y-3">
      <div className="mx-auto max-w-2xl">
        <div className="card-specular rounded-2xl bg-white px-6 py-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            STEP 4+5 · <T en="Written ↔ Natural speech" zh="书面语 ↔ 自然语流" />
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            <T
              en="Each line: what was written, what it actually sounds like, where the stress falls, and why your ear lost it."
              zh="逐句对照：写下来的样子、真实的声音、重音落点——以及你的耳朵为什么丢了它。"
            />
          </p>
        </div>
      </div>

      {clips.map((c) => {
        const stress = stressLine(c.text);
        const into = intonationOf(c.text);
        return (
          <div key={c.id} className="mx-auto max-w-2xl card-specular rounded-2xl bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] leading-relaxed text-ink">
                {c.speaker && (
                  <span className="mr-2 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[12px] font-semibold text-ink-2">{c.speaker}</span>
                )}
                {c.text}
              </p>
              <SpeakBtn text={c.text} />
            </div>

            <div className="mt-3 grid gap-2 rounded-xl bg-black/[0.025] p-3.5 sm:grid-cols-2">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Natural speech</div>
                <p className="mt-0.5 font-mono text-[13px] text-[#8a43b8]">{naturalForm(c.text)}</p>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Stress skeleton</div>
                <p className="mt-0.5 font-mono text-[12.5px] font-semibold text-ink">{stress.display}</p>
              </div>
            </div>

            {c.phenomena.length > 0 && (
              <div className="mt-2.5 space-y-1.5 border-t border-black/[0.05] pt-2.5">
                {c.phenomena.map((p, i) => {
                  const knownMissed = vocabSet.has(p.span.toLowerCase().split(" ")[0]);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-[12px]">
                      <Badge tone="purple">{p.type.replace("_", " ")}</Badge>
                      <span className="font-mono text-ink">{p.span}</span>
                      <span className="text-ink-3">→</span>
                      <span className="font-mono font-semibold text-[#8a43b8]">{p.spoken}</span>
                      {knownMissed && (
                        <Badge tone="warn">
                          <T en="you know this word — train the ear" zh="认识这词，练耳朵" />
                        </Badge>
                      )}
                      <span className="w-full text-ink-2">{p.note}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-2.5 flex items-start gap-2 text-[12px] text-ink-2">
              <Badge tone={into.contour === "rising" ? "success" : "neutral"}>↗↘ {into.contour}</Badge>
              <span>{into.note}</span>
            </div>
          </div>
        );
      })}

      <div className="mx-auto max-w-2xl">
        <button onClick={onNext} className={`${btn.primary} w-full`}>
          <T en="Pick a line and shadow it →" zh="选一句开始跟读 →" />
        </button>
      </div>
    </div>
  );
}

function SpeakBtn({ text }: { text: string }) {
  const { speak, speaking, stop } = useSpeech();
  return (
    <button
      onClick={() => (speaking ? stop() : speak(text, 0.9))}
      className="press shrink-0 rounded-lg bg-black/[0.05] px-2.5 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-black/[0.09]"
    >
      {speaking ? "■" : "▶ line"}
    </button>
  );
}

/* ── STEP 6 — shadowing with honest, phenomenon-driven coaching ──────────── */

function ShadowPhase({ contentId, clips, onNext }: { contentId: number; clips: ListenClip[]; onNext: () => void }) {
  const pickable = clips.filter((c) => c.text.split(/\s+/).length >= 5 && c.text.split(/\s+/).length <= 30).slice(0, 6);
  const [selected, setSelected] = useState<ListenClip | null>(pickable[0] ?? null);
  const { speak, stop, speaking } = useSpeech();
  const rec = useRecorder();
  const [attempts, setAttempts] = useState(0);
  const [, start] = useTransition();

  if (!selected) {
    return (
      <div className="mx-auto max-w-2xl card-specular rounded-2xl bg-white p-8 text-center">
        <p className="text-sm text-ink-2">
          <T en="No shadowable line yet — attach a transcript first." zh="还没有可跟读的句子——先附上转写。" />
        </p>
        <button onClick={onNext} className={`${btn.primary} mt-4`}>
          <T en="Continue →" zh="继续 →" />
        </button>
      </div>
    );
  }

  const stress = stressLine(selected.text);
  const coach: Record<string, string> = {
    Stress: stress.stressed.length
      ? `Main beat on: ${stress.stressed.map((w) => `"${w}"`).join(", ")} — everything else stays small. If your stress is even, the rhythm sounds foreign before the sounds do.`
      : "Keep the content words loud, the glue words small.",
    Chunking: selected.phenomena.some((p) => p.type === "reduction" || p.type === "linking")
      ? `${selected.phenomena.filter((p) => p.type === "reduction" || p.type === "linking").map((p) => `"${p.span}" = one chunk (${p.spoken})`).join("; ")} — do NOT pause between them.`
      : "Group words into meaning chunks; pause at commas, not between words.",
    Reduction: selected.phenomena.some((p) => p.type === "reduction")
      ? `Say the reduced form out loud (${selected.phenomena.filter((p) => p.type === "reduction").map((p) => p.spoken).join(", ")}) — full forms break the rhythm.`
      : "No strong reductions in this line — focus on linking.",
    Intonation: intonationOf(selected.text).note,
    Pausing: "One breath per line. If you run out of air, the line is too long — shadow half of it first.",
  };

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="card-specular rounded-2xl bg-white px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          STEP 6 · <T en="Shadowing — build speech patterns, not an accent" zh="影子跟读——建语感，不学口音" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pickable.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelected(c);
                rec.reset();
              }}
              className={`press max-w-full truncate rounded-lg px-2.5 py-1 text-[12px] ${
                selected.id === c.id ? "chip-on" : "chip"
              }`}
            >
              {c.text.slice(0, 30)}…
            </button>
          ))}
        </div>
      </div>

      <div className="card-specular rounded-2xl bg-white p-6">
        <p className="rounded-xl bg-black/[0.03] px-4 py-3 text-[15px] leading-relaxed text-ink">{selected.text}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button onClick={() => (speaking ? stop() : speak(selected.text, 0.9))} className={btn.primary}>
            {speaking ? <T en="1. Stop model" zh="1. 停止示范" /> : <T en="1. Listen to model" zh="1. 听示范" />}
          </button>
          <button
            onClick={() => (rec.recording ? rec.stop() : rec.start())}
            className={`press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium ${
              rec.recording ? "bg-[#ff3b30] text-white" : "bg-white text-ink shadow-[0_0_0_0.5px_rgba(0,0,0,0.12)]"
            }`}
          >
            {rec.recording && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
            {rec.recording ? "● 2. Recording — tap to stop" : "🎤 2. Record yourself"}
          </button>
          {rec.url && <audio controls src={rec.url} className="h-9" />}
        </div>

        {rec.url && (
          <div className="enter mt-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <T en="Coach notes for this line" zh="本句教练要点" /> · {attempts + 1}
                <T en=" attempt" zh="次尝试" />
              </div>
              <Badge tone="warn">self-guided · 接入评测 API 后自动升级</Badge>
            </div>
            {Object.entries(coach).map(([dim, note]) => (
              <div key={dim} className="rounded-xl bg-black/[0.03] px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">{dim}: </span>
                {note}
              </div>
            ))}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => {
                  setAttempts((a) => a + 1);
                  rec.reset();
                  toast("Listen once more, then record again — 2 focused reps beat 10 sloppy ones", "default");
                }}
                className={btn.secondary}
              >
                ↺ <T en="Retry this line" zh="再试这句" />
              </button>
              <button
                onClick={() =>
                  start(async () => {
                    await saveShadowAction({
                      contentId,
                      clipId: selected.id,
                      clipText: selected.text,
                      analysis: coach,
                    });
                    onNext();
                  })
                }
                className={btn.primary}
              >
                <T en="Save & continue →" zh="保存并继续 →" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── STEP 7 — listening retrieval into the SM-2 queue ─────────────────────── */

function ListenRetrieval({ targets, onNext }: { targets: ListenTarget[]; onNext: () => void }) {
  const usable = targets.filter((t) => t.retrievalItemId > 0).slice(0, 4);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ quality: number; verdict: string; targetAnswer: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { speak } = useSpeech();
  const t = usable[idx];

  if (!t) {
    return (
      <div className="mx-auto max-w-2xl card-specular rounded-2xl bg-white p-8 text-center">
        <p className="text-sm text-ink-2">No retrieval items from this material yet.</p>
        <button onClick={onNext} className={`${btn.primary} mt-4`}>→</button>
      </div>
    );
  }

  const submit = async (skip = false) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/review/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retrievalItemId: t.retrievalItemId, mode: "production", response: skip ? "" : answer }),
    });
    setResult(await res.json());
    setBusy(false);
  };

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="card-specular rounded-2xl bg-white px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          STEP 7 · <T en="Listening Retrieval — sound in, production out" zh="听境提取——听进去，产出来" />
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          <T
            en="Tomorrow these return by SOUND, not by translation. Graded by the same scheduler as everything else."
            zh="明天它们将以声音回归，而非翻译提示。与全局同一套 SM-2 调度。"
          />
        </p>
      </div>

      <div className="card-specular rounded-2xl bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[12px] text-ink-3">{idx + 1}/{usable.length}</span>
          {t.clozeAudio && (
            <button
              onClick={() => speak(t.clozeAudio ?? "", 0.9)}
              className="press rounded-lg bg-[#0071e3]/10 px-3 py-1.5 text-[12px] font-medium text-[#0068d0]"
            >
              ▶ <T en="play the situation" zh="播放情境" />
            </button>
          )}
        </div>
        <p className="rounded-xl bg-[#0071e3]/[0.05] px-4 py-3 text-[16px] font-medium leading-relaxed text-ink">
          {t.cloze ?? t.meaningZh}
        </p>
        {!result ? (
          <div className="mt-4 space-y-2.5">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="fill the blank / produce the expression"
              className={`${inputCls} text-[15px]`}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <div className="flex gap-2.5">
              <button onClick={() => submit()} disabled={busy || !answer.trim()} className={btn.primary}>
                {busy ? "…" : <T en="Submit" zh="提交" />}
              </button>
              <button onClick={() => submit(true)} disabled={busy} className={btn.ghost}>
                想不起来
              </button>
            </div>
          </div>
        ) : (
          <div className="enter mt-4 space-y-3">
            <div
              className={`rounded-xl px-4 py-3 ${
                result.quality === 5 ? "bg-[#34c759]/[0.09]" : result.quality === 3 ? "bg-[#ff9f0a]/[0.1]" : "bg-[#ff3b30]/[0.07]"
              }`}
            >
              <p className="text-[13.5px] font-semibold text-ink">
                {result.quality === 5 ? "✓" : result.quality === 3 ? "◑" : "✗"} {result.verdict}
              </p>
              {result.quality < 5 && (
                <p className="mt-1 text-[13px] text-ink">
                  <span className="text-ink-3">Target:</span> <b>{result.targetAnswer}</b>
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setResult(null);
                setAnswer("");
                if (idx + 1 >= usable.length) onNext();
                else setIdx(idx + 1);
              }}
              className={`${btn.primary} w-full`}
            >
              {idx + 1 >= usable.length ? <T en="Into speaking →" zh="进入口语迁移 →" /> : <T en="Next →" zh="下一个 →" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── STEP 8 — speaking transfer ───────────────────────────────────────────── */

function SpeakingTransfer({ targets, onNext }: { targets: ListenTarget[]; onNext: () => void }) {
  const first = targets[0];
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const { rec, live } = useVoiceDraft(text, setText);

  if (!first) {
    return (
      <div className="mx-auto max-w-2xl card-specular rounded-2xl bg-white p-8 text-center">
        <p className="text-sm text-ink-2">Nothing to transfer yet.</p>
        <button onClick={onNext} className={`${btn.primary} mt-4`}>→</button>
      </div>
    );
  }

  const submit = async () => {
    if (!live.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: first.speakingPrompt,
          transcript: live,
          requiredChunkIds: targets.map((t) => t.chunkId),
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        setFeedback(data.feedback);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enter mx-auto max-w-2xl space-y-4">
      <div className="card-specular rounded-2xl bg-white px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          STEP 8 · <T en="Speaking Transfer — what you heard, you now say" zh="口语迁移——听过的，现在说出来" />
        </div>
      </div>
      <div className="card-specular rounded-2xl bg-white p-6">
        <p className="text-[16.5px] font-medium leading-relaxed text-ink">{first.speakingPrompt}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <Badge key={t.chunkId} tone="accent">
              {t.text}
            </Badge>
          ))}
        </div>
        <textarea
          value={live}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Speak or type — use what you just trained your ear on…"
          className={`${inputCls} mt-4 resize-none`}
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          {rec.supported && (
            <>
              <button
                onClick={() => (rec.state === "listening" ? rec.stop() : rec.start())}
                className={`press rounded-xl px-3.5 py-2 text-[12.5px] font-medium ${
                  rec.state === "listening" ? "bg-[#ff3b30] text-white" : "bg-[#0071e3]/10 text-[#0068d0]"
                }`}
              >
                {rec.state === "listening" ? "● stop 停止" : "🎤 Speak"}
              </button>
              <VoiceError error={rec.lastError} />
            </>
          )}
          <button onClick={submit} disabled={busy || !live.trim()} className={btn.primary}>
            {busy ? "…" : <T en="Submit" zh="提交" />}
          </button>
        </div>

        {feedback && (
          <div className="enter mt-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid flex-1 grid-cols-5 gap-2">
                {[
                  ["Fluency", feedback.ielts.fluency],
                  ["Coherence", feedback.ielts.coherence],
                  ["Lexical", feedback.ielts.lexical],
                  ["Grammar", feedback.ielts.grammar],
                  ["Overall", feedback.overallEstimate],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-black/[0.03] py-2 text-center">
                    <div className="text-[12px] font-semibold uppercase text-ink-3">{l as string}</div>
                    <div className="font-mono text-[15px] font-semibold tabular-nums text-ink">{v as number}</div>
                  </div>
                ))}
              </div>
              {feedback.isMock && <MockBadge />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {feedback.chunksUsed.map((c) => (
                <Badge key={c.text} tone={c.used ? "success" : "warn"}>
                  {c.used ? "✓" : "○"} {c.text}
                </Badge>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2">{feedback.summary}</p>
            <button onClick={onNext} className={`${btn.primary} w-full`}>
              <T en="Finish session ✓" zh="完成本节 ✓" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── done — the honest state ladder ──────────────────────────────────────── */

function SessionDone({ targets, onHome }: { targets: ListenTarget[]; onHome: () => void }) {
  return (
    <div className="enter mx-auto max-w-2xl">
      <div className="card-specular rounded-2xl bg-white p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#34c759]/15 text-[22px]">🎧</div>
        <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
          <T en="Listening session complete" zh="听力训练完成" />
        </h3>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
          <T
            en="You diagnosed WHY you missed what you missed, rebuilt the sound of each line, and moved today's expressions into your speaking queue."
            zh="你诊断了每处漏听的原因，重建了每句的声音形态，并把今天的表达带进了口语队列——下次听到它们，耳朵已经认识。"
          />
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
          {[
            ["Exposure", "接触"],
            ["Understanding", "大意"],
            ["Recognition", "辨音"],
            ["Recall", "回忆"],
            ["Shadowing", "跟读"],
            ["Retrieval", "提取"],
            ["Speaking", "口语"],
            ["Retained", "留存"],
          ].map(([en, zh], i) => (
            <div key={en} className={`rounded-xl px-3 py-2.5 text-center ${i < 7 ? "bg-[#34c759]/[0.09]" : "bg-black/[0.03]"}`}>
              <div className="text-[12px] font-semibold text-ink">{zh}</div>
              <div className="text-[12px] text-ink-3">{en}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">
          <T en="Retained is earned after 7+ days of sound-based retrieval — the ladder doesn't lie." zh="留存 = 7 天后仍能凭声提取，最后一格从不送分。" />
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <button onClick={onHome} className={btn.primary}>
            ← Mission Control
          </button>
          <Link href="/library" className={btn.secondary}>
            <T en="Next material →" zh="下一段材料 →" />
          </Link>
        </div>
      </div>
    </div>
  );
}
