import { requireUser } from "@/server/current-user";
import { buildLearningStory } from "@/server/services/learning-story";
import { ProgressView } from "./view";

export const dynamic = "force-dynamic";

/* ── V15.3 Progress = the learning story: what happened lately, what is
 *    strengthening, what keeps going wrong, what happens next. Facts from
 *    real evidence only — no scores, no mastery claims, no second queue. */

export default async function ProgressPage() {
  const cu = await requireUser();
  const story = await buildLearningStory(cu.user.id);
  return <ProgressView story={story} />;
}
