import { NextResponse } from "next/server";
import { getUserIdOrNull } from "@/server/current-user";
import { getOrCreateTodayMission } from "@/server/services/mission";

export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const mission = await getOrCreateTodayMission(userId);
  return NextResponse.json({ mission });
}
