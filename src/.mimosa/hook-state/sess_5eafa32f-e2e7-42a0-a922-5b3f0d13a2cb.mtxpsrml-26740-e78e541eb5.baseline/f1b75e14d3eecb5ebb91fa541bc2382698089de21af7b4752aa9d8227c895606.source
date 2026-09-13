// Regex map for detecting corpus chunks inside any sentence.
// Keys are the canonical chunk texts stored in the chunks table.

const AP = "[’']"; // curly or straight apostrophe

export const CHUNK_DETECT: Record<string, RegExp> = {
  "it turns out (that)": /\b(?:it|they|everything)\s+(?:turns|turned)\s+out\b/i,
  "be supposed to": /\b(?:am|is|are|was|were|be|been|being)\s+supposed\s+to\b/i,
  "end up doing": /\bend(?:s|ed|ing)?\s+up\b/i,
  "figure out": /\bfigur(?:e|es|ed|ing)\s+out\b/i,
  "catch up on": /\bcatch(?:es|ed|ing)?\s+up\s+on\b/i,
  "as far as ... is concerned": /\bas\s+far\s+as\b/i,
  "when it comes to": /\bwhen\s+it\s+comes\s+to\b/i,
  "put off doing": /\bput(?:s|ting)?\s+off\b/i,
  "be aware of": /\b(?:am|is|are|was|were|be|been)\s+aware\s+(?:of|that)\b/i,
  "come up with": /\b(?:come|comes|came|coming)\s+up\s+with\b/i,
  "there is no denying (that)": /\bthere(?:\s+is|\s+s|${AP}s)\s+no\s+denying\b/i,
  "take up": /\b(?:take|takes|took|taking)\s+up\b/i,
  "run out of": /\b(?:run|runs|ran|running)\s+out\s+of\b/i,
  "cut down on": /\bcut(?:s|ting)?\s+down\s+on\b/i,
  "be worth doing": /\b(?:am|is|are|was|were|be|been)\s+worth\b/i,
  "get used to": /\b(?:get|gets|got|getting)\s+used\s+to\b/i,
  "have an impact on": /\bimpact\s+on\b/i,
  "play a role in": /\bplay(?:s|ed|ing)?\s+(?:a|an|its|some|no)?\s*(?:growing\s+|key\s+|major\s+|small\s+)?(?:role|part)\s+in\b/i,
  "get away with": /\b(?:get|gets|got|getting)\s+away\s+with\b/i,
  "a double-edged sword": /\bdouble[-\s]edged\s+sword\b/i,
  "keep up with": /\b(?:keep|keeps|kept|keeping)\s+up\s+with\b/i,
  "I've been meaning to": new RegExp(`\\bi(?:${AP}ve|\\s+have)?\\s+been\\s+meaning\\s+to\\b`, "i"),
  "I was going to": /\bi\s+was\s+going\s+to\b/i,
  "what matters is": /\bwhat\s+matters\s+is\b/i,
  "I was wondering if": new RegExp(`\\bi\\s+was\\s+wondering\\s+(?:if|whether)\\b`, "i"),
  "be fully booked": /\b(?:fully\s+booked|(?:(?:we|they|it|i)(${AP}?re|${AP}?s|${AP}?m)|am|is|are|was|were)\s+booked)\b/i,
  "see what I can do": /\bsee\s+what\s+(?:i|we)\s+can\s+do\b/i,
  "stay up late": /\bstay(?:s|ed|ing)?\s+up\b/i,
  "without a second thought": /\bwithout\s+a\s+second\s+thought\b/i,
};

/** Which corpus chunks appear in the given sentence? */
export function detectChunksInSentence(sentence: string): string[] {
  const found: string[] = [];
  for (const [text, re] of Object.entries(CHUNK_DETECT)) {
    if (re.test(sentence)) found.push(text);
  }
  // "as far as ... is concerned" also matches plain "as far as" — fine.
  return found;
}
