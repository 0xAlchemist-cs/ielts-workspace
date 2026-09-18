/** Test hermeticity helper: the content-selection engine reads the GLOBAL
 *  activeExam (app_config). Any browser session or E2E can leave it switched,
 *  which silently starves selection-dependent suites (empty pool under CET).
 *  Suites that exercise selection/mission pin the exam for their temp users
 *  and restore the previous value on exit. */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { appConfig } from "../src/db/schema";

type ExamProfile = "ielts" | "cet4" | "cet6";

export async function pinActiveExam(exam: ExamProfile): Promise<() => Promise<void>> {
  const [prev] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "activeExam"))
    .limit(1);
  const previous = (prev?.value ?? "ielts") as ExamProfile;
  await db
    .insert(appConfig)
    .values({ key: "activeExam", value: exam, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: exam, updatedAt: Date.now() } });
  return async () => {
    await db
      .insert(appConfig)
      .values({ key: "activeExam", value: previous, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: appConfig.key, set: { value: previous, updatedAt: Date.now() } });
  };
}
