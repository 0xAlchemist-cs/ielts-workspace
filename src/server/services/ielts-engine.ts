import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { ieltsTasks, ieltsAttempts, ieltsSkillProfiles, chunks, errors, retrievalItems, reviewHistory } from "@/db/schema";
import { CHUNK_DETECT } from "@/lib/chunk-detect";
import { computeFullProfile, detectErrorPatterns } from "@/server/services/learning-profile";
import { addError } from "@/server/services/bank";
import { markChunkActivated, logChunkEvent } from "@/server/services/events";
import type { IeltsSkill, IeltsTask, IeltsAttempt, IeltsMode, BandGap, IeltsSkillProfile } from "@/lib/types";

/* ── IELTS Engine: measurement + transfer layer ────────────────────────────
 * Reads the learning system (Profile, Errors, Retrieval) to decide which
 * IELTS task the user should do. NEVER asks "use expression X" — tasks are
 * natural, expressions are detected from the user's output afterwards. */

/** Seed IELTS tasks — MVP sample data, architecture ready for real banks. */
const SEED_TASKS: Partial<IeltsTask>[] = [
  // ── Reading ──────────────────────────────────────────────────────────────
  {
    taskType: "reading_passage", skill: "reading", difficulty: 3, topic: "technology",
    prompt: "Read the passage about remote work and answer the questions below.",
    content: `Remote work has fundamentally altered the professional landscape. Companies that were supposed to return to office-based models have instead adopted hybrid arrangements permanently. Employees pushed back against mandates, and businesses realised that commuting five days a week was not worth the cost.\n\nNew staff often struggle to figure out unwritten rules when they never meet colleagues in person. Many end up working longer hours at home because the boundary between work and life gradually disappears. However, successful remote teams have come up with clear protocols: core hours, short meetings, and one office day per week to catch up on what cannot be discussed over video.\n\nWhen it comes to productivity, the results speak for themselves. As far as employee satisfaction is concerned, studies consistently show that flexibility plays a crucial role in retention.`,
    questions: [
      { question: "What happened to companies that were expected to return to office work?", options: ["They went bankrupt", "They adopted hybrid models", "They fired remote workers"], answer: "They adopted hybrid models", subSkill: "detail" },
      { question: "According to the passage, what is one problem for new remote staff?", answer: "struggle to figure out unwritten rules", subSkill: "detail" },
      { question: "The word 'gradually' in paragraph 2 is closest in meaning to:", options: ["suddenly", "slowly", "completely"], answer: "slowly", subSkill: "vocabulary_in_context" },
      { question: "Which of the following is NOT mentioned as a successful remote team protocol?", options: ["Core hours", "Short meetings", "Monthly team-building retreats"], answer: "Monthly team-building retreats", subSkill: "detail" },
      { question: "The passage suggests that flexibility in work arrangements:", options: ["has no effect on retention", "plays a crucial role in retention", "decreases productivity"], answer: "plays a crucial role in retention", subSkill: "inference" },
    ],
    estimatedBand: 6, timeLimitMinutes: 15,
  },
  {
    taskType: "reading_passage", skill: "reading", difficulty: 4, topic: "environment",
    prompt: "Read the passage about fast fashion and answer the questions.",
    content: `There is no denying that fast fashion has had a significant impact on both the environment and labour conditions. The industry produces over 100 billion garments annually, with the average item worn only seven to ten times before disposal.\n\nManufacturing a single cotton shirt takes approximately 2,700 litres of water — enough drinking water for one person for two and a half years. Companies get away with poor working conditions because supply chains are long and difficult to monitor.\n\nHowever, consumer awareness is slowly growing. Buying second-hand, repairing rather than replacing, and simply cutting down on consumption are all becoming mainstream again.`,
    questions: [
      { question: "How many times is the average garment worn before being thrown away?", options: ["2-3 times", "7-10 times", "20-30 times"], answer: "7-10 times", subSkill: "detail" },
      { question: "The phrase 'get away with' in paragraph 2 means:", options: ["to escape punishment", "to profit from", "to travel with"], answer: "to escape punishment", subSkill: "paraphrase_recognition" },
      { question: "Which solution is NOT mentioned in the passage?", options: ["Buying second-hand", "Cutting down on consumption", "Government regulation of prices"], answer: "Government regulation of prices", subSkill: "detail" },
      { question: "The author's attitude toward fast fashion is best described as:", options: ["neutral", "critical", "supportive"], answer: "critical", subSkill: "inference" },
    ],
    estimatedBand: 6.5, timeLimitMinutes: 15,
  },
  // ── Speaking ─────────────────────────────────────────────────────────────
  {
    taskType: "speaking_part2", skill: "speaking", difficulty: 3, topic: "hobbies",
    prompt: "Describe a hobby you took up recently. You should say: what it is, when you started, why you chose it, and explain how you feel about it now.",
    estimatedBand: 6, timeLimitMinutes: 2,
  },
  {
    taskType: "speaking_part2", skill: "speaking", difficulty: 4, topic: "technology",
    prompt: "Describe a time when something you planned didn't work out as expected. You should say: what you planned, what happened instead, why it went wrong, and explain how you felt about it.",
    estimatedBand: 6.5, timeLimitMinutes: 2,
  },
  {
    taskType: "speaking_part3", skill: "speaking", difficulty: 4, topic: "society",
    prompt: "Why do you think modern people find it hard to take up new hobbies? What role does technology play in this? Should governments encourage people to spend less time on social media?",
    estimatedBand: 6.5, timeLimitMinutes: 4,
  },
  // ── Writing ──────────────────────────────────────────────────────────────
  {
    taskType: "writing_task2", skill: "writing", difficulty: 3, topic: "technology",
    prompt: "Many people believe that smartphones have had a significant impact on the way young people communicate. To what extent do you agree or disagree? Write at least 250 words.",
    estimatedBand: 6, timeLimitMinutes: 40,
  },
  {
    taskType: "writing_task2", skill: "writing", difficulty: 4, topic: "environment",
    prompt: "There is growing concern about plastic pollution in the world's oceans. What are the main causes, and what solutions can you suggest? Write at least 250 words.",
    estimatedBand: 6.5, timeLimitMinutes: 40,
  },
  {
    taskType: "writing_task1", skill: "writing", difficulty: 3, topic: "charts",
    prompt: "The graph below shows the percentage of people working from home in five countries between 2010 and 2020. (Use your imagination to describe the data.) Summarise the information by selecting and reporting the main features. Write at least 150 words.",
    estimatedBand: 6, timeLimitMinutes: 20,
  },
  // ── Listening ────────────────────────────────────────────────────────────
  {
    taskType: "listening_section", skill: "listening", difficulty: 3, topic: "daily life",
    prompt: "Listen to the conversation and answer the questions.",
    content: "Mia: Hey Tom, what are you going to do this weekend?\nTom: I'm not sure. I was going to go camping, but the weather looks bad.\nMia: Yeah, it's supposed to rain all day Saturday.\nTom: Exactly. So I might just end up staying home and watching movies.\nMia: You know what you should do? Come to the bike market with me on Sunday.\nTom: The one in the old factory? I've been meaning to check that out for ages!\nMia: Perfect. It starts at ten. Do you want to grab breakfast first?\nTom: Sure. There's a café near my place that does amazing pancakes.\nMia: Sounds good. Oh — can I bring my cousin? She's visiting from Chengdu.\nTom: Of course! The more, the merrier.",
    questions: [
      { question: "What was Tom originally planning to do?", options: ["Go camping", "Visit a friend", "Watch movies"], answer: "Go camping", subSkill: "detail" },
      { question: "What will Tom probably end up doing instead?", answer: "staying home and watching movies", subSkill: "detail" },
      { question: "Where is the bike market?", options: ["Near Tom's house", "In an old factory", "Next to the café"], answer: "In an old factory", subSkill: "detail" },
      { question: "How long has Tom wanted to visit the bike market?", answer: "for ages", subSkill: "vocabulary_recognition" },
      { question: "Who is Mia bringing on Sunday?", options: ["Her sister", "Her cousin", "A friend from work"], answer: "Her cousin", subSkill: "detail" },
    ],
    estimatedBand: 6, timeLimitMinutes: 10,
  },
];

