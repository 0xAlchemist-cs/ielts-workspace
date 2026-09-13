import { db } from "@/db";
import { contents } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { isReadableContent } from "@/server/services/content-selection";
import { LibraryView } from "./view";

export default async function LibraryPage() {
  await requireUser();
  const all = (await db.select().from(contents))
    .sort((a, b) => a.id - b.id)
    // "archive" = unreadable residue (CJK appendices, stubs) — not library material
    .filter((c) => c.topic !== "archive" && isReadableContent(c));
  return (
    <LibraryView
      contents={all.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        topic: c.topic,
        cefr: c.cefr,
        difficulty: c.difficulty,
        vocabDensity: c.vocabDensity,
        ieltsRelevance: c.ieltsRelevance,
        summaryEn: c.summaryEn,
        minutes: c.minutes,
      }))}
    />
  );
}
