import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chunks as chunksT, contents, listeningClips, retrievalItems, sentences as sentencesT, vocabularies } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { getCorpusChunksForContent, saveCorpusChunk } from "@/server/services/bank";
import { ensureRetrievalItem } from "@/server/services/retrieval";
import { getListeningProfile } from "@/server/services/listening";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { autoPhenomena } from "@/lib/spoken-form";
import { speakingPromptByChunk } from "@/lib/banks";
import { splitSentences } from "@/lib/text";
import { ListeningLab, type ListenTarget, type ListenClip } from "./lab";

export default async function ListenPage({ params }: { params: Promise<{ id: string }> }) {
  const cu = await requireUser();
  const userId = cu.user.id;
  const { id } = await params;
  const contentId = Number(id);
  const [content] = await db.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  if (!content) notFound();

  const transcriptNeeded = content.type === "listening" && !content.body.trim();

  // clips: real annotated > synthesized from sentences > (empty → paste flow)
  let clipRows = (
    await db.select().from(listeningClips).where(eq(listeningClips.contentId, contentId))
  ).sort((a, b) => a.orderNo - b.orderNo);

  if (clipRows.length === 0 && content.body.trim()) {
    const sents = (
      await db.select().from(sentencesT).where(eq(sentencesT.contentId, contentId))
    ).sort((a, b) => a.orderNo - b.orderNo);
    clipRows = sents.map((s, i) => ({
      id: s.id,
      contentId,
      orderNo: i,
      startMs: 0,
      endMs: 0,
      text: s.text,
      phenomena: autoPhenomena(s.text),
    }));
  }

  const clips: ListenClip[] = clipRows.map((c) => {
    const m = c.text.match(/^([A-Z][A-Za-z .'-]{0,20}):\s+([\s\S]*)$/);
    const raw = m ? m[2] : c.text;
    return {
      id: c.id,
      speaker: m ? m[1] : "",
      text: raw,
      phenomena: c.phenomena.length ? c.phenomena : autoPhenomena(raw),
    };
  });

  // ── targets: chunks detected in the clips (user copies + retrieval ids) ──
  const transcript = clips.map((c) => c.text).join(" ");
  const corpusAll = await getCorpusChunksForContent(contentId);
  const detected = corpusAll.filter((c) => c.sourceContentId === contentId || CHUNK_DETECT[c.text]?.test(transcript));
  const seen = new Set<string>();
  const targets: ListenTarget[] = [];
  for (const c of detected) {
    if (seen.has(c.text) || targets.length >= 5) continue;
    seen.add(c.text);
    const saved = await saveCorpusChunk(userId, c.id);
    if (!saved) continue;
    await ensureRetrievalItem(userId, "chunk", saved.id);
    const [item] = await db
      .select({ id: retrievalItems.id })
      .from(retrievalItems)
      .where(
        and(
          eq(retrievalItems.userId, userId),
          eq(retrievalItems.itemType, "chunk"),
          eq(retrievalItems.itemId, saved.id),
        ),
      )
      .limit(1);
    const model = saved.examples[0] ?? saved.text;
    targets.push({
      chunkId: saved.id,
      retrievalItemId: item?.id ?? 0,
      text: saved.text,
      pattern: saved.pattern,
      meaningEn: saved.meaningEn,
      meaningZh: saved.meaningZh,
      examples: saved.examples,
      speakingPrompt: speakingPromptByChunk[saved.text] ?? `Tell me about something that involves "${saved.text}" in your life.`,
      cloze: model && CHUNK_DETECT[saved.text]?.test(model) ? model.replace(CHUNK_DETECT[saved.text], "＿＿＿") : undefined,
      clozeAudio: model,
    });
  }

  // known-vocab set for "known but not recognized" checks
  const savedVocab = new Set(
    (
      await db
        .select({ h: vocabularies.headword })
        .from(vocabularies)
        .where(eq(vocabularies.userId, userId))
    ).map((r) => r.h),
  );

  const lProfile = await getListeningProfile(userId);
  const weakest = Object.entries(lProfile).sort((a, b) => a[1].localeCompare(b[1]))[0];

  return (
    <ListeningLab
      contentId={content.id}
      title={content.title}
      audioUrl={content.audioUrl}
      transcriptNeeded={transcriptNeeded}
      cefr={cu.profile.cefr}
      listeningProfile={lProfile}
      focusLabel={
        cu.profile.listeningWeaknesses[0] ??
        (weakest ? `${weakest[0]} (${weakest[1]})` : "Connected Speech")
      }
      clips={clips}
      targets={targets}
      savedVocab={[...savedVocab]}
    />
  );
}
