import { z } from "zod";
import type {
  ParaphraseFeedback,
  RetrievalGrade,
  SentenceAnalysis,
  SpeakingFeedback,
  TutorReply,
  WordAnalysis,
  WritingFeedback,
} from "@/lib/types";

// ── Output schemas (validate whatever a live LLM returns) ───────────────────

export const wordSchema = z.object({
  word: z.string(),
  contextualMeaning: z.string(),
  grammar: z.string(),
  registerNote: z.string(),
  simpleDefinition: z.string(),
  example: z.string(),
  collocations: z.array(z.string()),
  meaningZh: z.string(),
  cefr: z.string(),
}) satisfies z.ZodType<Omit<WordAnalysis, "isMock">>;

export const sentenceSchema = z.object({
  sentence: z.string(),
  meaning: z.string(),
  meaningZh: z.string(),
  structure: z.string(),
  whyThisExpression: z.string(),
  nativeLogic: z.string(),
  alternatives: z.array(z.object({ expression: z.string(), note: z.string() })),
  differences: z.string(),
  collocations: z.array(z.string()),
  transfer: z.object({
    daily: z.string(),
    speaking: z.string(),
    writing: z.string(),
  }),
  detectedChunks: z.array(z.string()),
}) satisfies z.ZodType<Omit<SentenceAnalysis, "isMock">>;

export const retrievalSchema = z.object({
  quality: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  correct: z.boolean(),
  verdict: z.string(),
  targetAnswer: z.string(),
  missingPieces: z.array(z.string()),
}) satisfies z.ZodType<Omit<RetrievalGrade, "isMock">>;

export const speakingSchema = z.object({
  ielts: z.object({
    fluency: z.number(),
    coherence: z.number(),
    lexical: z.number(),
    grammar: z.number(),
    pronunciation: z.number().optional(),
  }),
  overallEstimate: z.number(),
  corrections: z.array(
    z.object({
      priority: z.enum(["P1", "P2", "P3", "P4", "P5"]),
      original: z.string(),
      improved: z.string(),
      explanation: z.string(),
      kind: z.enum(["error", "ambiguity", "register", "style"]).optional(),
    }),
  ),
  chunksUsed: z.array(z.object({ text: z.string(), used: z.boolean() })),
  acquisitions: z.object({
    newExpressionsUsed: z.array(z.string()),
    failedRetrievals: z.array(z.string()),
    overusedWords: z.array(z.string()),
    chineseStyleEnglish: z.array(z.string()),
    paraphraseOpportunities: z.array(z.string()),
  }),
  followUp: z.string(),
  summary: z.string(),
}) satisfies z.ZodType<Omit<SpeakingFeedback, "isMock">>;

export const writingSchema = z.object({
  ielts: z.object({
    taskResponse: z.number(),
    coherence: z.number(),
    lexical: z.number(),
    grammar: z.number(),
  }),
  overallEstimate: z.number(),
  comparisons: z.array(
    z.object({ original: z.string(), better: z.string(), why: z.string() }),
  ),
  repeatedMistakes: z.array(z.string()),
  abilityDiagnosis: z.array(z.string()),
  summary: z.string(),
  // rewrite tasks feed the Error Bank (live models are asked for them; mock
  // fills them deterministically; acquisition is computed server-side)
  rewriteTasks: z.array(z.object({
    id: z.number(),
    original: z.string(),
    problem: z.string(),
    fix: z.string().optional().default(""),
    explanation: z.string(),
    hint: z.string().optional().default(""),
    kind: z.enum(["error", "ambiguity", "register", "style"]).optional(),
  })).optional().default([]),
  acquisition: z.object({
    activeItemsUsed: z.array(z.object({ text: z.string(), itemId: z.number(), wasTargeted: z.boolean() })),
    successfulRetrievals: z.array(z.string()),
    failedRetrievals: z.array(z.string()),
    newErrors: z.array(z.string()),
    reusedExpressions: z.array(z.string()),
    transferSuccess: z.number(),
    sentenceVariety: z.number(),
    paraphrasingScore: z.number(),
  }).optional(),
  usedChunkIds: z.array(z.number()).optional().default([]),
  usedChunkTexts: z.array(z.string()).optional().default([]),
});

export const paraphraseSchema = z.object({
  variation: z.number(),
  naturalness: z.number(),
  ieltsRelevance: z.number(),
  analysis: z.string(),
  modelParaphrases: z.array(z.string()),
}) satisfies z.ZodType<Omit<ParaphraseFeedback, "isMock">>;

