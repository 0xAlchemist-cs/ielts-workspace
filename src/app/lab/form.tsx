"use client";

import { useState } from "react";
import { btn, inputCls } from "@/components/ui";
import { SentenceAnalysisView } from "@/components/learn";
import { AnalysisSkeleton } from "@/app/read/[id]/reader";
import { useSpeech } from "@/hooks/speech";
import { T } from "@/components/i18n";
import { AiNudge } from "@/components/ai-nudge";
import type { SentenceAnalysis } from "@/lib/types";

export function LabForm({
  aiLive,
  corpusChunkIds,
  suggestions,
  savedCount,
}: {
  aiLive?: boolean;
  corpusChunkIds: Record<string, number>;
  suggestions: string[];
  savedCount: number;
}) {
  const [sentence, setSentence] = useState("");
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const { speak } = useSpeech();

  const analyze = async (text: string) => {
    const s = text.trim();
    if (!s) return;
    setSentence(s);
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/ai/sentence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: s }),
      });
      const data = await res.json();
      if (!data.error) setAnalysis(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shell-wide">
      <AiNudge aiLive={!!aiLive} />

      <header className="mb-6">
        <h1 className="text-display">
          <T en="Language Lab" zh="语言实验室" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T
            en="Send any English sentence in. You don't get a translation — you get the eight questions a linguist would ask."
            zh="把任何英语句子送进来。你得到的不是翻译，而是语言学家会问的八个问题：含义、结构、为什么用这个表达、母语者逻辑、替代说法、差异、搭配、雅思迁移。"
          />
        </p>
      </header>

      <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          rows={3}
          placeholder="Paste or type a sentence you met today — from reading, listening, or your own writing…"
          className={`${inputCls} resize-none font-[450]`}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s}
                onClick={() => analyze(s)}
                className="press max-w-[240px] truncate rounded-lg bg-black/[0.04] px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:bg-black/[0.07]"
                title={s}
              >
                {s.length > 34 ? s.slice(0, 34) + "…" : s}
              </button>
            ))}
          </div>
          <button onClick={() => analyze(sentence)} disabled={loading || !sentence.trim()} className={btn.primary}>
            {loading ? <T en="Analyzing…" zh="分析中…" /> : <T en="Analyze" zh="分析" />}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
            <AnalysisSkeleton />
          </div>
        )}
        {analysis && !loading && (
          <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="rounded-xl bg-black/[0.03] px-4 py-2.5 text-[14.5px] leading-relaxed text-ink">
                {analysis.sentence}
              </p>
              <button
                onClick={() => speak(analysis.sentence)}
                className="press shrink-0 rounded-lg bg-black/[0.05] px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-black/[0.09]"
              >
                ▶ listen
              </button>
            </div>
            <SentenceAnalysisView
              analysis={analysis}
              corpusChunkIds={corpusChunkIds}
              onDeepDive={(t) => analyze(t)}
            />
          </div>
        )}
        {!analysis && !loading && (
          <p className="px-1 text-[12px] text-ink-3">
            Tip: {savedCount} chunks already in your bank — analyse a sentence containing one of
            them to deepen the network.
          </p>
        )}
      </div>
    </div>
  );
}
