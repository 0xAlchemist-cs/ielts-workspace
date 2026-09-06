import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { generateReviewQueue, getReviewBalance } from "@/server/services/retention";

export async function GET(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") || 10)));
  const filterParam = url.searchParams.get("filter");
  const filter = filterParam === "errors" ? "errors" : filterParam === "retention" ? "retention" : undefined;
  const mode = url.searchParams.get("mode"); // quick | standard | deep
  const actualLimit = mode === "quick" ? 5 : mode === "standard" ? 10 : mode === "deep" ? 20 : limit;

  const [queue, balance] = await Promise.all([
    generateReviewQueue(userId, actualLimit, filter),
    getReviewBalance(userId),
  ]);

  // Categorize for display
  const categories = queue.reduce((acc, q) => {
    acc[q.category] = (acc[q.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const estMinutes = Math.round(queue.length * 1.2);

  return NextResponse.json({ queue, balance, categories, estMinutes, total: queue.length });
}
