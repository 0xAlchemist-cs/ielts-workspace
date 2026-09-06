// ── Text utilities shared by seed scripts and the app ───────────────────────

const CONTRACTIONS: Record<string, string> = {
  "i've": "i have",
  "i'm": "i am",
  "i'd": "i would",
  "i'll": "i will",
  "you've": "you have",
  "you're": "you are",
  "you'll": "you will",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "we've": "we have",
  "we're": "we are",
  "they've": "they have",
  "they're": "they are",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "cannot",
  "won't": "will not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not",
  "that's": "that is",
  "there's": "there is",
  "let's": "let us",
  gonna: "going to",
  wanna: "want to",
  gotta: "got to",
  "d'you": "do you",
  "'cause": "because",
};

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Deterministic sentence splitter — used by both the seed script and pages,
 * so sentence indices stored in the DB always align with rendered sentences. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of splitParagraphs(text)) {
    const pieces = para
      .split(/(?<=[.!?…])\s+(?=[A-Z"'“‘(])/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const piece of pieces) {
      // Merge sentence fragments like `Mr.` / `Dr.` back together.
      if (out.length && /\b(Mr|Mrs|Ms|Dr|St)\.$/.test(out[out.length - 1])) {
        out[out.length - 1] += " " + piece;
      } else {
        out.push(piece);
      }
    }
  }
  return out;
}

export function tokenizeWords(sentence: string): string[] {
  return sentence.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
}

export function normalizeText(s: string): string {
  let t = s.toLowerCase().trim();
  t = t.replace(/[’']/g, "'");
  t = t.replace(/[^a-z0-9'\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  // Expand contractions so "I've been meaning to" ≈ "I have been meaning to".
  const words: string[] = [];
  for (const w of t.split(" ")) {
    words.push(CONTRACTIONS[w] ?? w);
  }
  return words.join(" ");
}

export function wordTokens(s: string): string[] {
  return normalizeText(s).split(" ").filter(Boolean);
}

const STOPWORDS = new Set([
  "a", "an", "the", "i", "you", "he", "she", "it", "we", "they",
  "me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their",
  "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did",
  "have", "has", "had", "will", "would", "can", "could", "shall", "should",
  "may", "might", "must", "to", "of", "in", "on", "at", "for", "with", "and",
  "or", "but", "so", "if", "that", "this", "these", "those", "there", "here",
  "as", "by", "from", "about", "into", "up", "down", "out", "not", "very",
]);

export function contentTokens(s: string): string[] {
  return wordTokens(s).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Naive morphological lookup candidates: word → possible base forms. */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z'-]/g, "");
  const out = [w];
  if (w.endsWith("ies") && w.length > 4) out.push(w.slice(0, -3) + "y");
  if (w.endsWith("es") && w.length > 3) out.push(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) out.push(w.slice(0, -1));
  if (w.endsWith("ing") && w.length > 5) {
    out.push(w.slice(0, -3));
    out.push(w.slice(0, -3) + "e"); // managing → manage
  }
  if (w.endsWith("ed") && w.length > 4) {
    out.push(w.slice(0, -2));
    out.push(w.slice(0, -1)); // realised → realise
  }
  if (w.endsWith("er")) out.push(w.slice(0, -2));
  if (w.endsWith("ly")) out.push(w.slice(0, -2));
  return [...new Set(out)];
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(aMs: number, bMs: number): number {
  return Math.abs(aMs - bMs) / 86_400_000;
}