/** Seed IELTS tasks (idempotent). */
export async function seedIeltsTasks(): Promise<void> {
  const existing = await db.select({ id: ieltsTasks.id }).from(ieltsTasks).limit(1);
  if (existing.length) return;
  for (const t of SEED_TASKS) {
    await db.insert(ieltsTasks).values({
      taskType: t.taskType!,
      skill: t.skill!,
      difficulty: t.difficulty ?? 3,
      topic: t.topic ?? "general",
      prompt: t.prompt!,
      content: t.content ?? null,
      questions: t.questions ?? null,
      targetChunkIds: [],
      estimatedBand: t.estimatedBand ?? 6,
      timeLimitMinutes: t.timeLimitMinutes ?? 20,
      source: "seed",
    });
  }
}

/** Adaptive task selection: reads the entire learning system to decide
 *  which IELTS task the user should do NOW. */
export async function selectAdaptiveTask(
  userId: number,
  mode: IeltsMode = "learning",
): Promise<{ task: IeltsTask | null; reason: string; targetChunks: string[] }> {
  await seedIeltsTasks();

  const [fullProfile, errorPatterns, recentAttempts] = await Promise.all([
    computeFullProfile(userId),
    detectErrorPatterns(userId),
    db.select().from(ieltsAttempts)
      .where(eq(ieltsAttempts.userId, userId))
      .orderBy(desc(ieltsAttempts.createdAt))
      .limit(5),
  ]);

  // Find target chunks needing transfer (at retrieval/usage state)
  const dueItems = await db.select().from(retrievalItems)
    .where(and(eq(retrievalItems.userId, userId), eq(retrievalItems.itemType, "chunk")))
    .limit(20);
  const chunkRows = await db.select().from(chunks).where(eq(chunks.userId, userId));
  const transferReady = chunkRows.filter((c) => {
    const item = dueItems.find((d) => d.itemId === c.id);
    if (!item?.learningState) return false;
    const s = item.learningState.state;
    return s === "retrieval" || s === "usage" || s === "transfer";
  }).slice(0, 4);
  const targetChunkTexts = transferReady.map((c) => c.text);

  // ── Adaptive skill selection ────────────────────────────────────────────
  const weakestSkill = fullProfile.weakestLink.skill?.toLowerCase() ?? "listening";
  const normalizedSkill = (["listening", "reading", "speaking", "writing"].includes(weakestSkill)
    ? weakestSkill : "listening") as IeltsSkill;

  // Avoid same skill as last attempt (diversity)
  const lastSkill = recentAttempts[0]
    ? (await db.select({ skill: ieltsTasks.skill }).from(ieltsTasks).where(eq(ieltsTasks.id, recentAttempts[0].taskId)).limit(1))[0]?.skill
    : null;

  let selectedSkill = normalizedSkill;
  let reason = `Weakest link: ${fullProfile.weakestLink.skill} → ${fullProfile.weakestLink.subSkill}. `;
  if (lastSkill === normalizedSkill && recentAttempts.length > 0) {
    const skills: IeltsSkill[] = ["listening", "reading", "speaking", "writing"];
    const idx = skills.indexOf(normalizedSkill);
    selectedSkill = skills[(idx + 1) % 4];
    reason += `Rotating from ${lastSkill} for diversity. `;
  }

  // Match difficulty to profile level
  const avgScore = fullProfile[selectedSkill === "listening" ? "listening" : selectedSkill === "reading" ? "reading" : selectedSkill === "speaking" ? "speaking" : "writing"]
    ?.reduce((a, d) => a + d.score, 0) ?? 50;
  const difficulty = avgScore / 100 > 0.7 ? 4 : avgScore / 100 > 0.5 ? 3 : 2;

  // Select task
  const candidates = await db.select().from(ieltsTasks).where(eq(ieltsTasks.skill, selectedSkill));
  const match = candidates
    .filter((t) => t.difficulty <= difficulty + 1)
    .sort((a, b) => b.difficulty - a.difficulty)[0]
    ?? candidates[0];

  if (!match) {
    return { task: null, reason: "No tasks available for this skill.", targetChunks: targetChunkTexts };
  }

  reason += `Difficulty ${match.difficulty} (profile score ~${Math.round(avgScore / (fullProfile[selectedSkill as "listening"]?.length || 1))}). `;
  reason += targetChunkTexts.length > 0
    ? `Transfer targets ready: ${targetChunkTexts.join(", ")}.`
    : "No transfer targets due — pure measurement.";

  return {
    task: match as unknown as IeltsTask,
    reason,
    targetChunks: targetChunkTexts,
  };
}

