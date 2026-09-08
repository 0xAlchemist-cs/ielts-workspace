import { db } from "@/db";
import { appConfig } from "@/db/schema";
import type { AIProvider } from "@/lib/ai/provider";
import { mockProvider } from "@/lib/ai/providers/mock";
import { OpenAICompatProvider } from "@/lib/ai/providers/openai-compat";
import type {
  DrillSet,
  ParaphraseFeedback,
  RetrievalGrade,
  SentenceAnalysis,
  SpeakingFeedback,
  TutorReply,
  WordAnalysis,
  WritingFeedback,
} from "@/lib/types";
import { mockDrills } from "@/lib/ai/mock-drills";

/** Live provider with automatic mock fallback: config errors, network errors
 *  and schema mismatches all degrade gracefully to offline behaviour. */
class FallbackProvider implements AIProvider {
  readonly name = "fallback(openai-compat→mock)";
  readonly isMock = false; // intends live; individual results carry isMock

  constructor(private live: OpenAICompatProvider) {}

  private async run<T>(liveCall: () => Promise<T>, mockCall: () => Promise<T>): Promise<T> {
    try {
      return await liveCall();
    } catch (err) {
      console.warn("[ai] live provider failed, falling back to mock:", (err as Error).message);
      const mockResult = await mockCall();
      return mockResult;
    }
  }

  word(i: Parameters<AIProvider["word"]>[0]): Promise<WordAnalysis> {
    return this.run(() => this.live.word(i), () => mockProvider.word(i));
  }
  drills(i: Parameters<NonNullable<AIProvider["drills"]>>[0]): Promise<DrillSet> {
    return this.run(() => this.live.drills!(i), () => Promise.resolve(mockDrills(i)));
  }
  sentence(i: Parameters<AIProvider["sentence"]>[0]): Promise<SentenceAnalysis> {
    return this.run(() => this.live.sentence(i), () => mockProvider.sentence(i));
  }
  retrieval(i: Parameters<AIProvider["retrieval"]>[0]): Promise<RetrievalGrade> {
    return this.run(() => this.live.retrieval(i), () => mockProvider.retrieval(i));
  }
  speaking(i: Parameters<AIProvider["speaking"]>[0]): Promise<SpeakingFeedback> {
    return this.run(() => this.live.speaking(i), () => mockProvider.speaking(i));
  }
  writing(i: Parameters<AIProvider["writing"]>[0]): Promise<WritingFeedback> {
    return this.run(() => this.live.writing(i), () => mockProvider.writing(i));
  }
  paraphrase(i: Parameters<AIProvider["paraphrase"]>[0]): Promise<ParaphraseFeedback> {
    return this.run(() => this.live.paraphrase(i), () => mockProvider.paraphrase(i));
  }
  tutor(i: Parameters<AIProvider["tutor"]>[0]): Promise<TutorReply> {
    return this.run(() => this.live.tutor(i), () => mockProvider.tutor(i));
  }
}

// ── Provider config: Settings-saved (DB) first, .env.local fallback ─────────
// better-sqlite3 is synchronous, so config stays readable from the original
// sync getProvider()/isLiveConfigured() call sites — no consumer changes.
// The result is cached per server process and invalidated on Settings save.

export type AIProviderConfig = { baseUrl: string; apiKey: string; model: string };

const DEFAULT_MODEL = "glm-4.6";

let cachedConfig: AIProviderConfig | null | undefined; // undefined = not loaded yet

export function invalidateAIConfigCache(): void {
  cachedConfig = undefined;
}

function configFromEnv(): AIProviderConfig | null {
  if (process.env.AI_BASE_URL && process.env.AI_API_KEY) {
    return {
      baseUrl: process.env.AI_BASE_URL,
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || DEFAULT_MODEL,
    };
  }
  return null;
}

function readConfigRowSync(): Record<string, string> {
  const rows = db.select().from(appConfig).all();
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function loadAIProviderConfig(): AIProviderConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const row = readConfigRowSync();
  cachedConfig =
    row.ai_base_url && row.ai_api_key
      ? {
          baseUrl: row.ai_base_url,
          apiKey: row.ai_api_key,
          model: row.ai_model || DEFAULT_MODEL,
        }
      : configFromEnv();
  return cachedConfig;
}

/** For UI status display — NEVER exposes the key, only a short mask. */
export function getAIProviderStatus(): {
  live: boolean;
  baseUrl?: string;
  model?: string;
  keyMask?: string;
  source: "settings" | "env" | "none";
} {
  const row = readConfigRowSync();
  if (row.ai_base_url && row.ai_api_key) {
    return {
      live: true,
      baseUrl: row.ai_base_url,
      model: row.ai_model || DEFAULT_MODEL,
      keyMask: `…${row.ai_api_key.slice(-4)}`,
      source: "settings",
    };
  }
  const env = configFromEnv();
  if (env) {
    return {
      live: true,
      baseUrl: env.baseUrl,
      model: env.model,
      keyMask: `…${env.apiKey.slice(-4)}`,
      source: "env",
    };
  }
  return { live: false, source: "none" };
}

export function isLiveConfigured(): boolean {
  return loadAIProviderConfig() != null;
}

/** Provider selection: live when configured, mock otherwise. */
export function getProvider(): AIProvider {
  const config = loadAIProviderConfig();
  if (config) {
    return new FallbackProvider(
      new OpenAICompatProvider(config.baseUrl, config.apiKey, config.model),
    );
  }
  return mockProvider;
}

export { mockProvider };
