/** Gate normalization: any human session or interrupted run can leave
 *  app_config.activeExam switched (e.g. CET-4), which starves every
 *  selection-dependent suite. This runs FIRST in verify:all so the gate's
 *  result never depends on ambient state left by a previous session.
 *  Suites that need a specific exam during their run pin it themselves
 *  (pin-exam.ts) and restore what this left behind. */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { appConfig } from "../src/db/schema";

async function main() {
  await db
    .insert(appConfig)
    .values({ key: "activeExam", value: "ielts", updatedAt: Date.now() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: "ielts", updatedAt: Date.now() } });
  const [row] = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, "activeExam")).limit(1);
  console.log(`activeExam normalized to ielts (was potentially leaked) — now: ${row?.value}`);
}
void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
