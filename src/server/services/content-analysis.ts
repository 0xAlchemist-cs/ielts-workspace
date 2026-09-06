import { tokenizeWords, contentTokens, splitSentences, wordTokens } from "@/lib/text";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { lookupWord, wordTiersFor } from "@/server/services/dictionary";

/* ── Content Analysis Engine ────────────────────────────────────────────────
 * Given any English text, extract high-value language items, score difficulty,
 * and produce AI-style recommendations with explainable "why this" reasons. */

export interface ExtractedItem {
  type: "chunk" | "vocab" | "sentence_pattern" | "grammar_pattern" | "ielts_expression";
  text: string;
  pattern?: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  contextSentence: string;
  contextBefore?: string;
  contextAfter?: string;
  cefr: string;
  ieltsRelevance: number; // 1-5
  frequency: number; // occurrences in text
  whyThis: string;
  sourceTopic?: string;
}

export interface ContentAnalysis {
  cefr: string;
  difficulty: number; // 1-5
  ieltsRelevance: number; // 1-5
  topic: string;
  mainIdea: string;
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  lexicalVariety: number; // 0-1
  keyVocabulary: ExtractedItem[];
  usefulChunks: ExtractedItem[];
  sentencePatterns: ExtractedItem[];
  grammarPatterns: ExtractedItem[];
  ieltsExpressions: ExtractedItem[];
  recommended: ExtractedItem[]; // top 5, sorted by value
  comprehensionQuestions: { question: string; answer: string; type: "main_idea" | "detail" | "inference" | "vocabulary" | "paraphrase" }[];
}

const GRAMMAR_PATTERNS: { name: string; regex: RegExp; example: string; meaningEn: string; meaningZh: string }[] = [
  { name: "Present Perfect", regex: /\b(have|has)\s+\w+(ed|en)\b/i, example: "has changed", meaningEn: "Connects past action to present state", meaningZh: "过去动作与现在的联系" },
  { name: "Passive Voice", regex: /\b(is|are|was|were|be|been)\s+\w+(ed|en)\b/i, example: "is produced", meaningEn: "Focuses on the action, not the actor", meaningZh: "强调动作而非执行者" },
  { name: "Conditional (Type 2)", regex: /\bif\s+\w+\s+(were|had|would)\b/i, example: "if this were true", meaningEn: "Hypothetical situation", meaningZh: "假设情况" },
  { name: "Relative Clause", regex: /\b(which|who|that|whose|where)\s+\w+/i, example: "which shows that", meaningEn: "Adds information to a noun", meaningZh: "为名词添加信息" },
  { name: "Comparative Structure", regex: /\b(more|less|fewer)\s+\w+\s+than\b/i, example: "more important than", meaningEn: "Compares two things", meaningZh: "比较两个事物" },
  { name: "Concessive Clause", regex: /\b(although|though|even though|despite|in spite of)\b/i, example: "although this is true", meaningEn: "Acknowledges a point before countering", meaningZh: "先承认后反驳" },
  { name: "Cleft Sentence", regex: /\bit\s+is\s+\w+\s+that\b/i, example: "it is clear that", meaningEn: "Emphasizes a specific element", meaningZh: "强调特定元素" },
  { name: "Gerund Subject", regex: /^[A-Z][a-z]+ing\s+\w+/m, example: "Learning English requires", meaningEn: "Using -ing form as subject", meaningZh: "动名词作主语" },
];

