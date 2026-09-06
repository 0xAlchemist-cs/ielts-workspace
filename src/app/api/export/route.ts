import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  chunks,
  dailyMissions,
  errors,
  learningProfiles,
  reviewHistory,
  speakingAttempts,
  userProgress,
  users,
  vocabularies,
  writingAttempts,
} from "@/db/schema";
import { getUserIdOrNull } from "@/server/current-user";

/** One-click full data export — trust for a local-first learning OS. */
export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [profile] = await db.select().from(learningProfiles).where(eq(learningProfiles.userId, userId));
  const [vocab, chunkRows, errorRows, reviews, missions, progress, speaking, writing] = await Promise.all([
    db.select().from(vocabularies).where(eq(vocabularies.userId, userId)),
    db.select().from(chunks).where(eq(chunks.userId, userId)),
    db.select().from(errors).where(eq(errors.userId, userId)),
    db.select().from(reviewHistory).where(eq(reviewHistory.userId, userId)),
    db.select().from(dailyMissions).where(eq(dailyMissions.userId, userId)),
    db.select().from(userProgress).where(eq(userProgress.userId, userId)),
    db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, userId)),
    db.select().from(writingAttempts).where(eq(writingAttempts.userId, userId)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    product: "IELTS Active Learning Workspace",
    user: { name: user?.name },
    profile,
    vocabulary: vocab,
    chunks: chunkRows,
    errorBank: errorRows,
    reviewHistory: reviews,
    missions,
    progress,
    speakingAttempts: speaking,
    writingAttempts: writing,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ielts-workspace-${date}.json"`,
    },
  });
}
