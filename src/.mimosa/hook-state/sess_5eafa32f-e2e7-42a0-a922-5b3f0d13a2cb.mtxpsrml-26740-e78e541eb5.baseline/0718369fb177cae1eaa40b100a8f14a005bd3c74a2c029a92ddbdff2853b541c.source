import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { takeDailySnapshot, getTrajectory, generateWeeklyReview, getLearningEfficiency, estimateIeltsReadiness } from "@/server/services/trajectory";

export async function GET(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const url = new URL(req.url);
  const range = url.searchParams.get("range");
  const days = range === "7" ? 7 : range === "90" ? 90 : range === "all" ? 365 : 30;

  const [snapshot, trajectory, weekly, efficiency] = await Promise.all([
    takeDailySnapshot(userId),
    getTrajectory(userId, days as 7 | 30 | 90 | 365),
    generateWeeklyReview(userId),
    getLearningEfficiency(userId),
  ]);

  return NextResponse.json({
    snapshot,
    trajectory: {
      trends: trajectory.trends,
      bottleneck: trajectory.bottleneck,
      plateau: trajectory.plateau,
      acceleration: trajectory.acceleration,
      snapshotCount: trajectory.snapshots.length,
    },
    weekly,
    efficiency,
  });
}
