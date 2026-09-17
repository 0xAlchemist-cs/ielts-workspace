"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, btn, inputCls } from "@/components/ui";
import { Segmented, toast } from "@/components/motion";
import { T, useBilingual } from "@/components/i18n";
import { importContentAction, assessDifficultyAction } from "@/app/actions";
import { FileImport } from "./import-panel";
import { ImportsManager } from "./imports-manager";

interface Item {
  id: number;
  type: "reading" | "listening";
  title: string;
  topic: string;
  cefr: string;
  /** V9 honesty gate: false = imported but never difficulty-analyzed */
  showLevel: boolean;
  difficulty: number;
  vocabDensity: number;
  ieltsRelevance: number;
  summaryEn: string;
  minutes: number;
}

interface AnalysisResult {
  cefr: string;
  difficulty: number;
  ieltsRelevance: number;
  topic: string;
  mainIdea: string;
  wordCount: number;
  recommended: { text: string; type: string; whyThis: string; meaningEn: string; contextSentence: string; ieltsRelevance: number }[];
  comprehensionQuestions: { question: string; type: string }[];
}

type Tab = "library" | "add";
type FilterType = "all" | "reading" | "listening";

/* Persona: weak-English reader — topic chips carry a Chinese twin. */
const TOPIC_ZH: Record<string, string> = {
  education: "教育",
  environment: "环境",
  technology: "科技",
  health: "健康",
  society: "社会",
  "work & career": "职场",
  "business & economy": "商业经济",
  "science & nature": "科学自然",
  "culture & history": "文化历史",
  travel: "旅行",
  "daily life": "日常生活",
  writing: "写作素材",
  general: "综合",
};

