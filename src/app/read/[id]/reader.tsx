"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addWordTargetAction, markStepAction, recordExposureAction, saveVocabAction, logEventAction } from "@/app/actions";
import { Badge, MockBadge, btn } from "@/components/ui";
import { Drawer, ElapsedWait, Fold, toast } from "@/components/motion";
import { ChineseReveal, SentenceAnalysisView } from "@/components/learn";
import { T } from "@/components/i18n";
import { AskTutor } from "@/components/ask-tutor";
import type { SentenceAnalysis, WordAnalysis } from "@/lib/types";

/* ── Active Reading Lab · Phase A (INPUT + NOTICE) ──────────────────────────
 * English-only article. Words are clicked, not translated: the learner
 * guesses FIRST (meaning + pos), then the English definition reveals,
 * Chinese stays behind an explicit request. The rail tracks today's
 * target expressions for the study session that follows. */

export interface RailTarget {
  chunkId: number; // user-owned chunk id
  corpusId?: number;
  text: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  saved: boolean;
}

/** A word tapped in the article, promoted to a study target (server-built). */
export interface AdHocTarget {
  chunkId: number;
  retrievalItemId: number;
  text: string;
  pattern: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  zhCue: string;
  transferInstruction: string;
  transferSentence: string | null;
  ieltsQuestion: string;
}

/** Target expressions to mark inside the article text (id = chunkId). */
export interface HighlightTarget {
  id: number;
  text: string;
  selected: boolean;
}

