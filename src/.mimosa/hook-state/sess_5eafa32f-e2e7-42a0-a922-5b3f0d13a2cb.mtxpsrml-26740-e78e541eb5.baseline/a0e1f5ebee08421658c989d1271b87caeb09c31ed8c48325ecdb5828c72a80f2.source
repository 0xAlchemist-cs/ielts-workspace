import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { getBandGaps } from "@/server/services/ielts-engine";

/** GET /api/ielts/readiness — band gaps + per-skill profiles */
export async function GET(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const url = new URL(req.url);
  const target = Number(url.searchParams.get("target") || 6.5);

  const gaps = await getBandGaps(userId, target);
  return NextResponse.json({ gaps, targetBand: target });
}
