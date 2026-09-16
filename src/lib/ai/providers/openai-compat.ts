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
  DRILL_PROMPT,
} from "@/lib/ai/tasks";
import type { AIProvider } from "@/lib/ai/provider";
import type { DrillSet, ParaphraseFeedback, RetrievalGrade, SentenceAnalysis, SpeakingFeedback, TutorReply, WordAnalysis, WritingFeedback } from "@/lib/types";
import { getActiveExam } from "@/server/current-user";
import { examPromptProfile } from "@/lib/ai/prompts";

type TaskName =
  | "word"
  | "sentence"
  | "retrieval"
  | "speaking"
  | "writing"
  | "paraphrase"
  | "tutor"
  | "drills";

const PROMPTS: Record<TaskName, string> = {
  word: WORD_PROMPT,
  sentence: SENTENCE_PROMPT,
  retrieval: RETRIEVAL_PROMPT,
  speaking: SPEAKING_PROMPT,
  writing: WRITING_PROMPT,
  paraphrase: PARAPHRASE_PROMPT,
  tutor: TUTOR_PROMPT,
  drills: DRILL_PROMPT,
};

/* Coaching/analysis tasks learn the learner's exam goal (V8) so selection
 * priorities match; grading/drilling tasks stay exam-neutral (their output
 * shape is fixed and objective). */
const EXAM_AWARE: Partial<Record<TaskName, boolean>> = {
  word: true,
  sentence: true,
  tutor: true,
  paraphrase: true,
  speaking: true,
  writing: true,
};

/** Long-JSON tasks (sentence 8-dim, full essay marking) regularly exceed the
 *  default on flash-tier models — give them room instead of degrading to
 *  template output after a minute. */
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
    let system = PROMPTS[task];
    if (EXAM_AWARE[task]) {
      const exam = await getActiveExam();
      system = `${system}\n\n---\n${examPromptProfile(exam)}`;
    }
    const url = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;
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
      throw new Error(`AI provider ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI provider returned an empty message");
    // Some models wrap JSON in ```json fences — strip before parsing.
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(cleaned);
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
}
