import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { learningProfiles, listeningMisses, shadowAttempts, vocabularies } from "@/db/schema";
import { logChunkEvent } from "@/server/services/events";
import type { MissCategory } from "@/lib/listening-labels";

export type { MissCategory };

export async function saveMiss(input: {
  userId: number;
  contentId: number;
  clipId?: number | null;
  missed: string;
  category: MissCategory;
}): Promise<{ knownButNotRecognized: boolean }> {
  await db.insert(listeningMisses).values({
    userId: input.userId,
    contentId: input.contentId,
    clipId: input.clipId ?? null,
    missed: input.missed.trim().slice(0, 200),
    category: input.category,
  });

  // Category B: the word is known — mark listening recognition as weak
  if (input.category === "known_not_recognized") {
    const word = input.missed.toLowerCase().replace(/[^a-z'-]/g, "").split(/\s+/)[0];
    if (word.length >= 2) {
      const existing = await db
        .select()
        .from(vocabularies)
        .where(and(eq(vocabularies.userId, input.userId), eq(vocabularies.headword, word)))
        .limit(1);
      if (existing.length) {
        await db
          .update(vocabularies)
          .set({ listeningStrength: Math.max(0, Math.min(20, existing[0].listeningStrength)) })
          .where(eq(vocabularies.id, existing[0].id));
        return { knownButNotRecognized: true };
      } else {
        // known by the learner but never saved: bank it with listening weakness flagged
        await db.insert(vocabularies).values({
          userId: input.userId,
          headword: word,
          status: "passive",
          listeningStrength: 10,
          meaningEn: "(known by you — hearing it is the weak side)",
        });
        return { knownButNotRecognized: true };
      }
    }
  }
  return { knownButNotRecognized: false };
}

export async function missStats(userId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ category: listeningMisses.category, c: sql<number>`count(*)` })
    .from(listeningMisses)
    .where(eq(listeningMisses.userId, userId))
    .groupBy(listeningMisses.category);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = r.c;
  return out;
}

const LEVEL_ORDER = ["A2", "B1", "B2"];

function bump(level: string | undefined, up: boolean): string {
  const cur = LEVEL_ORDER.indexOf(level ?? "B1");
  const next = Math.max(0, Math.min(LEVEL_ORDER.length - 1, cur + (up ? 1 : 0)));
  return LEVEL_ORDER[next];
}

/** Heuristic sub-profile update from one session's miss profile + performance. */
export async function updateListeningProfileAfterSession(
  userId: number,
  session: {
    misses: Partial<Record<MissCategory, number>>;
    recallHit: number;
    recallTotal: number;
    globalUnderstanding: boolean;
  },
): Promise<Record<string, string>> {
  const [profile] = await db
    .select({ listeningProfile: learningProfiles.listeningProfile, weaknesses: learningProfiles.listeningWeaknesses })
    .from(learningProfiles)
    .where(eq(learningProfiles.userId, userId))
    .limit(1);

  const prev = (profile?.listeningProfile ?? {}) as Record<string, string>;
  const wk = (profile?.weaknesses ?? []).map((w) => w.toLowerCase());
  const weak = (k: string, label: string) => wk.some((w) => w.includes(label));
  const p: Record<string, string> = {
    global: prev.global ?? "B1",
    wordRecognition: prev.wordRecognition ?? "B1",
    connectedSpeech: prev.connectedSpeech ?? (weak("c", "connected") ? "A2" : "B1"),
    weakForms: prev.weakForms ?? (wk.some((w) => w.includes("weak")) ? "A2" : "B1"),
    speed: prev.speed ?? (wk.some((w) => w.includes("speed") || w.includes("fast")) ? "A2" : "B1"),
  };

  const m = session.misses;
  const zero = (...cats: MissCategory[]) => cats.every((c) => !(m[c] ?? 0));
  // improvement rules — only real session evidence moves levels
  if (session.globalUnderstanding) p.global = bump(p.global, true);
  if (zero("unknown", "known_not_recognized") && session.recallTotal > 0) p.wordRecognition = bump(p.wordRecognition, session.recallHit / session.recallTotal >= 0.6);
  if (zero("connected_speech", "reduction")) p.connectedSpeech = bump(p.connectedSpeech, true);
  if (zero("weak_form")) p.weakForms = bump(p.weakForms, true);
  if (zero("speed")) p.speed = bump(p.speed, true);

  await db
    .update(learningProfiles)
    .set({ listeningProfile: p, updatedAt: Date.now() })
    .where(eq(learningProfiles.userId, userId));
  return p;
}

export async function getListeningProfile(userId: number): Promise<Record<string, string>> {
  const [profile] = await db
    .select({ listeningProfile: learningProfiles.listeningProfile })
    .from(learningProfiles)
    .where(eq(learningProfiles.userId, userId))
    .limit(1);
  return (profile?.listeningProfile ?? {}) as Record<string, string>;
}

export async function saveShadowAttempt(input: {
  userId: number;
  contentId: number;
  clipId: number;
  clipText: string;
  analysis: Record<string, string>;
  chunkId?: number | null;
}): Promise<void> {
  await db.insert(shadowAttempts).values({
    userId: input.userId,
    contentId: input.contentId,
    clipId: input.clipId,
    clipText: input.clipText.slice(0, 400),
    analysis: input.analysis,
  });
  if (input.chunkId) {
    await logChunkEvent(input.userId, input.chunkId, "listen_shadow", input.clipText.slice(0, 200));
  }
}