/** Evaluate an IELTS attempt: score + transfer detection + error routing. */
export async function evaluateAttempt(input: {
  userId: number;
  taskId: number;
  mode: IeltsMode;
  responses: unknown; // user's answers/essay/transcript
  durationMinutes: number;
}): Promise<{
  attemptId: number;
  score: number | null;
  band: number | null;
  subSkillResults: { skill: string; correct: boolean; note: string }[];
  transferResults: { chunkId: number; text: string; status: "retrieved" | "produced" | "transferred" | "avoided" }[];
  strategyIssues: string[];
  languageErrors: string[];
}> {
  const [task] = await db.select().from(ieltsTasks).where(eq(ieltsTasks.id, input.taskId)).limit(1);
  if (!task) throw new Error("Task not found");

  const subSkillResults: { skill: string; correct: boolean; note: string }[] = [];
  const strategyIssues: string[] = [];
  const languageErrors: string[] = [];
  const transferResults: { chunkId: number; text: string; status: "retrieved" | "produced" | "transferred" | "avoided" }[] = [];

  let score: number | null = null;
  let band: number | null = null;

  const responses = input.responses as Record<string, unknown>;

  if (task.questions && Array.isArray(task.questions)) {
    // Objective task (listening/reading)
    let correct = 0;
    const total = task.questions.length;
    for (let i = 0; i < total; i++) {
      const q = task.questions[i];
      const userAnswer = String(responses[String(i)] ?? "");
      // tolerant compare: case/whitespace-insensitive; completion answers may carry
      // currency/parenthetical decoration ("(£) 115", "24(th) April", "2,020 kilometres")
      // and accepted variants (listening bank gold pages list slash alternatives)
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/(\d),(\d)/g, "$1$2")
          .replace(/[^a-z0-9 ]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const acceptable: string[] = Array.isArray(q.acceptable) ? q.acceptable : [];
      const isCorrect =
        norm(userAnswer) === norm(q.answer) || acceptable.some((a) => norm(a) === norm(userAnswer));
      if (isCorrect) correct++;
      subSkillResults.push({
        skill: q.subSkill,
        correct: isCorrect,
        note: isCorrect ? "" : `Expected: "${q.answer}", got: "${userAnswer || "(blank)"}"`,
      });
      if (!isCorrect && !userAnswer) {
        strategyIssues.push("Left question blank — possible time management issue");
      }
    }
    score = total ? Math.round((correct / total) * 100) : null;
    band = score != null ? Math.max(4, Math.min(9, 4 + (score / 100) * 4)) : null;
  } else {
    // Subjective task (speaking/writing) — mock evaluation
    const text = String(responses.text ?? responses.transcript ?? "");
    const words = text.trim().split(/\s+/).filter(Boolean).length;

    // Transfer detection: check which target chunks were used
    const userChunks = await db.select().from(chunks).where(eq(chunks.userId, input.userId));
    for (const c of userChunks) {
      const used = CHUNK_DETECT[c.text]?.test(text) ?? text.includes(c.text);
      if (used) {
        transferResults.push({ chunkId: c.id, text: c.text, status: "produced" });
        await logChunkEvent(input.userId, c.id, "ielts_use", text.slice(0, 200));
        await markChunkActivated(input.userId, c.id);
      }
    }

    // Mock band estimation
    if (task.skill === "writing") {
      const target = task.taskType === "writing_task2" ? 250 : 150;
      band = words >= target ? 6 : words >= target * 0.7 ? 5.5 : 5;
      if (words < target * 0.5) strategyIssues.push("Under word count — task response severely limited");
    } else if (task.skill === "speaking") {
      band = words >= 100 ? 6 : words >= 50 ? 5.5 : 5;
      if (words < 30) strategyIssues.push("Answer too short — develop ideas with reasons and examples");
    }
    score = band != null ? Math.round((band / 9) * 100) : null;

    subSkillResults.push({ skill: "overall", correct: (band ?? 5) >= 6, note: `Estimated band ${band}` });
  }

  // Strategy vs language error classification
  for (const r of subSkillResults) {
    if (!r.correct) {
      if (r.skill === "overall") continue; // band estimate ≠ a language error
      // A wrong objective answer is a question miss, not a language error —
      // the review system already re-surfaces missed questions.
      if (r.note.startsWith("Expected:")) {
        strategyIssues.push(`${r.skill}: ${r.note}`);
        continue;
      }
      if (r.skill.includes("paraphrase") || r.skill.includes("vocabulary")) {
        languageErrors.push(`${r.skill}: ${r.note}`);
      } else if (r.skill.includes("inference") || r.skill.includes("distractor")) {
        strategyIssues.push(`${r.skill}: ${r.note}`);
      } else {
        languageErrors.push(`${r.skill}: ${r.note}`);
      }
    }
  }

  // Save attempt
  const [attempt] = await db.insert(ieltsAttempts).values({
    userId: input.userId,
    taskId: input.taskId,
    mode: input.mode,
    responses: input.responses,
    score,
    band,
    subSkillResults,
    transferResults,
    strategyIssues,
    languageErrors,
    durationMinutes: input.durationMinutes,
  }).returning();

  // Route language errors to Error Bank
  for (const le of languageErrors.slice(0, 3)) {
    const [category, ...rest] = le.split(": ");
    await addError(input.userId, {
      category: "ielts_specific",
      wrongForm: rest.join(": ") || le,
      correctForm: "(see IELTS feedback)",
      explanation: `IELTS ${task.skill} sub-skill: ${category}`,
      source: "ai",
      sourceModule: "ielts",
      severity: "medium",
    });
  }

  // Update IELTS skill profile
  await updateIeltsSkillProfile(input.userId, task.skill as IeltsSkill, band, subSkillResults, strategyIssues);

  return {
    attemptId: attempt.id,
    score,
    band,
    subSkillResults,
    transferResults,
    strategyIssues,
    languageErrors,
  };
}

