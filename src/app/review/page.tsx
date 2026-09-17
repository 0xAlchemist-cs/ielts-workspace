import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { retrievalItems } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { retrievalStats } from "@/server/services/retrieval";
import { getReviewBalance } from "@/server/services/retention";
import { readMemoryPressure, projectTomorrow } from "@/server/services/planner";
import { ReviewSession } from "./session";

export default async function ReviewPage() {
  const cu = await requireUser();
  const userId = cu.user.id;
  const [stats, balance, pressure] = await Promise.all([
    retrievalStats(userId),
    getReviewBalance(userId),
    readMemoryPressure(userId),
  ]);

  // V10: two-scenario tomorrow projection shown when the queue clears —
  // deterministic scheduling behaviour, never a score prediction
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const from = t0.getTime() + 2 * 86_400_000;
  const to = from + 86_400_000;
  const dueRows = await db
    .select({ dueAt: retrievalItems.dueAt })
    .from(retrievalItems)
    .where(and(
      eq(retrievalItems.userId, userId),
      gte(retrievalItems.dueAt, from),
      lte(retrievalItems.dueAt, to),
    ));
  const tomorrow = projectTomorrow({
    dueTomorrowCount: dueRows.length,
    todayRiskCount: Math.min(pressure.pressure.atRiskCount + pressure.pressure.recentFailures, 12),
  });

  return (
    <ReviewSession
      accuracy30d={stats.accuracy30d}
      overdueCount={balance.overdueCount}
      atRiskCount={balance.atRiskCount}
      tomorrow={tomorrow}
    />
  );
}