export function LibraryView({
  contents,
  imports,
  importSummary,
  userLevel,
  examSuffix,
  examSuffixZh,
}: {
  contents: Item[];
  imports: import("./imports-manager").ImportRow[];
  importSummary: { total: number; ready: number; needsAttention: number };
  userLevel?: string; // V9: IELTS-only difficulty layer
  examSuffix?: string; // V12: exam name for CET goals ("CET-4"); IELTS stays quiet
  examSuffixZh?: string;
}) {
  const bilingual = useBilingual();
  const [tab, setTab] = useState<Tab>("library");
  const [filter, setFilter] = useState<FilterType>("all");
  // Nav entries share the /library route and differ only by ?type= — a
  // query-only navigation re-renders but does NOT remount this component,
  // so the filter follows the live search param (applied after mount so SSR
  // and the first client render agree; manual chip picks hold until the
  // next URL change).
  const searchParams = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("type");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync filter to URL param (incl. query-only navigations)
    setFilter(t === "reading" || t === "listening" ? t : "all");
  }, [searchParams]);
  const [topic, setTopic] = useState("all");
  // the bank holds hundreds of items — render progressively instead of one
  // giant list; reset whenever the visible set changes
  const PAGE = 24;
  const [limit, setLimit] = useState(PAGE);
  const topics = [...new Set(contents.map((c) => c.topic))];
  const router = useRouter();

  const rows = contents.filter(
    (c) => (filter === "all" || c.type === filter) && (topic === "all" || c.topic === topic),
  );
  const visible = rows.slice(0, limit);

  return (
    <div className="shell-wide">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">
            <T en="Library" zh="内容库" />
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <T
              en={`Bring your English materials — we'll turn them into learning.${examSuffix ? ` Adding to ${examSuffix}.` : ""}`}
              zh={`带上你的英语材料——我们把它变成能学的东西。${examSuffixZh ? `当前加入：${examSuffixZh}。` : ""}`}
            />
          </p>
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "library", label: <T en="My materials" zh="我的材料" /> },
            { value: "add", label: <T en="＋ Import" zh="＋ 导入" /> },
          ]}
        />
      </header>

      {tab === "library" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented<FilterType>
              value={filter}
              onChange={(f) => { setFilter(f); setLimit(PAGE); }}
              options={[
                { value: "all", label: "All" },
                { value: "reading", label: "📖 Reading" },
                { value: "listening", label: "🎧 Listening" },
              ]}
            />
            <div className="flex flex-wrap gap-1.5">
              {["all", ...topics].map((t) => (
                <button key={t} onClick={() => { setTopic(t); setLimit(PAGE); }}
                  className={`press rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    topic === t ? "chip-on" : "chip"
                  }`}>{t === "all" ? (bilingual ? "All topics 全部" : "All topics") : `${t}${bilingual && TOPIC_ZH[t] ? ` ${TOPIC_ZH[t]}` : ""}`}</button>
              ))}
            </div>
            <span className="ml-auto text-[12px] text-ink-3">{rows.length} items</span>
          </div>

          <div className="stagger grid gap-3">
            {visible.map((c) => (
              <Link key={c.id} href={c.type === "reading" ? `/read/${c.id}` : `/listen/${c.id}`}
                className="press card-specular card-lift group flex items-start gap-4 rounded-2xl bg-surface p-5">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  c.type === "reading" ? "bg-[#0071e3]/10" : "bg-[#af52de]/10"
                }`}>
                  {c.type === "reading" ? (
                    <svg width="17" height="17" viewBox="0 0 20 20" fill="#0068d0"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2H9v16H5.5A2.5 2.5 0 0 1 3 15.5v-11zM11 2h3.5A2.5 2.5 0 0 1 17 4.5v11a2.5 2.5 0 0 1-2.5 2.5H11V2z" /></svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 20 20" fill="#8e33c4"><path d="M10 3a7 7 0 0 0-7 7v3.5A2.5 2.5 0 0 0 5.5 16H7v-6H4.5v-.5a5.5 5.5 0 0 1 11 0v.5H13v6h1.5a2.5 2.5 0 0 0 2.5-2.5V10a7 7 0 0 0-7-7z" /></svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink group-hover:text-[#0068d0]">{c.title}</h3>
                    {/* V9 honesty: imported-but-unanalyzed material shows no level
                     * badge — the internal estimate never reaches the display */}
                    {c.showLevel && <Badge tone="neutral">{c.cefr}</Badge>}
                    <Badge tone="neutral">{c.topic}</Badge>
                    {c.ieltsRelevance >= 4 && <Badge tone="accent">IELTS {c.ieltsRelevance}/5</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">{c.summaryEn}</p>
                  <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-3">
                    <span>{c.minutes} min</span>
                    <span>Difficulty {"●".repeat(c.difficulty)}{"○".repeat(5 - c.difficulty)}</span>
                  </div>
                </div>
                <span className="mt-1 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </Link>
            ))}
          </div>

          {rows.length === 0 && (
            <div className="card-specular rounded-2xl bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
              <T en="Nothing matches these filters — try another topic." zh="没有匹配的内容——换个主题试试。" />
            </div>
          )}

          {visible.length < rows.length && (
            <button onClick={() => setLimit((l) => l + PAGE)} className={`${btn.secondary} mx-auto`}>
              <T en={`Show more (${rows.length - visible.length} left)`} zh={`显示更多（还有 ${rows.length - visible.length} 条）`} />
            </button>
          )}
        </>
      )}

      {tab === "add" && (
        <AddContentPanel
          onImported={(id) => router.push(`/read/${id}`)}
          imports={imports}
          importSummary={importSummary}
          userLevel={userLevel}
        />
      )}
    </div>
  );
}

function AddContentPanel({
  onImported,
  imports,
  importSummary,
  userLevel,
}: {
  onImported: (id: number) => void;
  imports: import("./imports-manager").ImportRow[];
  importSummary: { total: number; ready: number; needsAttention: number };
  userLevel?: string; // V9: set only for the IELTS profile (difficulty layer)
}) {
  const [text, setText] = useState("");  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const analyze = async () => {
    if (text.trim().split(/\s+/).length < 30) {
      setError("Need at least 30 words for analysis.");
      return;
    }
    setError("");
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/content/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setAnalysis(data);
    } finally {
      setAnalyzing(false);
    }
  };

  const importContent = async () => {
    setImporting(true);
    try {
      const res = await importContentAction({
        text: text.trim(),
        topic: analysis?.topic ?? "imported",
        cefr: analysis?.cefr ?? "B2",
      });
      if (res.ok && res.id) {
        toast("Content imported — Reading Lab is ready", "success");
        onImported(res.id);
      }
    } finally {
      setImporting(false);
    }
  };

  const words = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <FileImport userLevel={userLevel} />
      <ImportsManager rows={imports} summary={importSummary} />
      <div className="card-specular rounded-2xl bg-surface p-6">
        <h3 className="mb-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">
          <T en="Paste any English text" zh="粘贴任意英文文章" />
        </h3>
        <p className="mb-3 text-[13px] leading-relaxed text-ink-2">
          <T
            en="The Content Engine analyzes difficulty, extracts LanguageItems, and prepares a full learning session — all from your input."
            zh="内容引擎自动分析难度、提取语言项、生成完整学习环节——全部来自你提供的输入。"
          />
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste an article, essay, news story, or any English text here…"
          className={`${inputCls} resize-y font-[450] leading-relaxed`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`font-mono text-[12px] ${words < 30 ? "text-[#d70015]" : "text-[#1f7a37]"}`}>{words} words</span>
          <button onClick={analyze} disabled={analyzing || words < 30} className={btn.primary}>
            {analyzing ? <T en="Analyzing…" zh="分析中…" /> : <T en="Analyze content" zh="分析内容" />}
          </button>
          {analysis && (
            <button onClick={importContent} disabled={importing} className={`${btn.secondary} ml-auto`}>
              {importing ? "…" : <T en="Import & start learning →" zh="导入并开始学习 →" />}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-[12.5px] text-[#d70015]">{error}</p>}
      </div>

      {analysis && (
        <div className="enter space-y-4">
          <div className="card-specular rounded-2xl bg-surface p-6">
            <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                [analysis.cefr, "CEFR", "等级"],
                [String(analysis.difficulty), "Difficulty", "难度"],
                [String(analysis.ieltsRelevance), "IELTS", "雅思"],
                [analysis.topic, "Topic", "主题"],
                [String(analysis.wordCount), "Words", "词数"],
                [String(analysis.comprehensionQuestions.length), "Questions", "理解题"],
              ].map(([v, en, zh]) => (
                <div key={en as string} className="rounded-xl bg-black/[0.03] px-3 py-2.5 text-center">
                  <div className="font-mono text-[16px] font-semibold text-ink">{v}</div>
                  <div className="text-[10.5px] font-medium text-ink-3">{en} · {zh}</div>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2"><b className="text-ink"><T en="Main idea:" zh="主旨：" /></b> {analysis.mainIdea.slice(0, 200)}</p>
          </div>

          <div className="card-specular rounded-2xl bg-surface p-6">
            <h4 className="mb-1 text-[14px] font-semibold text-ink">
              🎯 <T en="Recommended LanguageItems" zh="推荐语言项" />
            </h4>
            <p className="mb-4 text-[12px] text-ink-3">
              <T en="Top 5 highest-value items — they enter the Retrieval Engine when you import this content." zh="价值最高的 5 项——导入后自动进入提取引擎。" />
            </p>
            <div className="space-y-3">
              {analysis.recommended.map((rec, i) => (
                <div key={i} className="rounded-xl border border-black/[0.06] bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={rec.type === "chunk" ? "accent" : rec.type === "sentence_pattern" ? "purple" : "neutral"}>
                      {rec.type.replace("_", " ")}
                    </Badge>
                    <span className="text-[14px] font-semibold text-ink">{rec.text}</span>
                    <span className="ml-auto text-[10.5px] text-ink-3">IELTS {rec.ieltsRelevance}/5</span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{rec.meaningEn}</p>
                  <p className="mt-1 text-[12px] italic leading-relaxed text-ink-3">"{rec.contextSentence.slice(0, 100)}…"</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#0068d0]">💡 {rec.whyThis}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card-specular rounded-2xl bg-surface p-6">
            <h4 className="mb-2 text-[14px] font-semibold text-ink">
              📝 <T en="Comprehension Check (preview)" zh="理解检验（预览）" />
            </h4>
            <div className="space-y-2">
              {analysis.comprehensionQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px]">
                  <Badge tone="neutral">{q.type.replace("_", " ")}</Badge>
                  <span className="text-ink-2">{q.question}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
