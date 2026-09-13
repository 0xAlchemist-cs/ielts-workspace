// Deep-processing content for the Language Lab and sentence drawer.
// Bespoke notes exist for the five showcase chunks; everything else falls
// back to templates built from the chunk's own meaning data.

export interface DeepNotes {
  whyThisExpression: string;
  nativeLogic: string;
  alternatives: { expression: string; note: string }[];
  differences: string;
  extraCollocations?: string[];
}

export const DEEP_NOTES: Record<string, DeepNotes> = {
  "be supposed to": {
    whyThisExpression:
      '"supposed" carries an EXTERNAL expectation — a plan, rule, or arrangement set by someone else — and it says nothing about what actually happened. That gap between expectation and reality is exactly what this chunk is for.',
    nativeLogic:
      'English marks "expected but maybe unfulfilled" with be supposed to, then typically reveals the contrast in the next clause: "I was supposed to call everyone back, but...". Native speakers hear the "but" coming before you say it.',
    alternatives: [
      { expression: "be expected to", note: "more formal; duty or prediction from others (work, rules)" },
      { expression: "be meant to", note: "softer, British-flavoured; intention or design" },
      { expression: "should have + done", note: "past criticism — it DIDN\'T happen and it should have" },
      { expression: "was going to", note: "my OWN intention, no outside expectation, also often unfulfilled" },
    ],
    differences:
      "be supposed to = outside expectation (often broken) · should = advice/opinion · be expected to = formal duty · was going to = personal plan. In exams, choosing supposed to shows you distinguish expectation from obligation.",
    extraCollocations: ["be supposed to be here", "you're supposed to do", "who was supposed to"],
  },
  "end up doing": {
    whyThisExpression:
      '"end up" frames the final result of a process nobody directly chose. The outcome arrives through drift, accident, or a chain of small decisions — a plain past tense would hide all of that.',
    nativeLogic:
      'Narrative English loves "planned X but ended up Y": "I was going to go out, but I ended up staying home." The pair was going to → ended up is one of the most frequent storytelling moves in conversation.',
    alternatives: [
      { expression: "wind up doing", note: "same meaning, more informal / American" },
      { expression: "turn out to be", note: "discovery about facts, not an unplanned action" },
      { expression: "finish by doing", note: "the last step of an intended sequence (planned)" },
    ],
    differences:
      "end up = unplanned final outcome · turn out = information discovered later · wind up = casual synonym of end up · finish by = the deliberate last step.",
    extraCollocations: ["end up doing nothing", "end up like this", "where did you end up?"],
  },
  "I've been meaning to": {
    whyThisExpression:
      "Present perfect progressive of mean: the intention started in the past, still exists now, and the delay is being acknowledged. It is the standard English apology-for-not-doing-something.",
    nativeLogic:
      'When a native speaker says "I\'ve been meaning to call you", the hearer automatically understands: the delay was not because I don\'t care. It repairs the relationship before making the request.',
    alternatives: [
      { expression: "I keep meaning to", note: "even more casual; repeated failed attempts" },
      { expression: "I've been wanting to", note: "desire more than intention" },
      { expression: "I never got around to", note: "past — the chance has now passed" },
    ],
    differences:
      "I've been meaning to = intention still alive + apologising for delay · I never got around to = admitting it never happened · I've been wanting to = feeling, weaker commitment.",
    extraCollocations: ["I've been meaning to ask you", "I've been meaning to tell you", "I've been meaning to call"],
  },
  "I was wondering if": {
    whyThisExpression:
      "Past continuous + if creates distance, and distance creates politeness. You present your request as a passing thought rather than a demand, giving the other person room to refuse.",
    nativeLogic:
      "English softens requests grammatically, not just with 'please': I want to know → I'd like to know → I was wondering if you could tell me. The further back the tense, the more tentative the request.",
    alternatives: [
      { expression: "Could you possibly...", note: "polite but more direct" },
      { expression: "Would it be possible to...", note: "formal, written contexts" },
      { expression: "Do you think I could...", note: "neutral spoken" },
    ],
    differences:
      "I was wondering if = most tentative, spoken · Could you = standard polite · Would it be possible = formal/written. In IELTS speaking and daily conversation, I was wondering if signals natural fluency.",
    extraCollocations: ["I was wondering if you could help", "I was wondering if I could ask", "I was wondering whether"],
  },
  "it turns out (that)": {
    whyThisExpression:
      '"turns out" marks information as DISCOVERED LATER, often against expectation. It separates "what we assumed" from "what turned out to be true" — a tiny word that carries the whole surprise.',
    nativeLogic:
      'Native speakers use it to reorganise a story: "Everyone thought X. It turns out Y." It also works as a one-word sentence starter — "Turns out, he was right all along." — which is extremely common in conversation.',
    alternatives: [
      { expression: "apparently", note: "hearsay — you heard it but can\'t vouch for it" },
      { expression: "as it happens", note: "coincidence being revealed right now" },
      { expression: "in fact", note: "correction/contrast, no discovery over time" },
    ],
    differences:
      "it turns out = discovered later, often surprising · apparently = reported by others · in fact = direct contrast. Turns out implies a process of finding out; the others don't.",
    extraCollocations: ["it turns out that", "turns out he was", "as it turned out"],
  },
  "when it comes to": {
    whyThisExpression:
      "It narrows your statement to one topic before you judge it — the listener instantly knows the frame: 'opinions may differ elsewhere, but here is my claim about THIS.'",
    nativeLogic:
      'A natural discourse marker in both conversation and essays: "When it comes to money, I\'m careful." It buys you a second of thinking time while sounding organised.',
    alternatives: [
      { expression: "as far as ... is concerned", note: "same function, more formal — great for IELTS writing" },
      { expression: "regarding / when we consider", note: "written, essay register" },
      { expression: "speaking of", note: "looser link to a previously mentioned topic" },
    ],
    differences:
      "when it comes to = conversational framing · as far as ... is concerned = formal exam framing · regarding = written. Same job, different register — using both shows range.",
  },
  "there is no denying (that)": {
    whyThisExpression:
      "It concedes a fact so strongly that disagreement sounds unreasonable — then you usually pivot ('...but') to your own position. It is a classic essay-concession move.",
    nativeLogic:
      'Essays argue by conceding then countering: "There is no denying that technology saves time. However, ..." Learn it as a fixed frame for the first sentence of a body paragraph.',
    alternatives: [
      { expression: "it is undeniable that", note: "same meaning, passive and more formal" },
      { expression: "admittedly", note: "one-word concession, elegant in writing" },
      { expression: "nobody would dispute that", note: "rhetorical, spoken" },
    ],
    differences:
      "there is no denying = strong concessive frame · admittedly = lighter concession · it is undeniable that = impersonal essay register.",
  },
  "have an impact on": {
    whyThisExpression:
      "It names a strong, noticeable effect and points at exactly who or what receives it. Stronger and more precise than 'affect', and it puts the EFFECT in the driver's seat of the sentence.",
    nativeLogic:
      'Noun-based effects are the backbone of academic English: have an impact/effect/influence on. Adjectives scale it: a huge / significant / minimal impact — examiners listen for exactly these collocations.',
    alternatives: [
      { expression: "affect / influence (verbs)", note: "verb versions — quicker, slightly less emphasised" },
      { expression: "play a role in", note: "ONE factor among several, not the dominant cause" },
      { expression: "shape", note: "gradual forming of something (habits, identity, attitudes)" },
    ],
    differences:
      "have an impact on = strong direct effect · play a role in = contributing factor · shape = gradual influence over time · affect = neutral verb.",
  },
  "be worth doing": {
    whyThisExpression:
      "worth + -ing judges an action by its return: the time, money or effort is justified by what you get back. The -ing form is fixed — 'worth to do' is impossible.",
    nativeLogic:
      "Two frames: It's worth doing (general) and It's worth it (referring back). Scale down with 'hardly worth', up with 'well worth'.",
    alternatives: [
      { expression: "deserve + noun", note: "earned by quality — 'deserves attention'" },
      { expression: "pay off", note: "the effort eventually produced results" },
      { expression: "be worthwhile", note: "close synonym, slightly more formal" },
    ],
    differences:
      "worth doing = value justifies cost · pay off = it already produced results · deserve = quality earns something · worthwhile = generally rewarding.",
  },
  "put off doing": {
    whyThisExpression:
      "The phrasal verb makes delay feel physical — you push the task away from you. With -ing fixed after it: put off doing, never 'put off to do'.",
    nativeLogic:
      "Classic procrastination English: 'I kept putting it off.' Pair it with 'I've been meaning to' to describe the whole procrastination experience naturally.",
    alternatives: [
      { expression: "postpone", note: "neutral, formal — you reschedule deliberately" },
      { expression: "procrastinate", note: "the psychology word for the habit itself" },
      { expression: "delay", note: "neutral cause-based waiting" },
    ],
    differences:
      "put off = avoid because you don't want to · postpone = conscious rescheduling · delay = any late-ness, often external · procrastinate = the general bad habit.",
  },
};

export function genericNotes(chunkText: string, meaningEn: string): DeepNotes {
  return {
    whyThisExpression: `"${chunkText}" packs a specific idea — ${meaningEn.toLowerCase().replace(/^to /, "")} — into one stored unit. Using the whole chunk says exactly this, instantly, instead of assembling words one by one.`,
    nativeLogic: `Native speakers retrieve "${chunkText}" as a single piece, not word-by-word grammar. Every time you produce it as one unit, you are training exactly that retrieval.`,
    alternatives: [
      { expression: "(connect a real AI provider for alternatives)", note: "The offline mock only carries deep notes for the core chunks." },
    ],
    differences: "Full comparison data is available with a live AI provider.",
  };
}
