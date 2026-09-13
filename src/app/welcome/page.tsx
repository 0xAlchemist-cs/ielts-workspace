import { and, eq, isNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import {
  chunks as chunksT,
  contents as contentsT,
  learningProfiles,
  users,
} from "@/db/schema";
import { getCurrentUser } from "@/server/current-user";
import { generateTodayMission } from "@/server/services/mission";
import { WelcomeFlow, type WelcomeMaterial } from "./flow";

export const dynamic = "force-dynamic";

/** Slice a passage for the Read step: sentence-bounded, never mid-word. */
function slicePassage(body: string, max = 620): string {
  if (body.length <= max) return body;
  const cut = body.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

/** First-run bootstrap with quick-start defaults (mirrors quickStartAction,
 * minus the redirect — the wizard IS the destination). Idempotent. */
async function ensureWelcomeUser(): Promise<void> {
  const existing = await getCurrentUser();
  if (existing) return;
  const rows = await db.select().from(users).limit(1);
  let u = rows[0];
  if (!u) [u] = await db.insert(users).values({ name: "Learner" }).returning();
  const profile = await db
    .select({ userId: learningProfiles.userId })
    .from(learningProfiles)
    .where(eq(learningProfiles.userId, u.id))
    .limit(1);
  if (!profile.length) {
    await db.insert(learningProfiles).values({
      userId: u.id,
      cefr: "B1",
      immersionLevel: 1,
      dailyMinutes: 45,
    });
    await generateTodayMission(u.id);
  }
}

export default async function WelcomePage() {
  await ensureWelcomeUser();

  /* Guided-loop material: a short, readable passage that already has a corpus
   * chunk attached (meaning + example guaranteed coherent with the text). */
  const rows = await db
    .select({
      title: contentsT.title,
      body: contentsT.body,
      chunkId: chunksT.id,
      text: chunksT.text,
      meaningEn: chunksT.meaningEn,
      meaningZh: chunksT.meaningZh,
      examples: chunksT.examples,
    })
    .from(chunksT)
    .innerJoin(contentsT, eq(chunksT.sourceContentId, contentsT.id))
    .where(
      and(
        isNull(chunksT.userId),
        ne(chunksT.meaningZh, ""),
        sql`${contentsT.topic} is not 'archive'`,
        sql`length(${contentsT.body}) between 500 and 1800`,
      ),
    )
    .orderBy(sql`length(${contentsT.body})`)
    .limit(10);
  const pick = rows.find((r) => (r.examples?.length ?? 0) > 0) ?? rows[0];

  if (!pick) {
    // degenerate corpus — still never a dead end
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">Let&apos;s build your English ability.</h1>
        <Link href="/" className="text-[14px] font-medium text-accent-text">
          Go to Today →
        </Link>
      </main>
    );
  }

  const material: WelcomeMaterial = {
    passageTitle: pick.title,
    passage: slicePassage(pick.body),
    corpusChunkId: pick.chunkId,
    expression: pick.text,
    meaningEn: pick.meaningEn,
    meaningZh: pick.meaningZh,
    example: pick.examples?.[0] ?? null,
  };
  return <WelcomeFlow material={material} />;
}