export const tutorSchema = z.object({
  reply: z.string(),
}) satisfies z.ZodType<Omit<TutorReply, "isMock">>;

// ── System prompts for live providers ───────────────────────────────────────
// The Socratic personality and the P1–P5 correction discipline live here.

export const TUTOR_PERSONA = `You are the AI tutor inside an IELTS Active Learning workspace for an adult Chinese learner of English. Your role: Coach + Conversation Partner + Examiner + Language Analyst.

Core rules:
- NEVER give the answer immediately. If the learner asks "what does X mean?", first reply with a short Socratic nudge like "Look at the context — what do you think it means?" Only confirm/expand after they guess, or if they explicitly ask twice.
- Make the LEARNER talk more than you. Ask one follow-up question at a time.
- Correction discipline (apply ONE issue per turn, the highest priority present):
  P1 errors that block understanding → fix first;
  P2 high-frequency errors (third person -s, tense, plural) → next;
  P3 IELTS-critical errors (articles, collocation, register) → next;
  P4 naturalness (unnatural but understandable) → next;
  P5 advanced upgrades (better expressions) → only when everything else is clean.
- Be warm but concise. Simple English. Never more than ~80 words per reply.
- Push conversations from concrete ("what did you do") toward abstract discussion (why, compare, hypothesize) — IELTS Part 3 style.`;

export const WORD_PROMPT = `${TUTOR_PERSONA}

Task: analyse ONE word for the learner. Reply with STRICT JSON only:
{ "word": "...", "contextualMeaning": "what it means IN THIS SENTENCE (1 sentence)", "grammar": "grammar behaviour: the pattern it demands — what structure follows it, who/what can be the subject, transitivity, countability (≤2 short clauses, e.g. 'help sb (to) do; subject = person')", "registerNote": "register & pragmatics: formality + a near-synonym ladder showing the range (e.g. 'neutral; kids > children > minors=formal/legal')", "simpleDefinition": "a simple English definition (A2 vocabulary)", "example": "a NEW example sentence (not the original)", "collocations": ["3-4 common collocations"], "meaningZh": "简明中文释义", "cefr": "A2|B1|B2|C1" }
The learner will see contextualMeaning and simpleDefinition BEFORE the Chinese — English first.`;

export const SENTENCE_PROMPT = `${TUTOR_PERSONA}

Task: deep-analyse ONE English sentence. Reply with STRICT JSON only:
{ "sentence": "...", "meaning": "precise meaning in English", "meaningZh": "准确的中文意思", "structure": "the grammatical skeleton, e.g. 'subject + past simple + that-clause'", "whyThisExpression": "why THIS expression is used here rather than a plainer one — the meaning a translation loses", "nativeLogic": "how native speakers think when they organise it this way", "alternatives": [{"expression": "...", "note": "when to use it instead"}], "differences": "one compact paragraph contrasting the alternatives", "collocations": ["collocations from this sentence worth learning"], "transfer": { "daily": "how to reuse it in daily conversation", "speaking": "how to reuse it in IELTS Speaking (give a mini example)", "writing": "how to reuse it in IELTS Writing (give a mini example)" }, "detectedChunks": ["multi-word chunks in the sentence worth storing, exact text"] }
If matchedChunks hints are provided in the input, ground your analysis in them.`;

export const RETRIEVAL_PROMPT = `You grade retrieval-practice answers. The learner saw a Chinese prompt and must PRODUCE the English expression from memory. Reply with STRICT JSON only:
{ "quality": 5 | 3 | 0, "correct": boolean, "verdict": "one sentence of feedback", "targetAnswer": "the expected English", "missingPieces": ["missing or wrong key words"] }
5 = expression correctly produced (small spelling/inflection slips OK) · 3 = partially retrieved (right idea, wrong form) · 0 = not retrieved. Be encouraging but honest.`;

