"use client";

import { useState, useTransition } from "react";
import { saveCorpusChunkAction, saveCustomChunkAction } from "@/app/actions";
import { Badge, MockBadge } from "@/components/ui";
import { toast } from "@/components/motion";
import type { SentenceAnalysis } from "@/lib/types";

/** Compact chip that saves a chunk into the personal bank (idempotent). */
export function SaveChunkButton({
  chunkId,
  label,
  alreadySaved,
  className,
}: {
  chunkId?: number;
  label: string;
  alreadySaved?: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(!!alreadySaved);
  const [pending, start] = useTransition();
  if (saved) {
    return (
      <span className={`inline-flex items-center gap-1 text-[12px] font-medium text-[#1e7d34] ${className ?? ""}`}>
        ✓ In your Chunk Bank
      </span>
    );
  }
  return (
    <button
      disabled={pending || !chunkId}
      onClick={() =>
        chunkId &&
        start(async () => {
          await saveCorpusChunkAction(chunkId);
          setSaved(true);
          toast(`Saved "${label}" to Chunk Bank`, "success");
        })
      }
      className={`press inline-flex items-center gap-1 rounded-lg bg-[#0071e3]/10 px-2.5 py-1 text-[12px] font-semibold text-[#0068d0] transition-colors duration-150 hover:bg-[#0071e3]/20 disabled:opacity-40 ${className ?? ""}`}
    >
      {pending ? "Saving…" : "+ Chunk Bank"}
    </button>
  );
}

/** The 8-dimension deep analysis view — shared by Reader drawer and Language Lab. */
export function SentenceAnalysisView({
  analysis,
  corpusChunkIds,
  onDeepDive,
}: {
  analysis: SentenceAnalysis;
  corpusChunkIds?: Record<string, number>; // chunk text → corpus id
  onDeepDive?: (chunkText: string) => void;
}) {
  const a = analysis;
  // Cached analyses (and live models) can repeat a chunk — the pills and the
  // worth-storing panel would each render it twice. One chunk, one row.
  const detected = [...new Set(a.detectedChunks)];
  const sections: { title: string; body: React.ReactNode }[] = [
    { title: "Meaning", body: <div className="space-y-1"><div>{a.meaning}</div><ChineseReveal text={a.meaningZh} /></div> },
    { title: "Structure", body: <code className="block rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-[12px] text-ink">{a.structure}</code> },
    { title: "Why this expression?", body: <div>{a.whyThisExpression}</div> },
    { title: "Native logic", body: <div>{a.nativeLogic}</div> },
    {
      title: "Alternatives & differences",
      body: (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {a.alternatives.map((alt, i) => (
              <li key={i} className="rounded-lg bg-black/[0.03] px-3 py-2">
                <span className="font-medium text-ink">{alt.expression}</span>
                <span className="ml-2 text-[12px] text-ink-2">{alt.note}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] leading-relaxed">{a.differences}</p>
        </div>
      ),
    },
    {
      title: "Collocations",
      body: a.collocations.length ? (
        <div className="flex flex-wrap gap-1.5">
          {a.collocations.map((c, i) => (
            <span key={i} className="rounded-md bg-black/[0.05] px-2 py-1 text-[12px] font-medium text-ink-2">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-ink-3">—</p>
      ),
    },
    {
      title: "Transfer",
      body: (
        <div className="space-y-2 text-[13px] leading-relaxed">
          <div><Badge tone="neutral">Daily</Badge> <span className="ml-1.5">{a.transfer.daily}</span></div>
          <div><Badge tone="accent">Speaking</Badge> <span className="ml-1.5">{a.transfer.speaking}</span></div>
          <div><Badge tone="purple">Writing</Badge> <span className="ml-1.5">{a.transfer.writing}</span></div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {a.isMock && <MockBadge />}
        {detected.map((c) => (
          <Badge key={c} tone="accent">
            {c}
          </Badge>
        ))}
      </div>

      {detected.length > 0 && (
        <div className="rounded-xl bg-[#0071e3]/[0.05] px-4 py-3">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#0068d0]">
            Worth storing — one click to your Chunk Bank
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {detected.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">{c}</span>
                {corpusChunkIds && corpusChunkIds[c] !== undefined ? (
                  <SaveChunkButton chunkId={corpusChunkIds[c]} label={c} />
                ) : (
                  <CustomChunkSaver text={c} />
                )}
                {onDeepDive && (
                  <button onClick={() => onDeepDive(c)} className="press text-[12px] font-medium text-[#0068d0] hover:underline">
                    deep dive →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.title}>
            <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">{s.title}</h4>
            <div className="text-[13.5px] leading-relaxed text-ink-2">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chinese stays behind an explicit reveal — Concept → English, not → Chinese → English. */
export function ChineseReveal({ text, label = "中文" }: { text: string; label?: string }) {
  const [show, setShow] = useState(false);
  if (!text || text === "—" || !text.trim()) return null;
  return show ? (
    <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-[13px] text-ink-2">{text}</div>
  ) : (
    <button
      onClick={() => setShow(true)}
      className="press text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
    >
      ▸ Show {label}（主动想再看）
    </button>
  );
}

/** Save a free-form chunk (not in the corpus) with a quick meaning prompt. */
export function CustomChunkSaver({ text }: { text: string }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  if (saved) return <span className="text-[12px] font-medium text-[#1e7d34]">✓ saved</span>;
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await saveCustomChunkAction({ text });
          setSaved(true);
          toast(`Saved "${text}"`, "success");
        })
      }
      className="press rounded-lg bg-[#0071e3]/10 px-2.5 py-1 text-[12px] font-semibold text-[#0068d0] transition-colors duration-150 hover:bg-[#0071e3]/20 disabled:opacity-40"
    >
      {pending ? "Saving…" : "+ Chunk Bank"}
    </button>
  );
}
