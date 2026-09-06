/** Create / clean a temporary HTTP smoke user for curl checks. */
import { eq, inArray, and } from "drizzle-orm";
import { db } from "../src/db";
import {
  chunks as chunksT, dailyMissions, learningProfiles, retrievalItems, reviewHistory,
  speakingAttempts, userProgress, users, vocabularies, writingAttempts, errors as errorsT,
} from "../src/db/schema";
import { generateTodayMission } from "../src/server/services/mission";

async function main() {
  const cmd = process.argv[2];
  if (cmd === "create") {
    const [u] = await db.insert(users).values({ name: "HTTP Smoke" }).returning();
    await db.insert(learningProfiles).values({ userId: u.id, cefr: "B2", immersionLevel: 1, ieltsOverall: 6 });
    await generateTodayMission(u.id);
    console.log(u.id);
  } else if (cmd === "clean") {
    const rows = await db.select().from(users).where(eq(users.name, "HTTP Smoke"));
    for (const u of rows) {
      const chunkIds = (await db.select({ id: chunksT.id }).from(chunksT).where(eq(chunksT.userId, u.id))).map((r) => r.id);
      await db.delete(reviewHistory).where(eq(reviewHistory.userId, u.id));
      await db.delete(retrievalItems).where(eq(retrievalItems.userId, u.id));
      if (chunkIds.length) await db.delete(chunksT).where(inArray(chunksT.id, chunkIds));
      await db.delete(vocabularies).where(eq(vocabularies.userId, u.id));
      await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, u.id));
      await db.delete(writingAttempts).where(eq(writingAttempts.userId, u.id));
      await db.delete(errorsT).where(eq(errorsT.userId, u.id));
      await db.delete(userProgress).where(eq(userProgress.userId, u.id));
      await db.delete(dailyMissions).where(and(eq(dailyMissions.userId, u.id)));
      await db.delete(learningProfiles).where(eq(learningProfiles.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
    console.log("cleaned");
  }
  process.exit(0);
}
main();
