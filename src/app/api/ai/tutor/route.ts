import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chunkEvents } from "@/db/schema";
import { getUserIdOrNull } from "@/server/current-user";
import { buildTutorContext, contextToPrompt } from "@/server/services/tutor-context";
import { logChunkEvent } from "@/server/services/events";
import { getProvider, isLiveConfigured } from "@/lib/ai";
import { plural } from "@/lib/plural";
import { readJsonBody, stringField, badRequest } from "@/lib/request";

/* ── AI Tutor API ───────────────────────────────────────────────────────────
 * Personal Language Coach — not a chatbot. Reads learning context,
 * explains at the user's level, uses Socratic method when appropriate,
 * and connects every explanation to practice. */

type TutorMode = "explain" | "coach" | "correct" | "compare" | "practice" | "ielts";

const MODE_INSTRUCTIONS: Record<TutorMode, string> = {
  explain: "Explain the concept clearly at the user's CEFR level. Include: definition, example in context, common collocations, and how it connects to what they already know. End with a quick check question.",
  coach: "Use Socratic method. Do NOT give the answer directly. Ask guiding questions that help the user discover the answer themselves. Provide hints if they struggle. Only reveal after they attempt.",
  correct: "Identify the error, explain WHY it's wrong (the underlying rule, not just 'this is incorrect'), show the corrected form, explain the Chinese-English contrast if relevant, and give a new production task.",
  compare: "Compare the two expressions across: meaning nuance, register (formal/informal), collocation patterns, IELTS usage, and common learner mistakes. Use a structured comparison format.",
  practice: "Generate ONE focused production task that forces the user to use the target language actively. Provide a clear prompt, expected response format, and what success looks like.",
  ielts: "Explain from the IELTS examiner's perspective: how this affects their band score, what examiners look for, and specific strategies. Reference their estimated band if available.",
};

const BASE_SYSTEM = `You are a Personal Language Coach inside an IELTS Active Learning Workspace for a Chinese adult learner.

Core principles:
1. Socratic first: If the user asks "why?", guide them to discover the answer. Only give direct answers when explicitly asked or after they've attempted.
2. Level-appropriate: Adjust your explanation depth to the user's CEFR level. B1 gets simple English with examples; C1 gets nuanced contrast and register analysis.
3. Error-aware: If the user has recurring errors, reference them: "You've made this mistake X times..." Explain the pattern, not just this instance.
4. Production-oriented: Every explanation should end with a practice opportunity — a task that makes the user produce English, not just understand it.
5. Concise: Max 150 words unless comparing expressions. Use structure (bullet points, bold) for readability.

Format your response as:
**Answer** (direct response to the question)
**Why** (the underlying language logic — why English works this way)
**Example** (real-world usage in context)
**Your Pattern** (if connected to user's error history, note it)
**Practice** (one quick production task)

Omit sections that don't apply. Never fabricate user history.`;

interface TutorResponse {
  reply: string;
  mode: TutorMode;
  isMock: boolean;
  contextSummary: string;
  suggestedPractice?: string;
  suggestedErrorBank?: { wrongForm: string; correctForm: string; category: string };
  suggestedLanguageItem?: string;
}

