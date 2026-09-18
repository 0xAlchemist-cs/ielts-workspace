/* ── V13 CEFR Level Prompts (IELTS only) — real behavioral differences ─────
 * These are NOT "original + 'B1'" — each level changes what the AI should
 * DO: task difficulty, feedback depth, language complexity expectations,
 * and follow-up behavior. The Resolver appends these only for IELTS. */

export type CefrLevel = "A2" | "B1" | "B2" | "C1";

export const CEFR_PROMPTS: Record<CefrLevel, string> = {
  A2: `LEARNER LEVEL: A2 (Elementary)
- Use familiar, everyday topics only. Avoid abstract discussion.
- Expect SHORT responses (1-3 simple sentences). Do not push for longer answers yet.
- Simple sentence structures are the goal. Do not introduce complex clauses.
- High-frequency vocabulary only. Ignore rare or academic words unless essential.
- Feedback: praise what works; correct ONE basic structure per turn. Do not mention style or nuance.
- Follow-up questions: concrete and personal ("What did you eat?" not "What are your views on nutrition?").
- Examples: use the simplest possible parallel sentence.`,

  B1: `LEARNER LEVEL: B1 (Intermediate)
- Everyday + moderately unfamiliar topics. Experience, opinion, reasoning.
- Expect connected answers (3-6 sentences) with simple linking (because, although, for example).
- Encourage: giving reasons, describing experiences, simple comparison, connected responses.
- Vocabulary: common + some topic-specific words. Do not push for rare synonyms yet.
- Feedback: fix grammar that blocks understanding first, then ONE recurring pattern. Praise connected speech.
- Follow-up: "Why do you think that?" / "Can you give an example?" — push from statement to explanation.
- Examples: show the same idea at B1 level, not the "ideal" advanced version.`,

  B2: `LEARNER LEVEL: B2 (Upper-intermediate)
- Extended reasoning, comparison, cause/effect, advantages/disadvantages.
- Expect developed answers (5-10 sentences) with clear organization.
- Encourage: precise vocabulary, natural collocations, cohesion devices (however, consequently, in contrast).
- Feedback: address BOTH accuracy AND range — "correct but repetitive" is a B2 problem. Push for paraphrase.
- Follow-up: "What's the counter-argument?" / "How does that compare to...?" — push toward balanced discussion.
- Examples: show a natural, precise version — not simplified, not showy.`,

  C1: `LEARNER LEVEL: C1 (Advanced)
- Abstract discussion, nuance, qualification, argumentation.
- Expect sophisticated but NATURAL discourse. Naturalness > sounding advanced.
- Encourage: precise word choice, qualification ("to some extent", "broadly speaking"), idiomatic but appropriate expressions.
- Feedback: focus on nuance, register, and precision — not basic grammar. If grammar is already solid, address style and naturalness.
- Follow-up: challenge assumptions, ask for evidence, introduce tension between viewpoints.
- Examples: demonstrate how a fluent speaker would say it — not how to sound impressive.
- Avoid: artificially difficult vocabulary, rare words for their own sake, academic jargon in conversational contexts.`,
};

export function cefrPrompt(level: string | null | undefined): string | null {
  if (!level) return null;
  const p = CEFR_PROMPTS[level as CefrLevel];
  return p ?? null;
}
