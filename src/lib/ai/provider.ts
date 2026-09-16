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
import type { DrillInput } from "@/lib/types";
import type { GradeTarget } from "@/lib/grading";

export interface WordInput {
  word: string;
  sentenceContext?: string;
}

export interface MatchedChunkHint {
  text: string;
  pattern: string;
  meaningEn: string;
  meaningZh: string;
  examples: string[];
  register?: string;
}

export interface SentenceInput {
  sentence: string;
  matchedChunks: MatchedChunkHint[];
}

export interface RetrievalInput {
  mode: string;
  prompt: string;
  expected: string;
  userResponse: string;
  target: GradeTarget;
}

export interface SpeakingInput {
  prompt: string;
  transcript: string;
  targetChunks: string[];
  recentErrors: { wrong: string; correct: string }[];
}

export interface WritingInput {
  prompt: string;
  text: string;
  targetChunks?: string[];  // chunks the Retrieval Engine wants activated in writing
}

export interface ParaphraseInput {
  source: string;
  userParaphrase: string;
  models?: string[];
}

export interface TutorInput {
  history: { role: "user" | "assistant"; text: string }[];
  goal?: string;
}

export interface ContentLevelInput {
  title: string;
  content: string;
  resourceType: string;
  currentUserLevel?: string;
}

export interface ContentLevelResult {
  level: "A2" | "B1" | "B2" | "C1";
  confidence: number;
  summary: string;
  isMock: boolean;
}

export interface AIProvider {
  readonly name: string;
  readonly isMock: boolean;
  word(input: WordInput): Promise<WordAnalysis>;
  sentence(input: SentenceInput): Promise<SentenceAnalysis>;
  retrieval(input: RetrievalInput): Promise<RetrievalGrade>;
  speaking(input: SpeakingInput): Promise<SpeakingFeedback>;
  writing(input: WritingInput): Promise<WritingFeedback>;
  paraphrase(input: ParaphraseInput): Promise<ParaphraseFeedback>;
  tutor(input: TutorInput): Promise<TutorReply>;
  /** IELTS-only: classify a whole material's language difficulty (V9) */
  classifyContentLevel?(input: ContentLevelInput): Promise<ContentLevelResult>;
  /** optional — providers without live drill generation fall back to mock frames */
  drills?(input: DrillInput): Promise<DrillSet>;
}
