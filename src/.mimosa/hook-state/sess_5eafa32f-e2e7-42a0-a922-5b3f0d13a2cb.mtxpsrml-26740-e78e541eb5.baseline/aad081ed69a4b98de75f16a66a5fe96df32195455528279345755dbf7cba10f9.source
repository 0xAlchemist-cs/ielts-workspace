import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contents } from "@/db/schema";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const cefr = url.searchParams.get("cefr");
  const topic = url.searchParams.get("topic");

  let rows = await db.select().from(contents);
  if (type === "reading" || type === "listening") rows = rows.filter((r) => r.type === type);
  if (cefr) rows = rows.filter((r) => r.cefr === cefr);
  if (topic) rows = rows.filter((r) => r.topic === topic);
  rows.sort((a, b) => a.id - b.id);
  return NextResponse.json({
    contents: rows.map(({ body, ...rest }) => ({ ...rest, words: body.split(/\s+/).length })),
  });
}
