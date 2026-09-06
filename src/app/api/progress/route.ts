import { NextResponse } from "next/server";
import { getCurrentUser, getUserIdOrNull } from "@/server/current-user";
import { getDashboardStats, getTodayFunnel } from "@/server/services/progress";
import { retrievalStats } from "@/server/services/retrieval";

export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const cu = (await getCurrentUser())!;
  const [funnel, stats, retrieval] = await Promise.all([
    getTodayFunnel(userId),
    getDashboardStats(userId, cu.profile.ieltsOverall),
    retrievalStats(userId),
  ]);
  return NextResponse.json({ funnel, stats, retrieval });
}