const SENTENCE_PATTERNS: { name: string; regex: RegExp; pattern: string; meaningEn: string; meaningZh: string; ielts: number }[] = [
  { name: "There is no denying", regex: /\bthere\s+is\s+no\s+denying\b/i, pattern: "There is no denying that + clause", meaningEn: "Strong concession opener", meaningZh: "强力让步开头", ielts: 5 },
  { name: "Play a crucial role", regex: /\bplay(s|ed|ing)?\s+a?\s*(crucial|significant|vital|key|major|growing|important)\s+role\b/i, pattern: "play a [adjective] role in + noun", meaningEn: "Expresses importance of something", meaningZh: "表达重要性", ielts: 5 },
  { name: "Have an impact on", regex: /\b(have|has|had)?\s*an?\s+(impact|effect|influence)\s+on\b/i, pattern: "have an impact/effect on + noun", meaningEn: "Expresses causal relationship", meaningZh: "因果关系", ielts: 5 },
  { name: "Not only... but also", regex: /\bnot\s+only\s+\w+\s+but\s+(also|but)\b/i, pattern: "not only... but also...", meaningEn: "Adds emphasis to parallel ideas", meaningZh: "强调并列观点", ielts: 4 },
  { name: "The more... the more", regex: /\bthe\s+more\s+\w+,?\s+the\s+more\b/i, pattern: "the more..., the more...", meaningEn: "Correlative comparison", meaningZh: "相关性比较", ielts: 4 },
  { name: "As far as... is concerned", regex: /\bas\s+far\s+as\s+\w+\s+is\s+concerned\b/i, pattern: "as far as + noun + is concerned", meaningEn: "Limits opinion to one topic", meaningZh: "限定话题范围", ielts: 4 },
  { name: "When it comes to", regex: /\bwhen\s+it\s+comes\s+to\b/i, pattern: "when it comes to + noun/-ing", meaningEn: "Introduces a topic", meaningZh: "引入话题", ielts: 4 },
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology: ["technology", "digital", "internet", "smartphone", "computer", "ai", "software", "online", "social media", "app"],
  environment: ["environment", "climate", "pollution", "green", "sustainable", "carbon", "waste", "recycling", "plastic", "energy"],
  education: ["education", "school", "university", "student", "learning", "teaching", "academic", "course", "study", "knowledge"],
  health: ["health", "medical", "doctor", "disease", "exercise", "diet", "sleep", "mental", "fitness", "nutrition"],
  society: ["society", "social", "community", "population", "urban", "poverty", "inequality", "culture", "tradition", "family"],
  economy: ["economy", "economic", "market", "business", "trade", "financial", "growth", "employment", "industry", "consumer"],
  work: ["work", "job", "career", "profession", "workplace", "employee", "remote", "office", "management", "skill"],
  psychology: ["psychology", "behaviour", "behavior", "habit", "motivation", "mind", "brain", "emotion", "memory", "cognitive"],
};

function detectTopic(text: string): string {
  const lower = text.toLowerCase();
  let bestTopic = "general";
  let bestScore = 0;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }
  return bestTopic;
}

