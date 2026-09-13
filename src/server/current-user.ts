import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { learningProfiles, users } from "@/db/schema";
import type { LearningProfile, User } from "@/db/schema";

export interface CurrentUser {
  user: User;
  profile: LearningProfile;
}

/** Single-user app: the first (and only) user row. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const rows = await db
    .select({ user: users, profile: learningProfiles })
    .from(users)
    .leftJoin(learningProfiles, eq(learningProfiles.userId, users.id))
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
