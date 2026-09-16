/* ── IELTS Speaking prompt profiles by CEFR (V9) ────────────────────────────
 * One task pool per level, human words only — no engine terminology. Tasks
 * rotate with the day; the learner's top weak expression is woven in
 * naturally when one is due. */

export interface SpeakingTask {
  focusEn: string;
  focusZh: string;
  questions: string[];
}

const TASKS: Record<string, SpeakingTask> = {
  A2: {
    focusEn: "Talk about familiar, everyday things in simple sentences.",
    focusZh: "用简单的句子聊熟悉的日常话题。",
    questions: [
      "Describe your typical morning. What do you do first?",
      "Tell me about a place you go to often. What do you do there?",
      "What did you eat yesterday? Did you like it?",
    ],
  },
  B1: {
    focusEn: "Describe experiences, give reasons, and share opinions.",
    focusZh: "描述经历、说明理由、表达观点。",
    questions: [
      "Tell me about a decision you made recently. Why did you choose that?",
      "Describe a trip that taught you something. What happened?",
      "Do you prefer studying alone or with others? Explain why.",
    ],
  },
  B2: {
    focusEn: "Argue a position with reasons, comparisons, and consequences.",
    focusZh: "有理有据地论证：原因、比较、利弊。",
    questions: [
      "Some people say remote work makes teams weaker. What's your view?",
      "How has technology changed the way people your age make friends?",
      "Should universities teach practical skills instead of theory? Argue your case.",
    ],
  },
  C1: {
    focusEn: "Discuss nuance, qualify your claims, and use precise language.",
    focusZh: "讨论细微差别，限定立场，用精确的语言表达。",
    questions: [
      "To what extent should governments regulate what children learn at school?",
      "Is 'natural talent' a useful idea, or does it hide how skill actually develops?",
      "Where do you draw the line between healthy ambition and harmful pressure?",
    ],
  },
};

export function speakingTaskFor(level: string): SpeakingTask {
  return TASKS[level] ?? TASKS.B1;
}

/** Weave the day's question with the learner's weak expression — an
 * invitation, never an order ("try to use it if it fits"). */
export function personalizeSpeakingTask(task: SpeakingTask, weakExpression: string | null | undefined = null): string {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const q = task.questions[dayIndex % task.questions.length];
  return weakExpression
    ? `${q}\n\nTry to naturally use "${weakExpression}" if it fits your answer.`
    : q;
}