export const SPEAKING_PROMPT = `${TUTOR_PERSONA}

Task: evaluate one speaking turn. Input includes the prompt, the transcript, targetChunks the learner should try to use, and recentErrors. Reply with STRICT JSON only:
{ "ielts": { "fluency": 4-9, "coherence": 4-9, "lexical": 4-9, "grammar": 4-9, "pronunciation": 4-9 }, "overallEstimate": 4-9, "corrections": [ { "priority": "P1|P2|P3|P4|P5", "original": "the exact learner words", "improved": "corrected version", "explanation": "why — 1 sentence", "kind": "error | ambiguity | register | style" } ], "chunksUsed": [ { "text": "chunk", "used": boolean } ], "acquisitions": { "newExpressionsUsed": ["chunks they successfully produced"], "failedRetrievals": ["target chunks they avoided or misused"], "overusedWords": ["words repeated too often"], "chineseStyleEnglish": ["direct translations from Chinese, if any"], "paraphraseOpportunities": ["places where they could have paraphrased better"] }, "followUp": "ONE follow-up question that pushes them to elaborate or abstract-up", "summary": "2-sentence coaching summary" }
Give at most 2 corrections, highest priority first. Classify each correction's kind honestly: error = actually wrong; ambiguity = understandable two ways; register = grammatically fine but wrong formality; style = a nicer alternative, not a mistake. A smoother phrasing is NOT automatically an error. Scores must reflect a real examiner: a short generic answer is 5.0–5.5, developed specific answers 6–7.`;

export const WRITING_PROMPT = `You are an IELTS Writing examiner + language analyst for a Chinese learner. Evaluate the essay. Reply with STRICT JSON only:
{ "ielts": { "taskResponse": 4-9, "coherence": 4-9, "lexical": 4-9, "grammar": 4-9 }, "overallEstimate": 4-9, "comparisons": [ { "original": "exact phrase from the essay", "better": "upgraded version", "why": "lexical precision | grammatical complexity | collocation | academic register — 1 sentence" } ], "repeatedMistakes": ["patterns that recur in their writing"], "abilityDiagnosis": ["the underlying LANGUAGE ability problems behind the errors, e.g. 'relies on very+adj intensifiers — build gradable/ungradable adjective awareness'"], "rewriteTasks": [ { "id": 1, "original": "exact erroneous phrase quoted from the essay", "problem": "grammar | preposition | collocation | word form | agreement | Chinese-style | spelling", "fix": "the corrected phrase", "explanation": "why it is wrong, 1 sentence", "hint": "how to fix it WITHOUT revealing the answer", "kind": "error | ambiguity | register | style" } ], "summary": "3-sentence examiner summary" }
Give 3-5 comparisons quoted from their actual text. List a rewriteTask for EVERY real error you find (3-8 tasks) — they feed the learner's error bank and revenge practice, so quote the exact wrong text. Classify each task's kind honestly: error = actually wrong (the only kind that enters the error bank); ambiguity = understandable two ways; register = grammatically fine but wrong formality for IELTS writing; style = an upgrade preference, not a mistake. Do not relabel style upgrades as errors — only mark "error" when the original is genuinely incorrect. Be a strict but constructive examiner.`;

export const drillSchema = z.object({
  items: z
    .array(
      z.object({
        context: z.string(),
        answer: z.string(),
        scene: z.string().optional().default(""),
      }),
    )
    .min(1)
    .max(6),
});

/** V9: IELTS content difficulty classification (raw wire shape — the
 * provider maps it to ContentLevelResult). */
export const contentLevelSchema = z.object({
  level: z.enum(["A2", "B1", "B2", "C1"]),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

export const DRILL_PROMPT = `You create parallel drills for ONE learner error — new contexts that re-test the same pattern. Given the wrong form, the correct form and a note, write THREE fill-in sentences in three DIFFERENT everyday or IELTS contexts (e.g. workplace, travel, study, daily life). Each sentence contains exactly one blank "____" placed exactly where the correct form belongs and naturally eliciting it (inflections allowed); the sentence must NOT contain the wrong form. Vary subject and tense. Reply with STRICT JSON only:
{ "items": [ { "context": "sentence with ____", "answer": "the expected correct form", "scene": "e.g. 'at the airport'" } ] }`;

export const PARAPHRASE_PROMPT = `You evaluate paraphrase practice: one meaning → multiple English expressions. Reply with STRICT JSON only:
{ "variation": 0-100, "naturalness": 0-100, "ieltsRelevance": 0-100, "analysis": "2-3 sentences: what changed well (vocabulary vs grammar moves) and what still copies the source", "modelParaphrases": ["2-3 strong paraphrases, each using a DIFFERENT strategy (verb change, idiom, structure change)"] }`;

export const TUTOR_PROMPT = `${TUTOR_PERSONA}

Reply with STRICT JSON only: { "reply": "your next turn, max 80 words, ending with a question whenever possible" }`;
