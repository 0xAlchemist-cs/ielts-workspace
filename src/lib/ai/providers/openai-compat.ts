import {
  PARAPHRASE_PROMPT,
  RETRIEVAL_PROMPT,
  SENTENCE_PROMPT,
  SPEAKING_PROMPT,
  TUTOR_PROMPT,
  WORD_PROMPT,
  WRITING_PROMPT,
  paraphraseSchema,
  retrievalSchema,
  sentenceSchema,
  speakingSchema,
  tutorSchema,
  wordSchema,
  writingSchema,
  drillSchema,
  contentLevelSchema,
  cetWritingFeedbackSchema,
  DRILL_PROMPT,
} from "@/lib/ai/tasks";
import type { AIProvider, ContentLevelInput, ContentLevelResult } from "@/lib/ai/provider";
import type { DrillSet, ParaphraseFeedback, RetrievalGrade, SentenceAnalysis, SpeakingFeedback, TutorReply, WordAnalysis, WritingFeedback } from "@/lib/types";
import { getActiveExam } from "@/server/current-user";
import { resolvePrompt } from "@/lib/ai/registry";
import { db } from "@/db";
import { users, learningProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

type TaskName = Parameters<typeof resolvePrompt>[0]["task"];

/* V13: The old PROMPTS map + EXAM_AWARE injection are replaced by the Prompt
 * Registry + Resolver (src/lib/ai/registry.ts). chatJSON calls resolvePrompt
 * which composes Module + Exam + CEFR + Base (with injection guard). */

/** Long-JSON tasks (sentence 8-dim, full essay marking) regularly exceed the
 * default on flash-tier models — give them room instead of degrading to
 * template output after a minute. */
const TASK_TIMEOUT_MS: Partial<Record<TaskName, number>> = {
  sentence: 150_000,
  writing: 180_000,
  speaking: 90_000,
};

/** Any OpenAI-compatible chat endpoint (GLM, OpenAI, DeepSeek, Ollama, ...). */
export class OpenAICompatProvider implements AIProvider {
  readonly name = "openai-compat";
  readonly isMock = false;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  private async chatJSON(task: TaskName, payload: unknown): Promise<unknown> {
    // V13: Prompt Resolver composes Module + Exam + CEFR + Base (with injection guard)
    const exam = await getActiveExam();
    let cefr: string | null = null;
    try {
      const [p] = await db
        .select({ cefr: learningProfiles.cefr })
        .from(learningProfiles)
        .innerJoin(users, eq(users.id, learningProfiles.userId))
        .where(eq(users.examProfile, exam))
        .limit(1);
      cefr = p?.cefr ?? null;
    } catch { /* profile lookup is best-effort */ }
    const resolved = resolvePrompt({ task, exam, cefr });
    const system = resolved.systemPrompt;

    const url = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const maxAttempts = 2; // one retry for transient failures (timeout / 429 / 5xx)
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(payload) },
            ],
          }),
          redirect: "manual", // never follow redirects — the URL was guard-checked, a hop is not
          signal: AbortSignal.timeout(TASK_TIMEOUT_MS[task] ?? 60_000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const err = new Error(`AI provider ${res.status}: ${body.slice(0, 300)}`);
          // retry only transient failures; auth/validation errors fail immediately
          (err as Error & { retryable?: boolean }).retryable =
            res.status === 429 || res.status >= 500;
          throw err;
        }
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("AI provider returned an empty message");
        // Some models wrap JSON in ```json fences — strip before parsing.
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        return JSON.parse(cleaned);
      } catch (e) {
        lastError = e as Error;
        const retryable =
          (e as Error & { retryable?: boolean }).retryable === true ||
          (e as Error).name === "TimeoutError" ||
          (e as Error).name === "AbortError";
        if (!retryable || attempt === maxAttempts) throw e;
        // brief backoff before retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    throw lastError ?? new Error("AI request failed");
  }

  async word(input: Parameters<AIProvider["word"]>[0]): Promise<WordAnalysis> {
    const raw = wordSchema.parse(await this.chatJSON("word", input));
    return { ...raw, isMock: false };
  }

  async sentence(input: Parameters<AIProvider["sentence"]>[0]): Promise<SentenceAnalysis> {
    const raw = sentenceSchema.parse(await this.chatJSON("sentence", input));
    return { ...raw, isMock: false };
  }

  async retrieval(input: Parameters<AIProvider["retrieval"]>[0]): Promise<RetrievalGrade> {
    const raw = retrievalSchema.parse(
      await this.chatJSON("retrieval", {
        mode: input.mode,
        prompt: input.prompt,
        expected: input.expected,
        userResponse: input.userResponse,
      }),
    );
    return { ...raw, isMock: false };
  }

  async speaking(input: Parameters<AIProvider["speaking"]>[0]): Promise<SpeakingFeedback> {
    const raw = speakingSchema.parse(await this.chatJSON("speaking", input));
    return { ...raw, isMock: false };
  }

  async writing(input: Parameters<AIProvider["writing"]>[0]): Promise<WritingFeedback> {
    const raw = writingSchema.parse(await this.chatJSON("writing", input));
    return {
      ...raw,
      isMock: false,
      // Live models now return these (schema + prompt); never hardcode empty —
      // the Error Bank integration depends on them.
      rewriteTasks: raw.rewriteTasks ?? [],
      acquisition: {
        activeItemsUsed: [],
        successfulRetrievals: [],
        failedRetrievals: [],
        newErrors: [],
        reusedExpressions: [],
        transferSuccess: 0,
        sentenceVariety: 0,
        paraphrasingScore: 0,
      },
      usedChunkIds: [],
      usedChunkTexts: [],
    };
  }

  async paraphrase(input: Parameters<AIProvider["paraphrase"]>[0]): Promise<ParaphraseFeedback> {
    const raw = paraphraseSchema.parse(await this.chatJSON("paraphrase", input));
    return { ...raw, isMock: false };
  }

  async tutor(input: Parameters<AIProvider["tutor"]>[0]): Promise<TutorReply> {
    const raw = tutorSchema.parse(
      await this.chatJSON("tutor", { history: input.history, goal: input.goal }),
    );
    return { ...raw, isMock: false };
  }

  async drills(input: Parameters<NonNullable<AIProvider["drills"]>>[0]): Promise<DrillSet> {
    const raw = drillSchema.parse(await this.chatJSON("drills", input));
    return { items: raw.items, isMock: false };
  }

  /** IELTS-only task — classification must never bend to the learner's level,
   * so this task stays out of EXAM_AWARE injection; its master prompt carries
   * its own context rules. */
  async classifyContentLevel(input: ContentLevelInput): Promise<ContentLevelResult> {
    const raw = contentLevelSchema.parse(
      await this.chatJSON("classifyContentLevel", {
        title: input.title,
        content: input.content.slice(0, 8000),
        resourceType: input.resourceType,
        currentUserLevel: input.currentUserLevel,
      }),
    );
    return {
      level: raw.level,
      confidence: raw.confidence,
      summary: raw.summary,
      isMock: false,
    };
  }
  /** V12.2.1: CET writing/translation practice feedback — exam context in the
   * prompt, never IELTS; output is guidance, never an official score. */
  async cetWritingFeedback(input: { exam: "cet4" | "cet6"; section: string; prompt: string; answer: string }) {
    const raw = cetWritingFeedbackSchema.parse(
      await this.chatJSON("cetWritingFeedback", {
        exam: input.exam === "cet4" ? "CET-4 (practical university English)" : "CET-6 (broader academic English)",
        section: input.section,
        prompt: input.prompt.slice(0, 2000),
        answer: input.answer.slice(0, 6000),
      }),
    );
    return { ...raw, isMock: false };
  }
}
