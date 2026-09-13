import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { dictionary, wordLemmas } from "@/db/schema";
import { lemmaCandidates } from "@/lib/text";
import { lookupGlossary } from "@/lib/glossary";
import type { WordAnalysis } from "@/lib/types";

export type DictionaryRow = {
  word: string;
  phonetic: string;
  definitionEn: string;
  translationZh: string;
  pos: string;
  collins: number;
  oxford: number;
  tag: string;
  bnc: number;
  frq: number;
  exchange: string;
};

export interface WordLookup {
  entry: DictionaryRow;
  matchedForm: string; // surface form typed/clicked
  viaLemma: boolean; // true when resolved through a base-form mapping
}

function clean(s: string): string {
  return s.replace(/\\n/g, "\n").trim();
}

/** ECDICT-backed lookup: direct hit → lemma map → suffix heuristics. */
export async function lookupWord(raw: string): Promise<WordLookup | null> {
  const w = raw.toLowerCase().replace(/[^a-z'-]/g, "");
  if (!w) return null;

  const direct = await db.select().from(dictionary).where(eq(dictionary.word, w)).limit(1);
  if (direct.length) return { entry: direct[0] as DictionaryRow, matchedForm: w, viaLemma: false };

  const lemma = await db.select().from(wordLemmas).where(eq(wordLemmas.form, w)).limit(1);
  if (lemma.length) {
    const base = await db
      .select()
      .from(dictionary)
      .where(eq(dictionary.word, lemma[0].base))
      .limit(1);
    if (base.length) return { entry: base[0] as DictionaryRow, matchedForm: w, viaLemma: true };
  }

  for (const cand of lemmaCandidates(w)) {
    if (cand === w) continue;
    const row = await db.select().from(dictionary).where(eq(dictionary.word, cand)).limit(1);
    if (row.length) return { entry: row[0] as DictionaryRow, matchedForm: w, viaLemma: true };
  }
  return null;
}

export function cefrFromTags(tag: string, bnc: number): string {
  const t = ` ${tag} `;
  if (t.includes(" toefl ") || t.includes(" gre ")) return "C1";
  if (t.includes(" cet6 ") || t.includes(" ky ") || t.includes(" ielts ")) return "B2";
  if (t.includes(" cet4 ") || t.includes(" gk ")) return "B1";
  if (t.includes(" zk ")) return "A2";
  if (bnc > 0 && bnc <= 3000) return "A2";
  if (bnc > 0 && bnc <= 10000) return "B1";
  if (bnc > 0 && bnc <= 25000) return "B2";
  return "B2";
}

export type FrequencyTier = "core" | "common" | "advanced" | "rare";

/** How notable a word is for a B1–B2 reader: rare/advanced words get underlined. */
export function frequencyTier(entry: DictionaryRow | null, surface: string): FrequencyTier {
  if (!entry) {
    // Not in the top-60k dictionary at all → almost certainly worth clicking.
    return /^[A-Z]/.test(surface) ? "rare" : "advanced";
  }
  const best = Math.min(entry.bnc || 999999, entry.frq || 999999);
  if (best <= 4000) return "core";
  if (best <= 12000) return "common";
  return "advanced";
}

/** Batch best-rank lookup (BNC/COCA min) for difficulty scoring. Missing → fallbackRank. */
export function wordRanksFor(words: string[], fallbackRank = 45000): Record<string, number> {
  const stmt = sqlite.prepare(`SELECT word, bnc, frq FROM dictionary WHERE word = ?`);
  const lemmaStmt = sqlite.prepare(`SELECT base FROM word_lemmas WHERE form = ?`);
  const out: Record<string, number> = {};
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[^a-z'-]/g, "");
    if (!w || w.length < 3 || out[w] !== undefined) continue;
    let row = stmt.get(w) as { bnc: number; frq: number } | undefined;
    if (!row) {
      const lemma = lemmaStmt.get(w) as { base: string } | undefined;
      if (lemma) row = stmt.get(lemma.base) as typeof row;
    }
    out[w] = row ? Math.min(row.bnc || 999999, row.frq || 999999) : fallbackRank;
  }
  return out;
}

/** Batch tier lookup for a whole article — one prepared statement, bound params. */
export function wordTiersFor(words: string[]): Record<string, FrequencyTier> {
  const stmt = sqlite.prepare(
    `SELECT word, bnc, frq, collins, oxford FROM dictionary WHERE word = ?`,
  );
  const lemmaStmt = sqlite.prepare(`SELECT base FROM word_lemmas WHERE form = ?`);
  const out: Record<string, FrequencyTier> = {};
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[^a-z'-]/g, "");
    if (!w || w.length < 3) continue;
    if (out[w]) continue;
    let row = stmt.get(w) as { bnc: number; frq: number; collins: number; oxford: number } | undefined;
    if (!row) {
      const lemma = lemmaStmt.get(w) as { base: string } | undefined;
      if (lemma) row = stmt.get(lemma.base) as typeof row;
    }
    if (!row) {
      out[w] = /^[A-Z]/.test(raw) ? "rare" : "advanced";
      continue;
    }
    const best = Math.min(row.bnc || 999999, row.frq || 999999);
    out[w] = best <= 4000 ? "core" : best <= 12000 ? "common" : "advanced";
  }
  return out;
}

function firstMeaningLines(s: string, maxLines: number): string {
  const lines = clean(s)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("[") && !/^｛/.test(l));
  return lines.slice(0, maxLines).join("\n");
}

/** Build the four-layer word card from ECDICT + glossary overlay.
 *  English meaning first; Chinese stays behind an explicit reveal. */
export function buildWordAnalysis(
  lookup: WordLookup,
  sentenceContext?: string,
): WordAnalysis {
  const { entry } = lookup;
  const definitionEn = firstMeaningLines(entry.definitionEn, 3);
  const translationZh = firstMeaningLines(entry.translationZh, 3);
  const glossary = lookupGlossary(lookup.matchedForm)?.entry;

  const contextual =
    sentenceContext && definitionEn
      ? definitionEn.split("\n")[0]
      : definitionEn.split("\n")[0] || "(no English definition available)";

  return {
    word: lookup.matchedForm,
    contextualMeaning: contextual,
    grammar: "(from ECDICT) connect a live AI provider for grammar behaviour — what structure follows, who can be the subject.",
    registerNote: "(from ECDICT) connect a live AI provider for the register ladder (formality, near-synonyms).",
    simpleDefinition: definitionEn || glossary?.meaningEn || "—",
    example: glossary?.example ?? (definitionEn ? `e.g. usage of “${entry.word}” — connect a live AI provider for a fresh example sentence.` : "—"),
    collocations: glossary?.collocations ?? [],
    meaningZh: translationZh || glossary?.meaningZh || "（无中文释义）",
    cefr: cefrFromTags(entry.tag, entry.bnc),
    isMock: true,
  };
}
