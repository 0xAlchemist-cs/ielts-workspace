import { NextResponse } from "next/server";
import { getProvider, isLiveConfigured } from "@/lib/ai";
import { buildWordAnalysis, lookupWord } from "@/server/services/dictionary";
import { lookupGlossary } from "@/lib/glossary";
import { getUserIdOrNull } from "@/server/current-user";
import { readJsonBody, stringField, badRequest } from "@/lib/request";

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await readJsonBody<{ word?: unknown; sentenceContext?: unknown }>(req);
  const word = stringField(body, "word", 100);
  if (!word) return badRequest(body == null ? "invalid JSON body" : "word required (string, ≤ 100 chars)");
  const sentenceContext = stringField(body, "sentenceContext", 2000) ?? "";

  const lookup = await lookupWord(word);

  if (isLiveConfigured()) {
    // Live: context-aware analysis first, dictionary as fallback.
    try {
      const result = await getProvider().word({ word, sentenceContext });
      return NextResponse.json(result);
    } catch {
      /* falls through to dictionary */
    }
  }

  if (lookup) {
    const analysis = buildWordAnalysis(lookup, sentenceContext);
    const glossary = lookupGlossary(word);
    if (glossary) {
      // glossary overlay: curated example + collocations win over raw ECDICT
      analysis.example = glossary.entry.example;
      analysis.collocations = glossary.entry.collocations;
      analysis.meaningZh = `${analysis.meaningZh.split("\n")[0]}（${glossary.entry.meaningZh}）`;
      analysis.cefr = glossary.entry.cefr;
    }
    return NextResponse.json(analysis);
  }

  const result = await getProvider().word({ word, sentenceContext });
  return NextResponse.json(result);
}
