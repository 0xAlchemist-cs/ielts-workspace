import { db } from "@/db";
import { contents } from "@/db/schema";
import { requireUser } from "@/server/current-user";
import { isReadableContent } from "@/server/services/content-selection";
import { importSummary, listImports } from "@/server/services/import-resource";
import { LibraryView } from "./view";

export default async function LibraryPage() {
  const cu = await requireUser();
  const exam = cu.user.examProfile;
  const all = (await db.select().from(contents))
    .sort((a, b) => a.id - b.id)
    // exam-profile corpus: only this goal's material is visible (V8);
    // "archive" = unreadable residue; imported audio/video has no transcript
    // by design — it's real listening material with a playable file
    .filter(
      (c) =>
        c.examProfile === exam &&
        c.topic !== "archive" &&
        (isReadableContent(c) || (c.type === "listening" && !!c.audioUrl && c.audioUrl.startsWith("/api/uploads/"))),
    );
  const [imports, summary] = await Promise.all([listImports(cu.user.id), importSummary(cu.user.id)]);
  // V9 honesty: imported material whose level was never AI-analyzed hides its
  // badge (the ranking-only heuristic must not reach the display); seeded
  // corpus annotations and analyzed imports show theirs
  const importedContentIds = new Set(imports.filter((r) => r.contentId).map((r) => r.contentId as number));
  return (
    <LibraryView
      contents={all.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        topic: c.topic,
        cefr: c.cefr,
        showLevel: !importedContentIds.has(c.id) || Object.keys(c.cefrMeta ?? {}).length > 0,
        difficulty: c.difficulty,
        vocabDensity: c.vocabDensity,
        ieltsRelevance: c.ieltsRelevance,
        summaryEn: c.summaryEn,
        minutes: c.minutes,
      }))}
      imports={imports}
      importSummary={summary}
      userLevel={cu.user.examProfile === "ielts" ? cu.profile.cefr : undefined}
    />
  );
}
