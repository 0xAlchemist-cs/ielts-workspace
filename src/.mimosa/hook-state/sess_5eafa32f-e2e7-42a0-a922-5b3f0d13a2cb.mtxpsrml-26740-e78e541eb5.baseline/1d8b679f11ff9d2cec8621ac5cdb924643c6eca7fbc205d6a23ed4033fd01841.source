import { requireUser } from "@/server/current-user";
import { retrievalStats } from "@/server/services/retrieval";
import { getReviewBalance } from "@/server/services/retention";
import { ReviewSession } from "./session";

export default async function ReviewPage() {
  const cu = await requireUser();
  const userId = cu.user.id;
  const [stats, balance] = await Promise.all([
    retrievalStats(userId),
    getReviewBalance(userId),
  ]);
  return (
    <ReviewSession
      accuracy30d={stats.accuracy30d}
      overdueCount={balance.overdueCount}
      atRiskCount={balance.atRiskCount}
    />
  );
}
