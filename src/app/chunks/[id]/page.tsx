import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, Check, ChevronDown, RotateCcw } from "lucide-react";
import { db } from "@/db";
import { chunks as chunksT, contents as contentsT, retrievalItems, reviewHistory } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { T } from "@/components/i18n";
import { stateLabel } from "@/lib/retrieval-engine";
import { ExpressionAudio } from "@/components/expression-audio";

export const dynamic = "force-dynamic";

/* ── V16.5 Language Item — one saved item tells its own story:
 *    what it means → where you met it → your evidence → recent retrieval →
 *    next review. All fields are real rows (chunk + retrieval item + review
 *    history + source content); nothing is invented, no dictionary filler. */

export default async function LanguageItemPage({ params }: { params: Promise<{ id: string }> }) {
  const cu = await requireUser();
  const { id } = await params;
  const chunkId = Number(id);
  if (!Number.isInteger(chunkId) || chunkId <= 0) notFound();

  const [chunk] = await db
    .select()
    .from(chunksT)
    .where(and(eq(chunksT.id, chunkId), eq(chunksT.userId, cu.user.id)))
    .limit(1);
  if (!chunk) notFound();

  const [itemRow] = await db
    .select()
    .from(retrievalItems)
    .where(and(eq(retrievalItems.userId, cu.user.id), eq(retrievalItems.itemType, "chunk"), eq(retrievalItems.itemId, chunkId)))
    .limit(1);
  const item = itemRow ?? null;

  const [source, history] = await Promise.all([
    chunk.sourceContentId
      ? db.select({ title: contentsT.title }).from(contentsT).where(eq(contentsT.id, chunk.sourceContentId)).limit(1)
      : Promise.resolve([] as { title: string }[]),
    item
      ? db
          .select({ correct: reviewHistory.correct, quality: reviewHistory.quality, mode: reviewHistory.mode, createdAt: reviewHistory.createdAt })
          .from(reviewHistory)
          .where(eq(reviewHistory.retrievalItemId, item.id))
          .orderBy(desc(reviewHistory.createdAt))
          .limit(5)
      : Promise.resolve([] as { correct: number; quality: number; mode: string; createdAt: number }[]),
  ]);

  const ls = item?.learningState ?? null;
  const dueText = item?.dueAt
    ? new Date(item.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const contexts = ls?.contexts ?? [];
  const hits = (ls?.productionHits ?? 0) + (ls?.contextualHits ?? 0);
  const misses = (ls?.productionMisses ?? 0) + (ls?.contextualMisses ?? 0);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/chunks" className="press mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-ink">
        <ChevronDown size={13} className="-rotate-90" />
        <T en="Language library" zh="语言库" />
      </Link>

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink text-pretty">{chunk.text}</h1>
        <ExpressionAudio text={chunk.text} />
      </div>
      {chunk.pattern && <p className="mt-1 font-mono text-[12.5px] text-ink-3">{chunk.pattern}</p>}

      {/* What it means */}
      <section className="mt-6">
        <span className="t-section">
          <T en="What it means" zh="它是什么意思" />
        </span>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {chunk.meaningEn}
          {chunk.meaningZh && <span className="ml-2 text-[12.5px] text-ink-3">{chunk.meaningZh}</span>}
        </p>
      </section>

      {/* Where you met it */}
      {source.length > 0 && (
        <section className="mt-6">
          <span className="t-section">
            <T en="Where you met it" zh="你在哪里遇到它" />
          </span>
          <p className="mt-2 text-[13.5px] text-ink-2">
            <T en="From the material: " zh="来自材料：" />
            <Link href={`/read/${chunk.sourceContentId}`} className="press font-medium text-accent-text">
              {source[0].title}
            </Link>
          </p>
        </section>
      )}

      {/* Your evidence */}
      {item && (
        <section className="mt-6">
          <span className="t-section">
            <T en="Your evidence" zh="你的证据" />
          </span>
          <ul className="mt-2 space-y-1.5 text-[13.5px] text-ink-2">
            <li className="flex items-baseline gap-2">
              <Check size={13} strokeWidth={2.4} className="mt-1 shrink-0 text-accent-text" />
              <T
                en={`Produced from memory ${hits} time${hits === 1 ? "" : "s"}${misses > 0 ? `, missed ${misses}` : ""}.`}
                zh={`凭记忆产出 ${hits} 次${misses > 0 ? `，错过 ${misses} 次` : ""}。`}
              />
            </li>
            {contexts.length > 0 && (
              <li className="flex items-baseline gap-2">
                <Check size={13} strokeWidth={2.4} className="mt-1 shrink-0 text-accent-text" />
                <T
                  en={`Used across ${contexts.length} contexts (${contexts.join(", ")}).`}
                  zh={`在 ${contexts.length} 个场景用过（${contexts.join("、")}）。`}
                />
              </li>
            )}
            {chunk.activatedAt && (
              <li className="flex items-baseline gap-2">
                <Check size={13} strokeWidth={2.4} className="mt-1 shrink-0 text-accent-text" />
                <T en="Activated — used it in your own output." zh="已激活——在自己的输出里用过。" />
              </li>
            )}
            {ls && (
              <li className="text-[12.5px] text-ink-3">
                <T en={`Currently: ${stateLabel(ls.state).en}`} zh={`当前状态：${stateLabel(ls.state).zh}`} />
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Recent retrieval */}
      {history.length > 0 && (
        <section className="mt-6">
          <span className="t-section">
            <T en="Recent retrieval" zh="最近的提取" />
          </span>
          <ul className="mt-2 divide-y divide-line">
            {history.map((h, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                <span className={h.correct ? "text-ink-2" : "text-err-text"}>
                  {h.correct ? "✓ " : "✗ "}
                  <T en={h.mode} zh={h.mode} />
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">
                  {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Next review */}
      {item && (
        <section className="mt-6">
          <span className="t-section">
            <T en="Next review" zh="下次复习" />
          </span>
          <p className="mt-2 text-[13.5px] text-ink-2">
            {dueText ? (
              <T en={`Scheduled for ${dueText} — it will come back on its own.`} zh={`排在 ${dueText}——到时候它会自己回来。`} />
            ) : (
              <T en="Not scheduled yet — it will enter review after your next session." zh="还没排期——下次学习后会进入复习。" />
            )}
          </p>
          <Link href="/review" className="press mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent-text">
            <RotateCcw size={13} />
            <T en="Review now" zh="现在复习" />
            <ArrowRight size={12} />
          </Link>
        </section>
      )}

      {chunk.examples.length > 0 && (
        <section className="mt-6">
          <span className="t-section">
            <T en="In use" zh="用例" />
          </span>
          <div className="mt-2 space-y-2">
            {chunk.examples.slice(0, 3).map((ex, i) => (
              <p key={i} className="border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-3 text-pretty">{ex}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
