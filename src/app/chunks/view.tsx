"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import { saveSentenceAction } from "@/app/actions";
import { Badge, Card, EmptyState, ProgressBar, btn, inputCls } from "@/components/ui";
import { Drawer, Segmented, toast } from "@/components/motion";
import { ChineseReveal, SaveChunkButton } from "@/components/learn";
import { T } from "@/components/i18n";

interface MyChunk {
  id: number;
  text: string;
  pattern: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  register: string;
  strength: number;
  lastReviewAt: number | null;
  sourceTitle: string | null;
  mySentences: string[];
}

interface DiscoverGroup {
  contentTitle: string;
  chunks: { id: number; text: string; meaningEn: string; meaningZh: string }[];
}

interface RelationEdge {
  relation: string;
  note: string;
  from: string;
  to: string;
}

interface Network {
  words: {
    id: number;
    headword: string;
    pos: string;
    cefr: string;
    meaningEn: string;
    meaningZh: string;
    example: string;
    collocations: string[];
    audioUrl?: string | null;
  }[];
  relations: RelationEdge[];
}

type Tab = "bank" | "discover" | "network";

export function ChunkBankView({
  myChunks,
  discover,
  chunkRelations,
  network,
}: {
  myChunks: MyChunk[];
  discover: DiscoverGroup[];
  chunkRelations: RelationEdge[];
  network: Network;
}) {
  const [tab, setTab] = useState<Tab>("bank");
  const [detail, setDetail] = useState<MyChunk | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playAudio = (url: string) => {
    audioRef.current?.pause();
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch(() => {});
  };

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">
            <T en="Chunk Bank" zh="语块库" />
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <T
              en="The unit of learning is the expression, not the word. Strength grows only when you retrieve and use them — never by re-reading."
              zh="学习的基本单位是表达，不是单词。强度只能通过提取和使用增长——重复阅读永远不算。"
            />
          </p>
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "bank", label: <T en={`My Chunks ${myChunks.length ? `(${myChunks.length})` : ""}`} zh="我的语块" /> },
            { value: "discover", label: <T en="Discover" zh="发现" /> },
            { value: "network", label: <T en="Lexical Network" zh="词汇网络" /> },
          ]}
        />
      </header>

      {tab === "bank" && (
        <>
          {myChunks.length === 0 ? (
            <EmptyState
              title="No chunks yet"
              hint="Read today's article, click the underlined expressions in the right rail, and save 2–3 to start your bank."
            />
          ) : (
            <div className="stagger grid gap-3 sm:grid-cols-2">
              {myChunks.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setDetail(c)}
                  className="press rounded-2xl bg-white p-4 text-left shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_8px_28px_rgba(0,0,0,0.09)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{c.text}</span>
                    <Badge tone={c.strength >= 70 ? "success" : c.strength >= 40 ? "accent" : "neutral"}>
                      {c.strength}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-2">{c.meaningEn}</p>
                  <div className="mt-3">
                    <ProgressBar value={c.strength} />
                  </div>
                  {c.mySentences.length > 0 && (
                    <p className="mt-2 text-[12px] text-ink-3">✍ {c.mySentences.length} of your own sentences</p>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Link href="/review" className={btn.primary}>
              <T en="Retrieval session" zh="提取练习" />
            </Link>
            <span className="text-[12px] text-ink-3">
              {myChunks.length} chunks · strength is earned by producing them, not by looking
            </span>
          </div>
        </>
      )}

      {tab === "discover" && (
        <div className="stagger space-y-6">
          {discover.length === 0 && <EmptyState title="Everything is already in your bank" />}
          {discover.map((g) => (
            <div key={g.contentTitle}>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                From “{g.contentTitle}”
              </h3>
              <div className="grid gap-2">
                {g.chunks.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]"
                  >
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-ink">{c.text}</div>
                      <p className="line-clamp-1 text-[12px] text-ink-2">{c.meaningEn}</p>
                    </div>
                    <SaveChunkButton chunkId={c.id} label={c.text} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "network" && (
        <div className="stagger space-y-5">
          <Card
            title="Lexical Network — words live in relationships"
            subtitle="convince ↔ persuade isn't a translation pair; it's a contrast of belief vs action. Networks, not lists."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {network.words.map((w) => (
                <div key={w.id} className="rounded-xl bg-black/[0.03] px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-ink">{w.headword}</span>
                    {w.audioUrl && (
                      <button
                        type="button"
                        aria-label={`Play ${w.headword}`}
                        onClick={() => w.audioUrl && playAudio(w.audioUrl)}
                        className="press -ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-black/[0.05] hover:text-ink"
                      >
                        <Volume2 size={13} strokeWidth={2} />
                      </button>
                    )}
                    <span className="text-[12px] text-ink-3">{w.pos} · {w.cefr}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{w.meaningEn}</p>
                  {w.collocations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {w.collocations.map((c) => (
                        <span key={c} className="rounded-md bg-white px-2 py-0.5 text-[12px] font-medium text-ink-2 shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[12px] italic text-ink-2">“{w.example}”</p>
                  <div className="mt-1.5">
                    <ChineseReveal text={w.meaningZh} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title={<T en="Edges — how these words connect and differ" zh="边界——这些词如何关联与区分" />}>
            <div className="space-y-3">
              {network.relations.map((r, i) => (
                <div key={i} className="rounded-xl bg-black/[0.03] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold text-ink">{r.from}</span>
                    <Badge tone={r.relation === "contrast" ? "warn" : r.relation === "synonym" ? "success" : "accent"}>
                      {r.relation}
                    </Badge>
                    <span className="font-semibold text-ink">{r.to}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{r.note}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* My-chunk relation edges under the bank tab */}
      {tab === "bank" && chunkRelations.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
            Your chunks, connected
          </h3>
          <div className="space-y-2.5">
            {chunkRelations.map((r, i) => (
              <div key={i} className="rounded-xl bg-white px-4 py-3 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-ink">{r.from}</span>
                  <Badge tone={r.relation === "contrast" ? "warn" : "accent"}>{r.relation}</Badge>
                  <span className="font-semibold text-ink">{r.to}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{r.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.text} subtitle={detail?.pattern}>
        {detail && <ChunkDetail chunk={detail} />}
      </Drawer>
    </div>
  );
}

function ChunkDetail({ chunk }: { chunk: MyChunk }) {
  const [sentence, setSentence] = useState("");
  const [mine, setMine] = useState<string[]>(chunk.mySentences);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#0071e3]/[0.05] px-4 py-3">
        <p className="text-[13.5px] leading-relaxed text-ink">{chunk.meaningEn}</p>
        <div className="mt-2"><ChineseReveal text={chunk.meaningZh} /></div>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone="neutral">{chunk.register}</Badge>
          {chunk.sourceTitle && <Badge tone="purple">from: {chunk.sourceTitle}</Badge>}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">Examples</h4>
        <div className="space-y-2">
          {chunk.examples.map((e, i) => (
            <p key={i} className="rounded-lg bg-black/[0.03] px-3 py-2 text-[13px] text-ink-2">{e}</p>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
          Your own sentences — the step most learners skip
        </h4>
        <div className="space-y-2">
          {mine.map((s, i) => (
            <p key={i} className="rounded-lg bg-[#34c759]/[0.08] px-3 py-2 text-[13px] text-ink">✍ {s}</p>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder={`Write YOUR sentence with "${chunk.text}"…`}
            className={inputCls}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sentence.trim()) {
                const s = sentence.trim();
                start(async () => {
                  await saveSentenceAction("chunk", chunk.id, s);
                  setMine((m) => [s, ...m]);
                  setSentence("");
                  toast("Your sentence saved — now say it out loud once", "success");
                });
              }
            }}
          />
          <button
            disabled={pending || !sentence.trim()}
            onClick={() => {
              const s = sentence.trim();
              if (!s) return;
              start(async () => {
                await saveSentenceAction("chunk", chunk.id, s);
                setMine((m) => [s, ...m]);
                setSentence("");
                toast("Your sentence saved — now say it out loud once", "success");
              });
            }}
            className={btn.secondary}
          >
            Save
          </button>
        </div>
      </div>

      <div>
        <ProgressBar value={chunk.strength} label="Retrieval strength" />
        <p className="mt-2 text-[12px] text-ink-3">
          {chunk.lastReviewAt
            ? `Last reviewed ${new Date(chunk.lastReviewAt).toLocaleDateString()}`
            : "Never reviewed — it's waiting in your queue."}
        </p>
        <Link href="/review" className={`${btn.primary} mt-3`}>
          Practice retrieval now →
        </Link>
      </div>
    </div>
  );
}
