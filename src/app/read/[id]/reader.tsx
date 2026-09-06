"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addWordTargetAction, markStepAction, recordExposureAction, saveVocabAction, logEventAction } from "@/app/actions";
import { Badge, MockBadge, btn } from "@/components/ui";
import { Drawer, Fold, toast } from "@/components/motion";
import { ChineseReveal, SaveChunkButton, SentenceAnalysisView } from "@/components/learn";
import { useImmersion, T } from "@/components/i18n";
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

export function ArticlePhase({
  contentId,
  paragraphs,
  tiers,
  savedVocab,
  railTargets,
  selectedIds,
  onToggleTarget,
  onAddTarget,
  children,
}: {
  contentId: number;
  paragraphs: { id: number; text: string }[][];
  tiers: Record<string, string>;
  savedVocab: string[];
  railTargets: RailTarget[];
  selectedIds: Set<number>;
  onToggleTarget: (id: number) => void;
  onAddTarget?: (t: AdHocTarget) => void;
  children?: React.ReactNode; // slot after the article (CTA etc.)
}) {
  const immersion = useImmersion();
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set(savedVocab));
  const [wordCard, setWordCard] = useState<{ word: string; sentence: string } | null>(null);
  const [drawerSentence, setDrawerSentence] = useState<{ id: number; text: string } | null>(null);
  const [drawerChunk, setDrawerChunk] = useState<RailTarget | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState("");

  useEffect(() => {
    recordExposureAction(contentId);
  }, [contentId]);

  return (
    <div className="flex gap-8">
      <article className="reader-text min-w-0 max-w-[42rem] flex-1">
        {paragraphs.map((para, pi) => (
          <p key={pi} className="mb-5">
            {para.map((s) => (
              <SentenceSpan
                key={s.id}
                sentence={s}
                tiers={tiers}
                savedWords={savedWords}
                onWordClick={(word) => setWordCard({ word, sentence: s.text })}
                onAnalyze={() => setDrawerSentence(s)}
              />
            ))}
          </p>
        ))}
        {children}
      </article>

      <aside className="hidden w-[276px] shrink-0 lg:block">
        <div className="sticky top-[108px] rounded-2xl bg-white p-4 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-2">
            Today's targets · 今日靶表达
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
            {immersion <= 1
              ? "勾选 3–5 个进入精研环节。阅读时它们会高亮显示。"
              : "Select 3–5 for the study session. They highlight while you read."}
          </p>
          <div className="space-y-2.5">
            {railTargets.length === 0 && (
              <div className="rounded-xl bg-surface-2 px-3 py-3 text-[12px] leading-relaxed text-ink-2">
                <T
                  en="No pre-set targets for this article. Tap any word → guess its meaning → “Add to today's targets”."
                  zh="这篇文章没有预置靶表达。点击文中任意单词 → 猜词义 → 「加入今日靶表达」。"
                />
              </div>
            )}
            {railTargets.map((c) => {
              const selected = selectedIds.has(c.chunkId);
              return (
                <div
                  key={c.chunkId}
                  className={`rounded-xl px-3 py-2.5 transition-colors duration-150 ${
                    selected ? "bg-[#0071e3]/[0.07]" : "bg-black/[0.03]"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleTarget(c.chunkId)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#0071e3]"
                    />
                    <button
                      onClick={() => setDrawerChunk(c)}
                      className="press text-left text-[13px] font-semibold text-ink hover:text-[#0068d0]"
                    >
                      {c.text}
                    </button>
                  </label>
                  <p className="mt-1 line-clamp-2 pl-6.5 text-[12px] leading-relaxed text-ink-2" style={{ paddingLeft: 26 }}>
                    {c.meaningEn}
                  </p>
                  <div className="mt-1.5 pl-6.5" style={{ paddingLeft: 26 }}>
                    <SaveChunkButton chunkId={c.corpusId ?? c.chunkId} label={c.text} alreadySaved={c.saved} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

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
  onWordClick,
  onAnalyze,
}: {
  sentence: { id: number; text: string };
  tiers: Record<string, string>;
  savedWords: Set<string>;
  onWordClick: (word: string) => void;
  onAnalyze: () => void;
}) {
  const parts = sentence.text.split(/(\s+)/);
  return (
    <span className="sentence group/s relative inline">
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        const word = part.replace(/[^A-Za-z'’-]/g, "");
        if (!word) return part;
        const key = word.toLowerCase();
        const tier = tiers[key] ?? "core";
        const saved = savedWords.has(key);
        const cls = saved
          ? "word word-saved"
          : tier === "advanced"
            ? "word word-advanced"
            : tier === "rare"
              ? "word word-rare"
              : "word";
        return (
          <span key={i} className={cls} onClick={() => onWordClick(word)}>
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
  card: { word: string; sentence: string } | null;
  contentId: number;
  savedWords: Set<string>;
  onSaved: (w: string) => void;
  onAddTarget?: (t: AdHocTarget) => void;
  onClose: () => void;
}) {
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

  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4" onClick={onClose}>
      <div className="material-panel enter w-full max-w-lg rounded-2xl px-5 py-4" onClick={(e) => e.stopPropagation()}>
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
              What do you think <span className="font-semibold text-[#0068d0]">“{card.word}”</span> means here? Guess first.
            </p>
            <input
              autoFocus
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="your guess — English or Chinese, either is fine"
              className="input-base w-full px-3.5 py-2.5 text-sm"
              onKeyDown={(e) => e.key === "Enter" && guess.trim() && setGuessed(true)}
            />
            <div className="flex items-center gap-2">
              <button onClick={() => setGuessed(true)} disabled={!guess.trim()} className={`${btn.primary} px-3 py-1.5 text-[12px]`}>
                Submit guess →
              </button>
              <button onClick={() => setGuessed(true)} className={btn.ghost}>
                no idea — reveal anyway
              </button>
            </div>
          </div>
        ) : !showEn ? (
          <div className="space-y-2.5">
            {guess.trim() && (
              <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-[12.5px] text-ink-2">
                <span className="text-ink-3">Your guess:</span> {guess}
              </p>
            )}
            <button onClick={() => setShowEn(true)} className={`${btn.primary} px-3 py-1.5 text-[12px]`}>
              {loading ? "loading…" : "Show the English meaning"}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Contextual meaning</div>
              <p className="text-[13.5px] leading-relaxed text-ink">{data?.contextualMeaning ?? "—"}</p>
            </div>
            {guess.trim() && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-ink-3">Was your guess close?</span>
                <button onClick={() => toast("Close guesses mean strong context skills — that's the skill", "success")} className="press rounded-md bg-[#34c759]/15 px-2 py-0.5 font-medium text-[#1e7d34]">
                  ✓ close
                </button>
                <button onClick={() => toast("Noted — this word goes in with a fresh tag", "warn")} className="press rounded-md bg-[#ff9f0a]/15 px-2 py-0.5 font-medium text-[#a06400]">
                  ✗ not really
                </button>
              </div>
            )}
            <Fold title="Example & collocations">
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
                <span className="text-[12px] font-medium text-[#1e7d34]">✓ In your vocabulary</span>
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
                  {pending ? "Saving…" : "+ Save to vocabulary"}
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
            From the sentence above — what do you think <span className="font-semibold text-[#0068d0]">“{chunk.text}”</span> means
            and why is it used here?
          </p>
          <textarea
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            rows={3}
            placeholder="Your guess: meaning + when a native speaker would use it…"
            className="w-full resize-none rounded-xl border-0 bg-black/[0.04] px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:bg-white focus:shadow-[0_0_0_2px_#0071e3]"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRevealed(true);
                if (guess.trim()) logEventAction(chunk.chunkId, "guess", guess.trim());
              }}
              className={`${btn.primary} px-3.5 py-2 text-[12.5px]`}
            >
              Submit guess → reveal analysis
            </button>
            <button onClick={() => setRevealed(true)} className={btn.ghost}>
              reveal without guessing
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {guess.trim() && (
            <div className="rounded-xl bg-black/[0.03] px-4 py-2.5 text-[12.5px] text-ink-2">
              <span className="text-ink-3">Your guess:</span> {guess}
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

  if (error) return <p className="text-sm text-ink-2">Analysis failed — try again.</p>;
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
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-black/[0.05]" style={{ width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}