/** Main analysis function: takes raw English text, returns full ContentAnalysis. */
export async function analyzeContent(text: string): Promise<ContentAnalysis> {
  const trimmed = text.trim();
  const sentences = splitSentences(trimmed.replace(/\n+/g, "\n\n"));
  const words = tokenizeWords(trimmed);
  const wordCount = words.length;
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const lexicalVariety = wordCount ? uniqueWords.size / wordCount : 0;
  const avgSentenceLength = sentences.length ? wordCount / sentences.length : 0;
  const topic = detectTopic(trimmed);

  // ── Difficulty scoring (uses ECDICT word frequency) ─────────────────────
  const tiers = wordTiersFor(words);
  const totalWords = Object.keys(tiers).length;
  const advancedCount = Object.values(tiers).filter((t) => t === "advanced" || t === "rare").length;
  const advancedRatio = totalWords ? advancedCount / totalWords : 0;

  let cefr = "B1";
  let difficulty = 3;
  if (advancedRatio >= 0.08 || avgSentenceLength >= 24) { cefr = "C1"; difficulty = 5; }
  else if (advancedRatio >= 0.04 || avgSentenceLength >= 18) { cefr = "B2"; difficulty = 4; }
  else if (advancedRatio < 0.01 && avgSentenceLength < 12) { cefr = "A2"; difficulty = 2; }

  // ── IELTS relevance ──────────────────────────────────────────────────────
  const ieltsKeywords = ["argue", "opinion", "advantage", "disadvantage", "furthermore", "however", "consequently", "significant", "crucial", "impact", "trend", "compare", "contrast", "cause", "effect", "increase", "decrease", "percentage", "proportion"];
  const ieltsHits = ieltsKeywords.filter((kw) => trimmed.toLowerCase().includes(kw)).length;
  const ieltsRelevance = Math.min(5, Math.max(1, Math.ceil(ieltsHits / 2)));

  // ── Main idea (first + last sentences heuristic) ────────────────────────
  const mainIdea = sentences.length > 2
    ? `${sentences[0].slice(0, 120)}... ${sentences[sentences.length - 1].slice(0, 100)}`
    : sentences[0]?.slice(0, 200) ?? "";

  // ── Extract chunks ───────────────────────────────────────────────────────
  const usefulChunks: ExtractedItem[] = [];
  const chunkCounts = new Map<string, number>();
  const chunkContexts = new Map<string, string>();

  for (const [chunkText, regex] of Object.entries(CHUNK_DETECT)) {
    const matches = trimmed.match(new RegExp(regex.source, "gi"));
    if (matches && matches.length > 0) {
      chunkCounts.set(chunkText, matches.length);
      // Find the sentence containing this chunk
      const sent = sentences.find((s) => regex.test(s));
      if (sent) chunkContexts.set(chunkText, sent);
    }
  }

  for (const [chunkText, count] of chunkCounts) {
    const contextSentence = chunkContexts.get(chunkText) ?? "";
    const lookup = await lookupWord(chunkText.split(" ")[0]);
    usefulChunks.push({
      type: "chunk",
      text: chunkText,
      pattern: chunkText,
      meaningEn: `Multi-word expression: "${chunkText}"`,
      meaningZh: "",
      examples: [contextSentence],
      contextSentence,
      cefr,
      ieltsRelevance: 4,
      frequency: count,
      whyThis: `"${chunkText}" appears ${count}× in this text${count > 1 ? " (high-frequency = high-value)" : ""}. It's a reusable chunk that transfers directly to IELTS Speaking and Writing.`,
      sourceTopic: topic,
    });
  }

  // ── Extract key vocabulary (top advanced words) ─────────────────────────
  const keyVocabulary: ExtractedItem[] = [];
  const advancedWords = Object.entries(tiers)
    .filter(([word, tier]) => tier === "advanced" || tier === "rare")
    .slice(0, 15);

  for (const [word] of advancedWords) {
    const lookup = await lookupWord(word);
    const contextSentence = sentences.find((s) => s.toLowerCase().includes(word)) ?? "";
    if (lookup) {
      keyVocabulary.push({
        type: "vocab",
        text: word,
        meaningEn: lookup.entry.definitionEn.split("\n")[0]?.slice(0, 150) ?? "",
        meaningZh: lookup.entry.translationZh.split("\n")[0]?.slice(0, 80) ?? "",
        examples: [contextSentence],
        contextSentence,
        cefr: "B2",
        ieltsRelevance: lookup.entry.bnc <= 10000 ? 4 : 3,
        frequency: (trimmed.toLowerCase().match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length,
        whyThis: `"${word}" is an advanced word (BNC rank ${lookup.entry.bnc || "?"}) that appeared in context. High-value for IELTS Lexical Resource.`,
        sourceTopic: topic,
      });
    }
  }

  // ── Extract sentence patterns ────────────────────────────────────────────
  const sentencePatterns: ExtractedItem[] = [];
  for (const sp of SENTENCE_PATTERNS) {
    const match = trimmed.match(sp.regex);
    if (match) {
      const sent = sentences.find((s) => sp.regex.test(s)) ?? "";
      sentencePatterns.push({
        type: "sentence_pattern",
        text: sp.name,
        pattern: sp.pattern,
        meaningEn: sp.meaningEn,
        meaningZh: sp.meaningZh,
        examples: [sent],
        contextSentence: sent,
        cefr,
        ieltsRelevance: sp.ielts,
        frequency: 1,
        whyThis: `"${sp.name}" — a high-value sentence structure for IELTS Writing (${sp.ielts}/5 relevance). Appears naturally in this text.`,
        sourceTopic: topic,
      });
    }
  }

  // ── Extract grammar patterns ────────────────────────────────────────────
  const grammarPatterns: ExtractedItem[] = [];
  for (const gp of GRAMMAR_PATTERNS) {
    const matches = trimmed.match(new RegExp(gp.regex.source, "gi"));
    if (matches && matches.length >= 2) {
      const sent = sentences.find((s) => gp.regex.test(s)) ?? "";
      grammarPatterns.push({
        type: "grammar_pattern",
        text: gp.name,
        pattern: gp.example,
        meaningEn: gp.meaningEn,
        meaningZh: gp.meaningZh,
        examples: [sent],
        contextSentence: sent,
        cefr,
        ieltsRelevance: 3,
        frequency: matches.length,
        whyThis: `"${gp.name}" used ${matches.length}× in this text — a grammatical structure you should be able to produce, not just recognize.`,
        sourceTopic: topic,
      });
    }
  }

  // ── IELTS expressions (overlapping with chunks but highest value) ───────
  const ieltsExpressions = usefulChunks.filter((c) => c.ieltsRelevance >= 4);

  // ── Top 5 recommendations (sorted by composite value) ───────────────────
  const all = [...ieltsExpressions, ...usefulChunks.filter((c) => !ieltsExpressions.includes(c)), ...sentencePatterns, ...keyVocabulary];
  const recommended = all
    .sort((a, b) => (b.ieltsRelevance * 2 + b.frequency) - (a.ieltsRelevance * 2 + a.frequency))
    .slice(0, 5);

  // ── Comprehension questions ──────────────────────────────────────────────
  const comprehensionQuestions: ContentAnalysis["comprehensionQuestions"] = [];

  // Main idea
  if (sentences.length > 0) {
    comprehensionQuestions.push({
      question: `What is the main idea of this passage? (1-2 sentences)`,
      answer: mainIdea.slice(0, 200),
      type: "main_idea",
    });
  }

  // Detail (from a specific sentence)
  const detailSentence = sentences[Math.floor(sentences.length / 2)];
  if (detailSentence && detailSentence.split(" ").length > 8) {
    const keyWord = contentTokens(detailSentence)[0];
    comprehensionQuestions.push({
      question: `According to the passage, what does the author say about "${keyWord}"?`,
      answer: detailSentence,
      type: "detail",
    });
  }

  // Vocabulary in context
  const vocabItem = keyVocabulary[0];
  if (vocabItem) {
    comprehensionQuestions.push({
      question: `In this passage, "${vocabItem.text}" most likely means:`,
      answer: vocabItem.meaningEn,
      type: "vocabulary",
    });
  }

  // Inference
  if (sentences.length > 3) {
    comprehensionQuestions.push({
      question: `What can be inferred from the passage that is NOT directly stated?`,
      answer: "Look for implications between sentences — what the author suggests but doesn't say explicitly.",
      type: "inference",
    });
  }

  return {
    cefr,
    difficulty,
    ieltsRelevance,
    topic,
    mainIdea,
    wordCount,
    sentenceCount: sentences.length,
    avgSentenceLength: Math.round(avgSentenceLength),
    lexicalVariety: Math.round(lexicalVariety * 100) / 100,
    keyVocabulary: keyVocabulary.slice(0, 8),
    usefulChunks: usefulChunks.slice(0, 8),
    sentencePatterns: sentencePatterns.slice(0, 4),
    grammarPatterns: grammarPatterns.slice(0, 4),
    ieltsExpressions: ieltsExpressions.slice(0, 5),
    recommended,
    comprehensionQuestions: comprehensionQuestions.slice(0, 4),
  };
}
