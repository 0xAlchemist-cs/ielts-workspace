import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { appConfig, learningProfiles, users } from "@/db/schema";
import type { LearningProfile, User } from "@/db/schema";
import { EXAM_PROFILES, isExamProfile, type ExamProfile } from "@/lib/exam-profiles";

export type { ExamProfile };
export { EXAM_PROFILES, isExamProfile };

export interface CurrentUser {
  user: User;
  profile: LearningProfile;
}

/** The active exam goal — a single app-level setting, defaulting to IELTS. */
export async function getActiveExam(): Promise<ExamProfile> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "activeExam"))
    .limit(1);
  return isExamProfile(row?.value) ? row.value : "ielts";
}

export async function setActiveExam(exam: ExamProfile): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key: "activeExam", value: exam })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: exam, updatedAt: Date.now() } });
}

/** One learning-memory namespace per exam goal: the user row whose
 * exam_profile matches the active exam. Every per-user engine (retrieval,
 * errors, missions, progress) keys on userId, so switching the exam switches
 * learning memory completely — with zero engine changes. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const exam = await getActiveExam();
  const rows = await db
    .select({ user: users, profile: learningProfiles })
    .from(users)
    .leftJoin(learningProfiles, eq(learningProfiles.userId, users.id))
    .where(eq(users.examProfile, exam))
    .orderBy(users.id)
    .limit(1);
  if (!rows.length) return null;
  if (!rows[0].profile) return null;
  return { user: rows[0].user, profile: rows[0].profile };
}

/** For pages: bounce to the guided first session when no user/profile exists yet. */
export async function requireUser(): Promise<CurrentUser> {
  const cu = await getCurrentUser();
  if (!cu) redirect("/welcome");
  return cu;
}

/** For route handlers: caller decides how to respond. */
export async function getUserIdOrNull(): Promise<number | null> {
  const cu = await getCurrentUser();
  return cu?.user.id ?? null;
}
