import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vocabularies as vocabT } from "@/db/schema";
import { generateReviewQueue, type ReviewQueueEntry } from "./retention";

/* ── Today's expression — the daily one-card hook on the homepage ──────────
 * Source of truth is the user's own memory: the highest-priority chunk/vocab
 * sitting in the review queue right now. Error items are skipped — they have
 * their own home (Mistakes + parallel drills), and "wrong form ✗" is not an
 * expression you'd want to meet first thing in the morning. */

export interface TodaysExpression {
  title: string; // the expression itself (chunk text / headword)
  meaningEn: string;
  meaningZh: string;
  example: string | null;
  audioUrl: string | null; // real recording, corpus vocab rows only; null → TTS fallback
  category: ReviewQueueEntry["category"];
}

export async function getTodaysExpression(userId: number): Promise<TodaysExpression | null> {
  // buildEntry can drop entries (source row deleted) — ask for a few, take the first usable
  const queue = await generateReviewQueue(userId, 6);
  const top = queue.find((q) => q.itemType === "chunk" || q.itemType === "vocab");
  if (!top) return null;

  let audioUrl: string | null = null;
  if (top.itemType === "vocab") {
    // the queue entry carries no audio — corpus twin rows (userId null) hold it;
    // prefer a row that actually has one over the user's own bare copy
    const rows = await db
      .select({ audioUrl: vocabT.audioUrl })
      .from(vocabT)
      .where(eq(vocabT.headword, top.display.title))
      .orderBy(desc(sql`${vocabT.audioUrl} is not null`))
      .limit(1);
    audioUrl = rows[0]?.audioUrl ?? null;
  }

  return {
    title: top.display.title,
    meaningEn: top.display.meaningEn ?? "",
    meaningZh: top.teach?.meaningZh ?? "",
    example: top.teach?.examples?.[0] ?? null,
    audioUrl,
    category: top.category,
  };
}