/** Update per-skill IELTS profile after an attempt. */
async function updateIeltsSkillProfile(
  userId: number,
  skill: IeltsSkill,
  band: number | null,
  subSkillResults: { skill: string; correct: boolean; note: string }[],
  strategyIssues: string[],
): Promise<void> {
  const [existing] = await db
    .select()
    .from(ieltsSkillProfiles)
    .where(and(eq(ieltsSkillProfiles.userId, userId), eq(ieltsSkillProfiles.skill, skill)))
    .limit(1);

  const sampleCount = (existing?.sampleCount ?? 0) + 1;
  const allAttempts = await db
    .select({ band: ieltsAttempts.band, taskId: ieltsAttempts.taskId })
    .from(ieltsAttempts)
    .where(eq(ieltsAttempts.userId, userId))
    .orderBy(desc(ieltsAttempts.createdAt))
    .limit(30);
  const taskRows = await db.select({ id: ieltsTasks.id, skill: ieltsTasks.skill }).from(ieltsTasks);
  const validBands = allAttempts
    .filter((a) => a.band != null && taskRows.find((t) => t.id === a.taskId)?.skill === skill)
    .map((a) => a.band as number);

  const avgBand = validBands.length ? validBands.reduce((a: number, b: number) => a + b, 0) / validBands.length : (band ?? 5.5);
  const range = sampleCount >= 10 ? 0.25 : sampleCount >= 3 ? 0.5 : 0.75;
  const confidence = sampleCount >= 10 ? "high" : sampleCount >= 3 ? "medium" : "low";

  // Update sub-skill scores
  const subScores = { ...(existing?.subSkillScores ?? {}) };
  for (const r of subSkillResults) {
    const prev = subScores[r.skill] ?? 50;
    subScores[r.skill] = Math.round(prev * 0.7 + (r.correct ? 100 : 0) * 0.3);
  }

  // Merge strategy issues
  const allStrategy = [...new Set([...(existing?.strategyIssues ?? []), ...strategyIssues])].slice(0, 5);

  if (existing) {
    await db.update(ieltsSkillProfiles).set({
      estimatedBand: avgBand,
      bandLow: avgBand - range,
      bandHigh: avgBand + range,
      confidence,
      sampleCount,
      subSkillScores: subScores,
      strategyIssues: allStrategy,
      lastAssessedAt: Date.now(),
    }).where(eq(ieltsSkillProfiles.id, existing.id));
  } else {
    await db.insert(ieltsSkillProfiles).values({
      userId,
      skill,
      estimatedBand: avgBand,
      bandLow: avgBand - range,
      bandHigh: avgBand + range,
      confidence,
      sampleCount,
      subSkillScores: subScores,
      strategyIssues: allStrategy,
      lastAssessedAt: Date.now(),
    });
  }
}

