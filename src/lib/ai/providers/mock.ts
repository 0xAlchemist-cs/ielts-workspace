import { DEEP_NOTES, genericNotes } from "@/lib/analyses";
import { gradeRetrieval } from "@/lib/grading";
import { lookupGlossary } from "@/lib/glossary";
import { contentTokens, normalizeText, splitSentences, tokenizeWords, wordTokens } from "@/lib/text";
import type {
  ParaphraseFeedback,
  RetrievalGrade,
  SentenceAnalysis,
  SpeakingFeedback,
  TutorReply,
  WordAnalysis,
  WritingFeedback,
} from "@/lib/types";
import type { AIProvider, MatchedChunkHint, ParaphraseInput, RetrievalInput, SentenceInput, SpeakingInput, TutorInput, WordInput, WritingInput } from "@/lib/ai/provider";

// ── Deterministic offline provider ──────────────────────────────────────────
// Every response is honestly labelled isMock; UI shows a small "Mock AI" badge.

interface ErrorPattern {
  re: RegExp;
  wrong: string;
  correct: string;
  category: "grammar" | "vocabulary" | "preposition" | "naturalness" | "chinese_english";
  explanation: string;
}

export const ERROR_PATTERNS: ErrorPattern[] = [
  { re: /\bvery (like|love|enjoy|want|need)\b/i, wrong: "very like", correct: "really like", category: "chinese_english", explanation: "很 before a verb is 'really', not 'very' — 'very' only intensifies adjectives and adverbs." },
  { re: /\binterested on\b/i, wrong: "interested on", correct: "interested in", category: "preposition", explanation: "The collocation is fixed: interested IN something." },
  { re: /\bdiscuss about\b/i, wrong: "discuss about", correct: "discuss", category: "preposition", explanation: "'discuss' already contains 'about' — discuss something, never discuss about." },
  { re: /\bcan able to\b/i, wrong: "can able to", correct: "can / be able to", category: "grammar", explanation: "'can' and 'be able to' mean the same — use one, not both." },
  { re: /\b(he|she) (don't|do)\b/i, wrong: "he don't", correct: "he doesn't", category: "grammar", explanation: "Third person singular takes 'doesn't' / 'does'." },
  { re: /\bmore better\b/i, wrong: "more better", correct: "better", category: "grammar", explanation: "'better' is already comparative — never add 'more'." },
  { re: /\baccording to me\b/i, wrong: "according to me", correct: "in my opinion", category: "naturalness", explanation: "'according to' is only for other sources of information, not yourself." },
  { re: /\bopen (the )?(light|tv|air conditioner|window)\b/i, wrong: "open the light", correct: "turn on the light", category: "chinese_english", explanation: "Machines are turned on/off; doors and windows are opened/closed." },
  { re: /\bdidn't (went|saw|did|had|came|got|took|made)\b/i, wrong: "didn't went", correct: "didn't go", category: "grammar", explanation: "After 'didn't', the verb stays in base form." },
  { re: /\bpeoples\b/i, wrong: "peoples", correct: "people", category: "grammar", explanation: "'people' is already plural." },
  { re: /\binformations\b/i, wrong: "informations", correct: "information", category: "grammar", explanation: "'information' is uncountable." },
  { re: /\bevery days\b/i, wrong: "every days", correct: "every day", category: "grammar", explanation: "'every + singular': every day, every week." },
  { re: /\bhow to say\b/i, wrong: "how to say", correct: "how do you say", category: "chinese_english", explanation: "Questions need subject + auxiliary: How do you say this in English?" },
  { re: /\bmore and more\b/i, wrong: "more and more", correct: "a growing number of / increasingly", category: "naturalness", explanation: "Fine in speech, weak in exams — 'increasingly' earns more marks." },
];

const PRIORITY: Record<ErrorPattern["category"], "P1" | "P2" | "P3" | "P4" | "P5"> = {
  grammar: "P2",
  chinese_english: "P2",
  preposition: "P3",
  naturalness: "P4",
  vocabulary: "P4",
};

const FOLLOW_UPS = [
  "Why did you choose to do that?",
  "What would you do differently next time?",
  "How did that make you feel?",
  "Is this common in your country? Why?",
  "How is it different from ten years ago?",
  "What would you say to someone who wants to try the same thing?",
];

const VAGUE_UPGRADES: { re: RegExp; better: string; why: string }[] = [
  { re: /\bvery (good|nice|useful|helpful|important|big)\b/gi, better: "highly + adjective (e.g. highly beneficial)", why: "lexical precision: 'very + adjective' flattens academic register" },
  { re: /\bgood\b/gi, better: "beneficial / valuable / effective (choose by noun)", why: "lexical precision: match the adjective to the noun's effect" },
  { re: /\bbad\b/gi, better: "harmful / negative / adverse", why: "lexical precision: 'bad' is too broad for essays" },
  { re: /\bthing\b/gi, better: "aspect / issue / factor", why: "lexical precision: academic nouns replace 'thing'" },
  { re: /\ba lot of\b/gi, better: "a considerable number of / numerous", why: "academic register: quantifying phrases" },
  { re: /\bbig\b/gi, better: "significant / substantial", why: "collocation: big problem → significant issue" },
  { re: /\bmore and more\b/gi, better: "an increasing number of / increasingly", why: "grammatical complexity: adverbial upgrade" },
  { re: /\bI think that?\b/gi, better: "I would argue that / It seems that", why: "academic register: vary opinion frames" },
  { re: /\bnowadays\b/gi, better: "today / in recent years", why: "naturalness: 'nowadays' is overused in learner essays" },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round5(n: number): number {
  return Math.round(n * 2) / 2;
}

// ── word ────────────────────────────────────────────────────────────────────

async function mockWord(input: WordInput): Promise<WordAnalysis> {
  const hit = lookupGlossary(input.word);
  if (hit) {
    const context = input.sentenceContext?.trim();
    return {
      word: input.word,
      contextualMeaning: context
        ? `In "${context.length > 70 ? context.slice(0, 70) + "…" : context}" — ${hit.entry.meaningEn}.`
        : hit.entry.meaningEn,
      simpleDefinition: hit.entry.meaningEn,
      example: hit.entry.example,
      collocations: hit.entry.collocations,
      meaningZh: hit.entry.meaningZh,
      cefr: hit.entry.cefr,
      isMock: true,
    };
  }
  return {
    word: input.word,
    contextualMeaning:
      "This word isn't in the offline glossary. A real AI provider (or the ECDICT dictionary layer) can define it in context — set AI_BASE_URL and AI_API_KEY in .env.local to enable that.",
    simpleDefinition: "—",
    example: "—",
    collocations: [],
    meaningZh: "（离线词典未收录该词）",
    cefr: "—",
    isMock: true,
  };
}

// ── sentence ────────────────────────────────────────────────────────────────

function buildChunkAnalysis(input: SentenceInput, hint: MatchedChunkHint): SentenceAnalysis {
  const notes = DEEP_NOTES[hint.text] ?? genericNotes(hint.text, hint.meaningEn);
  const allCollocs = [...(hint.examples ?? []), ...(notes.extraCollocations ?? [])];
  return {
    sentence: input.sentence,
    meaning: `The sentence uses "${hint.text}" — ${hint.meaningEn}.`,
    meaningZh: `句子中出现了 "${hint.text}" —— ${hint.meaningZh}`,
    structure: hint.pattern,
    whyThisExpression: notes.whyThisExpression,
    nativeLogic: notes.nativeLogic,
    alternatives: notes.alternatives,
    differences: notes.differences,
    collocations: allCollocs.slice(0, 4),
    transfer: {
      daily: `Tomorrow, when you describe an unplanned result or an intention, use "${hint.text}" instead of translating from Chinese.`,
      speaking: `IELTS Speaking — try: "${hint.examples[0] ?? hint.text}" as your model, then make your own version about YOUR life.`,
      writing: `IELTS Writing — where suitable, "${hint.text}" (register: ${hint.register ?? "neutral"}) raises your Lexical Resource score.`,
    },
    detectedChunks: input.matchedChunks.map((c) => c.text),
    isMock: true,
  };
}

function genericSentenceAnalysis(input: SentenceInput): SentenceAnalysis {
  const s = input.sentence;
  const words = tokenizeWords(s);
  const passive = /\b(am|is|are|was|were|be|been)\s+\w+(ed|en)\b/i.test(s);
  const perfect = /\b(have|has|had)\s+\w+(ed|en)\b/i.test(s) || /\b(have|has|had)\s+been\s+\w+ing\b/i.test(s);
  const future = /\b(will|going to)\b/i.test(s);
  const clause = /\b(because|although|while|since|if|when|that|which|who)\b/i.test(s);
  const feats: string[] = [];
  if (passive) feats.push("passive voice");
  if (perfect) feats.push("perfect aspect");
  if (future) feats.push("future reference");
  if (clause) feats.push("subordinate clause");
  return {
    sentence: s,
    meaning:
      words.length > 0
        ? `Offline analysis: a ${words.length}-word sentence${feats.length ? ` featuring ${feats.join(", ")}` : ""}. Connect a real AI provider for a full meaning breakdown — or check the highlighted chunks below.`
        : "Empty sentence.",
    meaningZh: "（离线模式：接入真实 AI 可获得完整解析）",
    structure: feats.length ? `${words.length} words; ${feats.join(" + ")}` : `${words.length} words; simple structure`,
    whyThisExpression:
      "Mock mode: deep why-analysis is available for the core corpus chunks. For arbitrary sentences, set AI_API_KEY to get real depth.",
    nativeLogic: "Mock mode — connect a real provider for native-logic commentary.",
    alternatives: [{ expression: "(live AI needed)", note: "Alternatives require a real provider." }],
    differences: "Mock mode.",
    collocations: [],
    transfer: {
      daily: "—",
      speaking: "—",
      writing: "—",
    },
    detectedChunks: input.matchedChunks.map((c) => c.text),
    isMock: true,
  };
}

async function mockSentence(input: SentenceInput): Promise<SentenceAnalysis> {
  if (input.matchedChunks.length > 0) return buildChunkAnalysis(input, input.matchedChunks[0]);
  return genericSentenceAnalysis(input);
}

// ── retrieval / speaking / writing / paraphrase / tutor ─────────────────────

async function mockRetrieval(input: RetrievalInput): Promise<RetrievalGrade> {
  return gradeRetrieval(input.target, input.userResponse);
}

async function mockSpeaking(input: SpeakingInput): Promise<SpeakingFeedback> {
  const t = input.transcript.trim();
  const words = tokenizeWords(t);
  const norm = normalizeText(t);

  // chunk usage (regex tolerates inflections)
  const { CHUNK_DETECT } = await import("@/lib/chunk-detect");
  const chunksUsed = input.targetChunks.map((text) => ({
    text,
    used: CHUNK_DETECT[text] ? CHUNK_DETECT[text].test(t) : norm.includes(normalizeText(text)),
  }));
  const usedCount = chunksUsed.filter((c) => c.used).length;

  // error detection (cap at 2, by priority)
  const found = ERROR_PATTERNS.filter((p) => p.re.test(t));
  const recentMissed = input.recentErrors.filter(
    (e) => norm.includes(normalizeText(e.wrong)),
  );
  const corrections = [
    ...found.map((p) => ({
      priority: PRIORITY[p.category],
      original: p.wrong,
      improved: p.correct,
      explanation: p.explanation,
    })),
    ...recentMissed.map((e) => ({
      priority: "P3" as const,
      original: e.wrong,
      improved: e.correct,
      explanation: "This is one of your Error Bank items — it appeared again.",
    })),
  ]
    .sort((a, b) => a.priority.localeCompare(b.priority))
    .slice(0, 2);

  // overused words
  const freq = new Map<string, number>();
  for (const w of contentTokens(t)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const overused = [...freq.entries()].filter(([, n]) => n >= 4).map(([w]) => w).slice(0, 3);

  // "I think" repetition
  const thinkCount = (t.match(/\bI think\b/gi) ?? []).length;
  const paraphraseOps: string[] = [];
  if (thinkCount >= 2) paraphraseOps.push("I think ×" + thinkCount + " → vary with 'from my perspective', 'it seems to me'");
  if (/\bvery \w+/i.test(t)) paraphraseOps.push("very + adjective → try a stronger single adjective (huge, crucial, awful)");
  if (/\ba lot of\b/i.test(t)) paraphraseOps.push("a lot of → 'a considerable number of' / 'numerous'");

  const fluency = words.length < 12 ? 4.5 : words.length < 25 ? 5.0 : words.length < 45 ? 5.5 : 6.0;
  const fluencyFinal = clamp(fluency + (usedCount > 0 ? 0.5 : 0), 4, 8);
  const lexical = clamp(5.0 + usedCount * 0.5, 4, 7.5);
  const grammar = clamp(6.0 - corrections.length * 0.5, 4.5, 7);
  const coherence = /\b(and|so|because|but|then|also|finally)\b/i.test(t) ? 5.5 : 5.0;
  const overall = round5(clamp((fluencyFinal + lexical + grammar + coherence + 5.5) / 5, 4, 8));

  const followUp = FOLLOW_UPS[t.length % FOLLOW_UPS.length];
  const summary =
    words.length < 12
      ? "Too short to score fairly — push for 3–4 sentences. Say more, even imperfectly: fluency grows from output volume."
      : usedCount > 0
        ? `You successfully used ${usedCount} of today's target expression(s) — that's exactly the goal: turning input into YOUR output. ${corrections.length ? "One priority fix below." : "No blocking errors found."}`
        : `Good length, but you didn't use any of today's target expressions (${input.targetChunks.join(", ")}). Next turn, force at least one in — retrieval in speaking is how passive becomes active.`;

  return {
    ielts: {
      fluency: fluencyFinal,
      coherence,
      lexical,
      grammar,
      pronunciation: 5.5,
    },
    overallEstimate: overall,
    corrections,
    chunksUsed,
    acquisitions: {
      newExpressionsUsed: chunksUsed.filter((c) => c.used).map((c) => c.text),
      failedRetrievals: chunksUsed.filter((c) => !c.used).map((c) => c.text),
      overusedWords: overused,
      chineseStyleEnglish: found.filter((p) => p.category === "chinese_english").map((p) => p.wrong),
      paraphraseOpportunities: paraphraseOps,
    },
    followUp,
    summary,
    isMock: true,
  };
}

async function mockWriting(input: WritingInput): Promise<WritingFeedback> {
  const text = input.text.trim();
  const words = tokenizeWords(text);
  const sents = splitSentences(text.replace(/\n+/g, "\n\n"));
  const wordCount = words.length;
  const avgLen = sents.length ? wordCount / sents.length : 0;
  const variety = wordCount ? new Set(words.map((w) => w.toLowerCase())).size / wordCount : 0;
  const isTask2 = !/task 1|letter|general/i.test(input.prompt) || /250 words/.test(input.prompt);
  const target = isTask2 ? 250 : 150;

  // ── Chunk detection ──────────────────────────────────────────────────────
  const { CHUNK_DETECT } = await import("@/lib/chunk-detect");
  const usedChunks: string[] = [];
  for (const [chunkText, re] of Object.entries(CHUNK_DETECT)) {
    if (re.test(text)) usedChunks.push(chunkText);
  }
  const targetedChunks = input.targetChunks ?? [];
  const targetedUsed = targetedChunks.filter((t) => usedChunks.includes(t));
  const targetedMissed = targetedChunks.filter((t) => !usedChunks.includes(t));

  // ── Error patterns ───────────────────────────────────────────────────────
  const foundErrors = ERROR_PATTERNS.filter((p) => p.re.test(text));

  // ── Rewrite tasks: top 3-5 issues, user fixes BEFORE seeing "better" ────
  const rewriteTasks: WritingFeedback["rewriteTasks"] = [];
  let taskId = 0;
  for (const p of foundErrors.slice(0, 2)) {
    const m = text.match(p.re);
    rewriteTasks.push({
      id: ++taskId,
      original: m ? m[0] : p.wrong,
      problem: p.category === "chinese_english" ? "Chinese-style English" : p.category === "preposition" ? "Preposition error" : "Grammar error",
      fix: p.correct,
      explanation: p.explanation,
      hint: `Think about what "${p.correct}" does grammatically — try to reproduce the pattern yourself.`,
    });
  }
  for (const v of VAGUE_UPGRADES) {
    if (rewriteTasks.length >= 5) break;
    const m = text.match(v.re);
    if (m) {
      rewriteTasks.push({
        id: ++taskId,
        original: m[0],
        problem: "Imprecise wording",
        fix: "",
        explanation: v.why,
        hint: `Replace with a more specific/academic alternative — the word "${m[0].split(" ")[0]}" is too broad for IELTS.`,
      });
    }
  }
  if (avgLen > 0 && avgLen < 10 && rewriteTasks.length < 5) {
    rewriteTasks.push({
      id: ++taskId,
      original: `average sentence length: ${avgLen.toFixed(1)} words`,
      problem: "Sentences too short and uniform",
      fix: "",
      explanation: "grammatical complexity: sentence-range signals band 6.5+",
      hint: "Find two adjacent short sentences and combine them with a relative clause (which/who) or participle phrase (‑ing/‑ed).",
    });
  }
  if (targetedMissed.length > 0 && rewriteTasks.length < 5) {
    rewriteTasks.push({
      id: ++taskId,
      original: `You didn't use: ${targetedMissed.join(", ")}`,
      problem: "Targeted expressions not used",
      fix: "",
      explanation: "These expressions were chosen by the Retrieval Engine because you need to produce them in writing — not just recognize them.",
      hint: `Find one place in your essay where "${targetedMissed[0]}" would fit naturally, and work it in.`,
    });
  }

  // ── Comparisons for display ──────────────────────────────────────────────
  const comparisons: WritingFeedback["comparisons"] = [];
  for (const v of VAGUE_UPGRADES) {
    const m = text.match(v.re);
    if (m && comparisons.length < 5) {
      comparisons.push({ original: m[0], better: v.better, why: v.why });
    }
  }

  const connectors = (text.match(/\b(however|therefore|in addition|for example|furthermore|moreover|although|in contrast|as a result)\b/gi) ?? []).length;

  // ── Sentence variety score ───────────────────────────────────────────────
  const lengths = sents.map((s) => tokenizeWords(s).length);
  const maxLen = Math.max(...lengths, 1);
  const minLen = Math.min(...lengths, 1);
  const sentenceVariety = clamp(Math.round(((maxLen - minLen) / Math.max(maxLen, 1)) * 50 + variety * 50), 0, 100);

  // ── Paraphrasing score ───────────────────────────────────────────────────
  const promptWords = new Set(contentTokens(input.prompt));
  const textWords = new Set(contentTokens(text));
  let promptOverlap = 0;
  for (const w of promptWords) if (textWords.has(w)) promptOverlap++;
  const paraphrasingScore = clamp(Math.round(100 - (promptOverlap / Math.max(promptWords.size, 1)) * 100), 0, 100);

  const tr = clamp(wordCount >= target ? 6 : wordCount >= target * 0.7 ? 5.5 : 5, 4.5, 7);
  const cc = clamp(connectors >= 3 ? 6 : connectors >= 1 ? 5.5 : 5, 4.5, 7);
  const lr = clamp((comparisons.length <= 1 ? 6 : 5.5) + (targetedUsed.length > 0 ? 0.5 : 0), 4.5, 7);
  const gra = clamp(avgLen >= 12 && variety >= 0.55 ? 6 : 5.5, 4.5, 7);
  const overall = round5(clamp((tr + cc + lr + gra) / 4, 4.5, 7));

  const repeated: string[] = [];
  for (const v of VAGUE_UPGRADES) {
    const n = (text.match(v.re) ?? []).length;
    if (n >= 2) {
      repeated.push(`${v.better.split(" ")[0]}-type wording appeared ${n}×`);
    }
  }

  const diagnosis: string[] = [];
  if (wordCount < target) diagnosis.push(`Task achievement: ${wordCount}/${target} words — the biggest single score limiter right now.`);
  if (comparisons.length >= 3) diagnosis.push("Lexical precision: you lean on generic intensifiers and vague nouns — build topic-specific vocabulary for each essay theme.");
  if (avgLen < 12) diagnosis.push("Grammatical complexity: sentences are short and even — practise combining ideas with subordinate clauses.");
  if (connectors < 2) diagnosis.push("Coherence: few signalling phrases — learn However / In addition / As a result as fixed chunks.");
  if (targetedUsed.length > 0) diagnosis.push(`Positive: you used ${targetedUsed.length} targeted expression(s) — keep transferring them.`);
  if (!diagnosis.length) diagnosis.push("No major structural issues detected offline — connect a real provider for a true examiner read.");

  // ── Language Acquisition Report ──────────────────────────────────────────
  const acquisition: WritingFeedback["acquisition"] = {
    activeItemsUsed: targetedUsed.map((t) => ({ text: t, itemId: 0, wasTargeted: true })),
    successfulRetrievals: targetedUsed,
    failedRetrievals: targetedMissed,
    newErrors: foundErrors.map((e) => `${e.wrong} → ${e.correct}`),
    reusedExpressions: usedChunks.filter((c) => !targetedChunks.includes(c)),
    transferSuccess: targetedUsed.length,
    sentenceVariety,
    paraphrasingScore,
  };

  return {
    ielts: { taskResponse: tr, coherence: cc, lexical: lr, grammar: gra },
    overallEstimate: overall,
    comparisons,
    repeatedMistakes: repeated,
    abilityDiagnosis: diagnosis,
    summary: `Offline heuristic evaluation: ~${wordCount} words, ${sents.length} sentences, avg ${avgLen.toFixed(1)} words/sentence, lexical variety ${(variety * 100).toFixed(0)}%. Estimated band ${overall}. ${targetedUsed.length}/${targetedChunks.length} targeted expressions used.`,
    isMock: true,
    rewriteTasks,
    acquisition,
    usedChunkIds: [],
    usedChunkTexts: usedChunks,
  };
}

async function mockParaphrase(input: ParaphraseInput): Promise<ParaphraseFeedback> {
  const src = new Set(contentTokens(input.source));
  const res = contentTokens(input.userParaphrase);
  const resSet = new Set(res);
  let shared = 0;
  for (const t of src) if (resSet.has(t)) shared++;
  const union = new Set([...src, ...resSet]).size;
  const jaccard = union ? shared / union : 0;
  const variation = clamp(Math.round((1 - jaccard) * 100), 0, 100);

  const srcLower = input.source.toLowerCase();
  let copied = 0;
  const resLower = input.userParaphrase.toLowerCase();
  for (let i = 0; i < res.length - 2; i++) {
    const gram = res.slice(i, i + 3).join(" ");
    if (srcLower.includes(gram)) copied++;
  }
  const naturalness = clamp(Math.round(85 - copied * 12), 20, 95);
  const enough = wordTokens(input.userParaphrase).length >= 6;
  const ielts = clamp(Math.round((variation * 0.4 + naturalness * 0.4 + (enough ? 20 : 5))), 10, 95);

  return {
    variation,
    naturalness,
    ieltsRelevance: ielts,
    analysis:
      wordTokens(input.userParaphrase).length === 0
        ? "Write your paraphrase first — then compare it with the models."
        : `You changed ${variation}% of the meaning-words and kept ${copied} three-word runs from the source. ${variation < 40 ? "Aim to change more — swap the verb, shift the structure, or use an idiom." : variation > 40 && naturalness > 70 ? "Good balance: new words without copying long chunks." : "Good variety — check the naturalness score and the models for polish."}`,
    modelParaphrases: input.models?.length ? input.models : ["(connect a real AI provider for model paraphrases of arbitrary sentences)"],
    isMock: true,
  };
}

const TUTOR_OPENERS = [
  "Good question — but first: look at the whole sentence. What do YOU think it means here?",
  "Before I answer: does any part of it look like something you already know? Take a guess.",
  "Let's work it out together — what's the subject, and what is it doing?",
  "Trust your context skills: what clue does the rest of the sentence give you?",
];

async function mockTutor(input: TutorInput): Promise<TutorReply> {
  const lastUser = [...input.history].reverse().find((m) => m.role === "user");
  const q = lastUser?.text ?? "";
  let reply: string;
  if (/mean|meaning|什么意思|翻译/i.test(q)) {
    reply = TUTOR_OPENERS[q.length % TUTOR_OPENERS.length];
  } else if (input.history.length <= 1) {
    reply = input.goal ?? "Let's start simple: what did you do yesterday? Tell me as much as you can.";
  } else {
    reply = FOLLOW_UPS[q.length % FOLLOW_UPS.length];
  }
  return { reply, isMock: true };
}

export const mockProvider: AIProvider = {
  name: "mock",
  isMock: true,
  word: mockWord,
  sentence: mockSentence,
  retrieval: mockRetrieval,
  speaking: mockSpeaking,
  writing: mockWriting,
  paraphrase: mockParaphrase,
  tutor: mockTutor,
};
