import { requireUser } from "@/server/current-user";
import { getOrCreateTodayMission, markStepDone } from "@/server/services/mission";
import { buildSessionPlan } from "@/server/services/session-plan";
import { SessionView } from "./view";
import type { MissionPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ── V13.1 Learning Session — one continuous flow from Planner output ──────
 * The mission IS the session plan; this page orchestrates the sequence.
 * Activities execute inside existing modules (embedded via route transitions);
 * completion writes through existing markStepDone + evidence pipelines.
 * V16 hardening: the activity sequence + totals come from the shared
 * buildSessionPlan (same source the Today card reads) — count and minutes
 * can no longer disagree between the two screens. */

type StepKey = "reading" | "listening" | "notice" | "deep" | "retrieval" | "speaking" | "transfer";

export default async function SessionPage() {
  const cu = await requireUser();
  const userId = cu.user.id;
  const mission = await getOrCreateTodayMission(userId);
  const plan = mission.plan as MissionPlan;

  const summary = await buildSessionPlan(plan, cu.user.examProfile, userId);
  const allDone = mission.status === "completed";
  const current = summary.activities[0];
  const elapsedMinutes = current
    ? summary.totalMinutes - summary.pendingMinutes
    : summary.totalMinutes;

  return (
    <SessionView
      activities={summary.activities}
      position={allDone ? summary.totalCount : summary.position}
      totalCount={summary.totalCount}
      elapsedMinutes={elapsedMinutes}
      totalMinutes={summary.totalMinutes}
      blocked={!summary.hasItems && (current?.requiresItem ?? false)}
      missionId={mission.id}
      onComplete={async (step: string) => {
        "use server";
        await markStepDone(userId, step as StepKey);
      }}
    />
  );
}