/** Map part-index → hit info for one sentence (first occurrence per target). */
function targetHitsFor(parts: string[], targets: HighlightTarget[]) {
  // split(/(\s+)/) interleaves words with whitespace parts — build a
  // consecutive word subsequence and slide over that, mapping hits back.
  const partOfWord: number[] = [];
  const wordSeq: string[] = [];
  parts.forEach((p, i) => {
    const w = p.trim() ? p.replace(/[^A-Za-z'’-]/g, "").toLowerCase() : "";
    if (w) {
      partOfWord.push(i);
      wordSeq.push(w);
    }
  });
  const byPart = new Map<number, { hit: { id: number; selected: boolean }; isFirst: boolean }>();
  for (const t of targets) {
    let seq = t.text.toLowerCase().replace(/[^a-z'’\s-]/g, " ").split(/\s+/).filter(Boolean);
    // try the full phrase first; articles often phrase the tail differently
    // ("keep up with" vs "keep up") so fall back to shorter prefixes (min 2)
    while (seq.length >= 2) {
      let hit = false;
      for (let i = 0; i + seq.length <= wordSeq.length; i++) {
        if (seq.every((w, k) => wordSeq[i + k] === w)) {
          const start = partOfWord[i];
          const end = partOfWord[i + seq.length - 1];
          for (let p = start; p <= end; p++) {
            byPart.set(p, { hit: { id: t.id, selected: t.selected }, isFirst: p === start });
          }
          hit = true;
          break;
        }
      }
      if (hit) break;
      seq = seq.slice(0, -1);
    }
  }
  return byPart;
}

export function ArticlePhase({
  contentId,
  paragraphs,
  tiers,
  savedVocab,
  onAddTarget,
  interactive = true,
  chunkToOpen,
  highlightTargets = [],
  children,
}: {
  contentId: number;
  paragraphs: { id: number; text: string }[][];
  tiers: Record<string, string>;
  savedVocab: string[];
  onAddTarget?: (t: AdHocTarget) => void;
  /** read phase = full word interaction; study+ keeps the article visible but quiet */
  interactive?: boolean;
  /** rail (lab-level panel) asks to open a chunk's guess drawer */
  chunkToOpen?: RailTarget | null;
  /** session targets marked in-text: selected ones get the accent underline */
  highlightTargets?: HighlightTarget[];
  children?: React.ReactNode; // slot after the article (CTA etc.)
}) {
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set(savedVocab));
  const [wordCard, setWordCard] = useState<{ word: string; sentence: string; rect: DOMRect } | null>(null);
  const [drawerSentence, setDrawerSentence] = useState<{ id: number; text: string } | null>(null);
  const [drawerChunk, setDrawerChunk] = useState<RailTarget | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState("");

  // the rail lives in the lab-level panel and requests this drawer via prop.
  // Consumed during render, identity-guarded — the lab passes a fresh object
  // per rail click, so the same chunk can be re-opened later.
  const [syncedChunk, setSyncedChunk] = useState<RailTarget | null>(null);
  if (chunkToOpen && chunkToOpen !== syncedChunk) {
    setSyncedChunk(chunkToOpen);
    setDrawerChunk(chunkToOpen);
  }

  useEffect(() => {
    recordExposureAction(contentId);
  }, [contentId]);

  return (
    <div>
      <article className="reader-text min-w-0 max-w-[42rem]">
        {paragraphs.map((para, pi) => (
          <p key={pi} className="mb-5">
            {para.map((s) => (
            <SentenceSpan
              key={s.id}
              sentence={s}
              tiers={tiers}
              savedWords={savedWords}
              interactive={interactive}
              highlightTargets={highlightTargets}
              onWordClick={(word, rect) => setWordCard({ word, sentence: s.text, rect })}
              onAnalyze={() => setDrawerSentence(s)}
            />
            ))}
          </p>
        ))}
        {children}
      </article>

      <WordQuickLook
        key={wordCard?.word}
        card={wordCard}
        contentId={contentId}
        savedWords={savedWords}
        onSaved={(w) => setSavedWords((s) => new Set([...s, w]))}
        onAddTarget={onAddTarget}
        onClose={() => setWordCard(null)}
      />

      <Drawer
        open={!!drawerSentence}
        onClose={() => setDrawerSentence(null)}
        title={
          <span className="flex items-center gap-2">
            Sentence Analysis
            <button
              onClick={() => { setTutorQuestion(`Explain this sentence: "${drawerSentence?.text}"`); setTutorOpen(true); }}
              className="press rounded-lg bg-[#0071e3]/10 px-2 py-0.5 text-[10.5px] font-medium text-[#0068d0]"
            >
              🤖 <T en="Ask Tutor" zh="问导师" />
            </button>
          </span>
        }
        subtitle="Meaning · structure · why this expression · native logic · alternatives · transfer"
      >
        {drawerSentence && <SentencePanel sentence={drawerSentence} />}
      </Drawer>

      <Drawer
        open={!!drawerChunk}
        onClose={() => setDrawerChunk(null)}
        title={drawerChunk?.text}
        subtitle="Notice → guess → then the system explains"
      >
        {drawerChunk && <ChunkGuessPanel chunk={drawerChunk} />}
      </Drawer>

      <AskTutor
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
        initialQuestion={tutorQuestion}
        pageContext="reading"
      />
    </div>
  );
}

/* ── Sentence with word spans ─────────────────────────────────────────────── */

function SentenceSpan({
  sentence,
  tiers,
  savedWords,
  interactive,
  highlightTargets,
  onWordClick,
  onAnalyze,
}: {
  sentence: { id: number; text: string };
  tiers: Record<string, string>;
  savedWords: Set<string>;
  interactive: boolean;
  highlightTargets: HighlightTarget[];
  onWordClick: (word: string, rect: DOMRect) => void;
  onAnalyze: () => void;
}) {
  const parts = sentence.text.split(/(\s+)/);
  const hits = targetHitsFor(parts, highlightTargets);
  return (
    <span className="sentence group/s relative inline">
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        const word = part.replace(/[^A-Za-z'’-]/g, "");
        if (!word) return part;
        const key = word.toLowerCase();
        const tier = tiers[key] ?? "core";
        const saved = savedWords.has(key);
        // read-only phases keep the tier tint but drop the tap affordance
        const cls = !interactive
          ? "word-readonly"
          : saved
            ? "word word-saved"
            : tier === "advanced"
              ? "word word-advanced"
              : tier === "rare"
                ? "word word-rare"
                : "word";
        // in-text target mark rides on top of the tier class
        const hit = hits.get(i);
        const mark = hit ? (hit.hit.selected ? " word-target-on" : " word-target") : "";
        return (
          <span
            key={i}
            className={cls + mark}
            data-t={hit?.isFirst ? hit.hit.id : undefined}
            onClick={
              interactive
                ? (e) => onWordClick(word, (e.target as HTMLElement).getBoundingClientRect())
                : undefined
            }
          >
            {part}
          </span>
        );
      })}
      <button
        onClick={onAnalyze}
        title="Analyze this sentence"
        className="press ml-1 inline-flex translate-y-[1px] items-center justify-center rounded text-[10.5px] text-ink-3 opacity-0 transition-opacity duration-150 group-hover/s:opacity-100 hover:bg-black/[0.06] hover:text-ink"
        style={{ height: 18, width: 18 }}
      >
        ⌕
      </button>{" "}
    </span>
  );
}

/* ── STEP 2 — Word quick-look: guess first, reveal after ─────────────────── */

function WordQuickLook({
  card,
  contentId,
  savedWords,
  onSaved,
  onAddTarget,
  onClose,
}: {
  card: { word: string; sentence: string; rect: DOMRect } | null;
  contentId: number;
  savedWords: Set<string>;
  onSaved: (w: string) => void;
  onAddTarget?: (t: AdHocTarget) => void;
  onClose: () => void;
}) {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Esc closes — matching the esc hint chip
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);
  const [data, setData] = useState<WordAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [guess, setGuess] = useState("");
  const [guessed, setGuessed] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [pending, start] = useTransition();
  const [addedTarget, setAddedTarget] = useState(false);
  const [targetPending, startTarget] = useTransition();

  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    fetch("/api/ai/word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: card.word, sentenceContext: card.sentence }),
    })
      .then((r) => r.json())
      .then((d: WordAnalysis) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [card?.word]);

  if (!card) return null;
  const saved = savedWords.has(card.word.toLowerCase());

  // desktop popover: anchored under the tapped word, clamped to the viewport
  const rect = card.rect;
  const POP_W = 420;
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - POP_W / 2), window.innerWidth - POP_W - 12);
  const below = rect.bottom + 10;
  const estimatedH = 320;
  const flipUp = below + estimatedH > window.innerHeight;
  const top = flipUp ? Math.max(12, rect.top - estimatedH - 10) : below;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className={
          isDesktop
            ? "material-panel enter absolute w-[420px] max-w-[calc(100vw-24px)] rounded-2xl px-5 py-4 shadow-pop"
            : "material-panel enter absolute bottom-5 left-1/2 w-[min(512px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl px-5 py-4"
        }
        style={isDesktop ? { left, top } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{card.word}</span>
            {data && <Badge tone="neutral">{data.cefr}</Badge>}
            {data?.isMock && <MockBadge />}
          </div>
          <button onClick={onClose} className="press rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink-2 hover:bg-line">
            esc
          </button>
        </div>

        <p className="mb-3 rounded-lg bg-black/[0.03] px-3 py-2 text-[12px] italic leading-relaxed text-ink-2">
          {card.sentence.length > 120 ? card.sentence.slice(0, 120) + "…" : card.sentence}
        </p>

        {!guessed ? (
          <div className="space-y-2.5">
            <p className="text-[13.5px] font-medium text-ink">
              <T
                en={<>What do you think <span className="font-semibold text-[#0068d0]">“{card.word}”</span> means here? Guess first.</>}
                zh={<>你觉得 <span className="font-semibold text-[#0068d0]">“{card.word}”</span> 在这里是什么意思？先猜一猜。</>}
              />
            </p>
            <input
              autoFocus
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="用中文或英文写下你的猜测（your guess — EN or 中文）"
              className="input-base w-full px-3.5 py-2.5 text-sm"
              onKeyDown={(e) => e.key === "Enter" && guess.trim() && setGuessed(true)}
            />
            <div className="flex items-center gap-2">
              <button onClick={() => setGuessed(true)} disabled={!guess.trim()} className={`${btn.primary} px-3 py-1.5 text-[12px]`}>
                <T en="Submit guess →" zh="提交猜测 →" />
              </button>
              <button onClick={() => setGuessed(true)} className={btn.ghost}>
                <T en="no idea — reveal anyway" zh="猜不出 —— 直接揭晓" />
              </button>
            </div>
          </div>
        ) : !showEn ? (
          <div className="space-y-2.5">
            {guess.trim() && (
              <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-[12.5px] text-ink-2">
                <span className="text-ink-3"><T en="Your guess:" zh="你的猜测：" /></span> {guess}
              </p>
            )}
            <button onClick={() => setShowEn(true)} className={`${btn.primary} px-3 py-1.5 text-[12px]`}>
              {loading ? <T en="loading…" zh="加载中…" /> : <T en="Show the English meaning" zh="显示英文释义" />}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"><T en="Contextual meaning" zh="语境含义" /></div>
              <p className="text-[13.5px] leading-relaxed text-ink">{data?.contextualMeaning ?? "—"}</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"><T en="Grammar behaviour" zh="语法行为" /></div>
                <p className="text-[12.5px] leading-relaxed text-ink-2">{data?.grammar ?? "—"}</p>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"><T en="Register" zh="语域" /></div>
                <p className="text-[12.5px] leading-relaxed text-ink-2">{data?.registerNote ?? "—"}</p>
              </div>
            </div>
            {guess.trim() && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-ink-3"><T en="Was your guess close?" zh="猜得接近吗？" /></span>
                <button onClick={() => toast("Close guesses mean strong context skills — that's the skill", "success")} className="press rounded-md bg-[#34c759]/15 px-2 py-0.5 font-medium text-[#1e7d34]">
                  <T en="✓ close" zh="✓ 接近" />
                </button>
                <button onClick={() => toast("Noted — this word goes in with a fresh tag", "warn")} className="press rounded-md bg-[#ff9f0a]/15 px-2 py-0.5 font-medium text-[#a06400]">
                  <T en="✗ not really" zh="✗ 不太对" />
                </button>
              </div>
            )}
            <Fold title="Example & collocations 例句与搭配">
              <p className="text-[13px] text-ink-2">{data?.example}</p>
              {data && data.collocations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.collocations.map((c) => (
                    <span key={c} className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[12px] font-medium text-ink-2">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </Fold>
            <ChineseReveal text={data?.meaningZh ?? ""} label="Chinese 释义" />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {addedTarget ? (
                <span className="text-[12px] font-medium text-[#1e7d34]">
                  <T en="✓ In today's targets" zh="✓ 已加入今日靶表达" />
                </span>
              ) : (
                onAddTarget && (
                  <button
                    disabled={targetPending}
                    onClick={() =>
                      startTarget(async () => {
                        const t = await addWordTargetAction({
                          word: card.word,
                          meaningEn: data?.contextualMeaning,
                          meaningZh: data?.meaningZh,
                          example: card.sentence,
                          contentId,
                        });
                        if (t) {
                          onAddTarget(t);
                          setAddedTarget(true);
                          toast(`"${card.word}" → today's targets`, "success");
                        }
                      })
                    }
                    className={`${btn.primary} px-3 py-1.5 text-[12px]`}
                  >
                    {targetPending ? (
                      <T en="Adding…" zh="加入中…" />
                    ) : (
                      <T en="Add to today's targets" zh="加入今日靶表达" />
                    )}
                  </button>
                )
              )}
              {saved ? (
                <span className="text-[12px] font-medium text-[#1e7d34]">✓ 已在词汇库</span>
              ) : (
                <button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await saveVocabAction(card.word, card.sentence);
                      onSaved(card.word.toLowerCase());
                      toast(`"${card.word}" → vocabulary bank (passive)`, "success");
                    })
                  }
                  className={`${btn.secondary} px-3 py-1.5 text-[12px]`}
                >
                  {pending ? <T en="Saving…" zh="保存中…" /> : <T en="+ Save to vocabulary" zh="+ 存入词汇库" />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Chunk drawer with guess gate (NOTICE, for phrases) ──────────────────── */

function ChunkGuessPanel({ chunk }: { chunk: RailTarget }) {
  const [guess, setGuess] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);

  useEffect(() => {
    if (!revealed) return;
    fetch("/api/ai/sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence: chunk.examples[0] ?? chunk.text }),
    })
      .then((r) => r.json())
      .then((d) => !d.error && setAnalysis(d));
  }, [revealed, chunk.text]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[#0071e3]/[0.05] px-4 py-3">
        <div className="text-[15px] font-semibold text-ink">{chunk.text}</div>
        <p className="mt-1.5 text-[12.5px] italic text-ink-2">“{chunk.examples[0] ?? "—"}”</p>
      </div>

      {!revealed ? (
        <div className="space-y-2.5">
          <p className="text-[13.5px] font-medium text-ink">
            <T
              en={<>From the sentence above — what do you think <span className="font-semibold text-[#0068d0]">“{chunk.text}”</span> means and why is it used here?</>}
              zh={<>结合上面的句子——你觉得 <span className="font-semibold text-[#0068d0]">“{chunk.text}”</span> 是什么意思？为什么这里用它？</>}
            />
          </p>
          <textarea
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            rows={3}
            placeholder="写下你的猜测：意思 + 什么场合会用到它（中文或英文）"
            className="input-base w-full resize-none px-3.5 py-2.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRevealed(true);
                if (guess.trim()) logEventAction(chunk.chunkId, "guess", guess.trim());
              }}
              className={`${btn.primary} px-3.5 py-2 text-[12.5px]`}
            >
              <T en="Submit guess → reveal analysis" zh="提交猜测 → 揭晓分析" />
            </button>
            <button onClick={() => setRevealed(true)} className={btn.ghost}>
              <T en="reveal without guessing" zh="不猜了，直接揭晓" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {guess.trim() && (
            <div className="rounded-xl bg-black/[0.03] px-4 py-2.5 text-[12.5px] text-ink-2">
              <span className="text-ink-3"><T en="Your guess:" zh="你的猜测：" /></span> {guess}
            </div>
          )}
          <div className="rounded-xl bg-[#34c759]/[0.08] px-4 py-3">
            <p className="text-[13.5px] leading-relaxed text-ink">{chunk.meaningEn}</p>
            <div className="mt-1.5">
              <ChineseReveal text={chunk.meaningZh} />
            </div>
          </div>
          {analysis ? <SentenceAnalysisView analysis={analysis} /> : <AnalysisSkeleton />}
        </div>
      )}
    </div>
  );
}

function SentencePanel({ sentence }: { sentence: { id: number; text: string } }) {
  const [data, setData] = useState<SentenceAnalysis | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/api/ai/sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence: sentence.text, sentenceId: sentence.id }),
    })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(true) : setData(d)))
      .catch(() => setError(true));
  }, [sentence.id]);

  if (error) return <p className="text-sm text-ink-2">分析失败 —— 请重试。Analysis failed.</p>;
  if (!data) return <AnalysisSkeleton />;
  return (
    <div>
      <p className="mb-5 rounded-xl bg-black/[0.03] px-4 py-3 text-[14px] leading-relaxed text-ink">{sentence.text}</p>
      <SentenceAnalysisView analysis={data} />
    </div>
  );
}

export function AnalysisSkeleton() {
  return (
    <div className="space-y-3">
      <ElapsedWait en="Deep analysis running — usually 60–150 s" zh="深度分析中 — 通常 60–150 秒" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-black/[0.05]" style={{ width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}