export async function POST(req: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = await readJsonBody<{
    question?: unknown;
    mode?: unknown;
    context?: string; // page context (e.g., "reading", "writing")
  }>(req);
  const question = stringField(body, "question", 2000);
  if (!question) return badRequest(body == null ? "invalid JSON body" : "question required (string, ≤ 2000 chars)");

  // mode whitelist — unknown values must never leak into the system prompt
  const rawMode = typeof body?.mode === "string" ? body.mode : "explain";
  const mode = (Object.keys(MODE_INSTRUCTIONS) as TutorMode[]).includes(rawMode as TutorMode)
    ? (rawMode as TutorMode)
    : "explain";
  const context = stringField(body, "context", 200) ?? "general";

  // ── Build targeted context ───────────────────────────────────────────────
  const tutorContext = await buildTutorContext(userId, question);
  const contextPrompt = contextToPrompt(tutorContext);

  // ── Generate response ────────────────────────────────────────────────────
  let reply: string;
  let isMock = false;

  if (isLiveConfigured()) {
    try {
      const provider = getProvider();
      // Use the tutor task from the AI provider
      const result = await provider.tutor({
        history: [{ role: "user", text: question }],
        goal: `${MODE_INSTRUCTIONS[mode]}\n\nUser context: ${contextPrompt}\n\nPage context: ${context}`,
      });
      reply = result.reply;
    } catch {
      reply = mockTutorReply(question, mode, tutorContext);
      isMock = true;
    }
  } else {
    reply = mockTutorReply(question, mode, tutorContext);
    isMock = true;
  }

  // ── Extract actionable suggestions from the reply ────────────────────────
  const suggestedPractice = reply.includes("**Practice**")
    ? reply.split("**Practice**")[1]?.trim().split("\n")[0] ?? undefined
    : undefined;

  const suggestedErrorBank = tutorContext.relevantErrors[0]
    ? {
        wrongForm: tutorContext.relevantErrors[0].wrongForm,
        correctForm: tutorContext.relevantErrors[0].correctForm,
        category: tutorContext.relevantErrors[0].category,
      }
    : undefined;

  // ── Record tutor insight if the exchange revealed a pattern ─────────────
  if (tutorContext.relevantErrors.length > 0 || /pattern|always|recurring/i.test(question)) {
    await logChunkEvent(userId, 0, "tutor_insight" as never, `Q: ${question.slice(0, 100)} → Relevant errors found: ${tutorContext.relevantErrors.length}`);
  }

  const response: TutorResponse = {
    reply,
    mode,
    isMock,
    contextSummary: `${tutorContext.cefr} · ${tutorContext.recentAccuracy}% acc · ${plural(tutorContext.activeItems, "item")}`,
    suggestedPractice,
    suggestedErrorBank,
  };

  return NextResponse.json(response);
}

/** Offline mock tutor — uses real user context for personalized responses. */
function mockTutorReply(question: string, mode: TutorMode, ctx: { cefr: string; relevantErrors: { wrongForm: string; correctForm: string; category: string; occurrenceCount: number; explanation: string }[]; relevantChunks: { text: string }[] }): string {
  const q = question.toLowerCase();

  // ── Error-aware response ────────────────────────────────────────────────
  if (ctx.relevantErrors.length > 0) {
    const err = ctx.relevantErrors[0];
    return `**Answer**
You've made this error **${err.occurrenceCount} times** in your recent learning: "${err.wrongForm}" → "${err.correctForm}".

**Why**
${err.explanation || `The pattern "${err.wrongForm}" uses the wrong ${err.category}. English requires "${err.correctForm}" in this context.`}

**Your Pattern**
This is a recurring ${err.category} error (×${err.occurrenceCount}). The issue isn't this one sentence — it's the underlying pattern. You need to build the habit: "${err.correctForm}".

**Practice**
Write ONE sentence about your real life using "${err.correctForm}". Say it out loud after writing.`;
  }

  // ── Comparison questions ────────────────────────────────────────────────
  if (mode === "compare" || /\bdifference\b|\bvs\b|\bversus\b|\bbetween\b/i.test(q)) {
    return `**Answer**
Here's the key contrast (adjusted for your ${ctx.cefr} level):

**Why**
These expressions differ in **register** (formality) and **collocation** (what words they pair with). At your level, focus on using each one in its most natural context.

**Example**
Think of them as different tools for different jobs — not perfect synonyms.

**Practice**
Use BOTH expressions in one sentence each about the same topic. This forces your brain to feel the difference.`;
  }

  // ── Socratic (coach mode) ───────────────────────────────────────────────
  if (mode === "coach") {
    return `Good question — but let's work it out together.

**Hint 1**: Look at the context. What is the main verb doing here?
**Hint 2**: What pattern have you seen with this word before?

Try to answer yourself first — then I'll confirm and explain.`;
  }

  // ── IELTS mode ──────────────────────────────────────────────────────────
  if (mode === "ielts") {
    return `**Answer** (IELTS perspective, ${ctx.cefr} level)
This affects your band score through Lexical Resource and Grammatical Range.

**Why**
Examiners look for range AND accuracy. Using this correctly shows control; avoiding it or misusing it caps your score.

**Practice**
Write one IELTS-style sentence using this target language naturally.`;
  }

  // ── General explanation ─────────────────────────────────────────────────
  const hasChunks = ctx.relevantChunks.length > 0;
  return `**Answer**
${hasChunks ? `You've already learned "${ctx.relevantChunks[0].text}" — this connects to that.` : "Let me explain this at your level."}

**Why**
The language logic here follows a pattern. Understanding *why* (not just *what*) is what makes it transferable to new contexts.

**Example**
See it in a real sentence — meaning comes from context, not from memorizing definitions.

**Practice**
Use this in one sentence about YOUR life. Production is what turns knowledge into ability.

*(Connect an AI provider for personalized, context-aware explanations)*`;
}