/** Band Gap Analysis: per-skill gap with strategy vs language diagnosis. */
export async function getBandGaps(userId: number, targetBand: number): Promise<BandGap[]> {
  const profiles = await db.select().from(ieltsSkillProfiles).where(eq(ieltsSkillProfiles.userId, userId));
  const skills: IeltsSkill[] = ["listening", "reading", "speaking", "writing"];

  return skills.map((skill) => {
    const p = profiles.find((x) => x.skill === skill);
    const current = p?.estimatedBand ?? null;

    if (current == null) {
      return { skill, current, target: targetBand, gap: targetBand, mainIssue: "No data yet — take an IELTS task", isStrategy: false, recommendation: "Complete a practice task in this skill" };
    }

    const gap = Math.round((targetBand - current) * 2) / 2;
    const profile = p as { subSkillScores?: Record<string, number>; strategyIssues?: string[] } | undefined;
    const weakestSub = Object.entries(profile?.subSkillScores ?? {}).sort((a, b) => a[1] - b[1])[0];
    const hasStrategyIssues = (profile?.strategyIssues ?? []).length > 0;

    const mainIssue = hasStrategyIssues
      ? (profile?.strategyIssues ?? [])[0] ?? "Test strategy issue"
      : weakestSub
        ? `${weakestSub[0].replace(/_/g, " ")} (${weakestSub[1]}/100)`
        : "General";

    const recommendation = hasStrategyIssues
      ? "Practice under timed conditions — the gap is strategy, not language"
      : gap > 0.5
        ? `Focus on ${weakestSub?.[0]?.replace(/_/g, " ") ?? "general"} — this is the main language limiter`
        : "Close to target — maintain current trajectory";

    return { skill, current, target: targetBand, gap, mainIssue, isStrategy: hasStrategyIssues, recommendation };
  });
}
