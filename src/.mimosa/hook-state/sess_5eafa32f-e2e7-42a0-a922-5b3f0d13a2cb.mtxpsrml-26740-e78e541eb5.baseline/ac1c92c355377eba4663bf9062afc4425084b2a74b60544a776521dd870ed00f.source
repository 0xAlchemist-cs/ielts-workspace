// ── Static content banks used by the mission planner and lab pages ──────────
// These are code constants rather than DB rows: they never change per user.

export const speakingPromptByChunk: Record<string, string> = {
  "it turns out (that)": "Tell me about a time when something turned out completely different from what you expected.",
  "be supposed to": "Tell me about something you were supposed to do but never did — and why.",
  "end up doing": "Tell me about something you had planned to do but ended up not doing.",
  "figure out": "Describe a problem that took you a long time to figure out. How did you finally solve it?",
  "catch up on": "Tell me about a period when you fell behind on something and had to catch up.",
  "as far as ... is concerned": "Some people say remote work makes teams less creative. As far as creativity is concerned, what do you think?",
  "when it comes to": "When it comes to learning English, what works best for you — and what doesn't?",
  "put off doing": "Tell me about a task you kept putting off. What happened in the end?",
  "be aware of": "Tell me about a habit you changed after becoming aware of it.",
  "come up with": "Describe a situation where you had to come up with an idea quickly.",
  "there is no denying (that)": "Is social media good for society? Start your answer with 'There is no denying that...'.",
  "take up": "Tell me about a hobby you took up — why did you start, and did you continue?",
  "run out of": "Tell me about a time you ran out of time, money or energy at the worst moment.",
  "cut down on": "Is there anything you've tried to cut down on? How successful were you?",
  "be worth doing": "Tell me about something difficult that turned out to be worth doing.",
  "get used to": "Tell me about a situation that felt strange at first but you gradually got used to.",
  "have an impact on": "Describe a decision that had a big impact on your life.",
  "play a role in": "How much does luck play a role in career success?",
  "get away with": "Tell me about someone who got away with something they shouldn't have.",
  "a double-edged sword": "Describe a technology you consider a double-edged sword, and explain both sides.",
  "keep up with": "How do you keep up with what's happening in the world?",
  "I've been meaning to": "Tell me about something you've been meaning to do for months but still haven't done.",
  "I was going to": "Tell me about a plan that failed: what were you going to do, and what happened instead?",
  "what matters is": "What matters more in learning a language — talent or consistency? Why?",
  "I was wondering if": "Role-play: politely ask your teacher for an extension using 'I was wondering if...'.",
  "be fully booked": "Role-play: call a restaurant, find it fully booked, and negotiate another time.",
  "see what I can do": "Role-play: ask a colleague for a favour and respond when they say 'I'll see what I can do'.",
  "stay up late": "Do you often stay up late? What for, and how does it affect you?",
  "without a second thought": "Tell me about something you would do again without a second thought.",
};

export const genericSpeakingPrompts: string[] = [
  "What did you do yesterday? Tell me as much detail as you can.",
  "Describe your typical weekday routine.",
  "Tell me about the last book, film or series you enjoyed.",
  "What's a skill you'd like to learn in the next five years, and why?",
  "Describe your hometown to someone who has never been there.",
  "What do you usually do to relax after a busy day?",
  "Tell me about a person who has influenced you.",
  "If you could change one thing about your daily routine, what would it be?",
];

export interface WritingTask {
  id: string;
  taskType: "task1" | "task2" | "general";
  prompt: string;
  hint: string;
}

export const writingTasks: WritingTask[] = [
  {
    id: "wt2-tech",
    taskType: "task2",
    prompt:
      "Many people think technology has improved our lives. To what extent do you agree or disagree? Write at least 250 words.",
    hint: "Try using: there is no denying that, have an impact on, a double-edged sword, when it comes to.",
  },
  {
    id: "wt2-work",
    taskType: "task2",
    prompt:
      "Some companies now allow employees to work from home most of the week. Do the advantages outweigh the disadvantages? Write at least 250 words.",
    hint: "Try using: as far as ... is concerned, play a role in, be worth doing, when it comes to.",
  },
  {
    id: "wt2-habits",
    taskType: "task2",
    prompt:
      "Many people find it difficult to change unhealthy habits. Why is this, and what can be done? Write at least 250 words.",
    hint: "Try using: be aware of, put off doing, come up with, there is no denying that.",
  },
  {
    id: "wt1-garden",
    taskType: "task1",
    prompt:
      "The table below shows the number of community gardens in five cities in 2010 and 2020. (Use your imagination to invent the data.) Summarise the information by selecting and reporting the main features. Write at least 150 words.",
    hint: "Try using: have an impact on, a significant increase, in contrast.",
  },
  {
    id: "wg-booking",
    taskType: "general",
    prompt:
      "You booked a hotel room, but when you arrived it was very different from the description. Write a letter to the hotel manager: describe the problems, explain how you felt, and say what you want the hotel to do.",
    hint: "Try using: I was wondering if, be supposed to, get away with.",
  },
];

export interface ParaphraseItem {
  id: string;
  source: string;
  sourceZh: string;
  models: string[];
  keyMoves: string[];
}

export const paraphraseBank: ParaphraseItem[] = [
  {
    id: "p1",
    source: "The hotel was very expensive.",
    sourceZh: "这家酒店非常贵。",
    models: ["The hotel cost a fortune.", "The hotel was far beyond my budget.", "It was much more expensive than I expected."],
    keyMoves: ["change the adjective+noun structure to a verb (cost)", "use an idiom (a fortune)", "shift to a comparison structure"],
  },
  {
    id: "p2",
    source: "Many people think technology is good.",
    sourceZh: "很多人认为科技是好的。",
    models: ["Many people believe that technological advancement has had a positive impact on society.", "It is widely believed that technology benefits society.", "Technology is often seen as a force for good."],
    keyMoves: ["think → believe / it is widely believed (passive)", "good → positive impact / a force for good (precision)", "technology → technological advancement (nominalisation)"],
  },
  {
    id: "p3",
    source: "I like reading books very much.",
    sourceZh: "我非常喜欢读书。",
    models: ["I'm really keen on reading.", "Reading is one of my favourite pastimes.", "I'm a passionate reader."],
    keyMoves: ["like ... very much → be keen on / be passionate about", "change the subject to the activity itself", "very much (Chinglish intensifier) → really / passionate"],
  },
  {
    id: "p4",
    source: "Pollution is a big problem in big cities.",
    sourceZh: "污染是大城市的一个大问题。",
    models: ["Pollution poses a serious challenge in major cities.", "Large cities struggle with significant levels of pollution.", "Pollution remains one of the most pressing issues facing major urban areas."],
    keyMoves: ["big problem → serious challenge / pressing issue (precision)", "big cities → major cities / urban areas (variety)", "be → pose / struggle with (verb upgrade)"],
  },
  {
    id: "p5",
    source: "More and more people use the internet to study.",
    sourceZh: "越来越多的人用互联网学习。",
    models: ["A growing number of people turn to the internet for learning.", "Online learning is becoming increasingly popular.", "The internet is increasingly used as a learning tool."],
    keyMoves: ["more and more → a growing number of / increasingly", "use ... to study → turn to ... for learning", "passive transformation"],
  },
  {
    id: "p6",
    source: "It is important to protect the environment.",
    sourceZh: "保护环境很重要。",
    models: ["Protecting the environment is of great importance.", "Environmental protection matters enormously.", "It is essential that we look after the environment."],
    keyMoves: ["important → of great importance / essential (formal variety)", "it-cleft → gerund subject", "protect → look after (phrasal variety)"],
  },
  {
    id: "p7",
    source: "The government should do something about traffic.",
    sourceZh: "政府应该为交通问题做点什么。",
    models: ["The government ought to take action on traffic congestion.", "Measures should be taken to tackle traffic problems.", "Urgent steps are needed to address traffic issues."],
    keyMoves: ["do something → take action / take measures (collocation)", "should → ought to (variety)", "passive + vague agent"],
  },
  {
    id: "p8",
    source: "Learning English takes a lot of time.",
    sourceZh: "学英语很花时间。",
    models: ["Learning English is a time-consuming process.", "Mastering English requires a significant investment of time.", "It takes considerable time and effort to learn English."],
    keyMoves: ["takes a lot of time → time-consuming (adjective)", "learning → mastering (precision)", "a lot of → considerable / significant (academic register)"],
  },
  {
    id: "p9",
    source: "She was tired, so she went to bed early.",
    sourceZh: "她累了，所以早早睡了。",
    models: ["Being tired, she went to bed early.", "She went to bed early because she was exhausted.", "Exhausted, she went to bed early."],
    keyMoves: ["so → because (subordinator flip)", "tired → exhausted (intensity)", "participle clause (Being tired, ...)"],
  },
  {
    id: "p10",
    source: "This essay will talk about the advantages of studying abroad.",
    sourceZh: "这篇文章将谈论出国留学的优点。",
    models: ["This essay will discuss the benefits of studying abroad.", "This essay examines the advantages of pursuing education overseas.", "This essay explores what makes studying abroad worthwhile."],
    keyMoves: ["talk about → discuss / examine / explore (academic verbs)", "advantages → benefits (synonym variety)", "studying abroad → pursuing education overseas (nominalisation)"],
  },
];

export interface CueCard {
  topic: string; // matches content topics for mission transfer
  cueCard: string;
  part3: string[];
}

export const cueCards: CueCard[] = [
  {
    topic: "work",
    cueCard: "Describe a job you would like to have in the future. You should say: what the job is, what it involves, why you would like to do it, and explain what you need to do to get it.",
    part3: ["Which is more important for a career: salary or enjoyment?", "How has technology changed the way people work?", "Do you think working from home will become the norm?"],
  },
  {
    topic: "psychology",
    cueCard: "Describe a habit you have tried to change. You should say: what the habit was, why you wanted to change it, how you tried to change it, and explain whether you succeeded.",
    part3: ["Why do people find it hard to change habits?", "Are bad habits always harmful?", "Should schools teach children how to build good habits?"],
  },
  {
    topic: "environment",
    cueCard: "Describe a place in your city that has changed in recent years. You should say: what the place is, how it has changed, why the change happened, and explain how you feel about it.",
    part3: ["Should cities have more green space?", "Who is responsible for protecting the environment: governments or individuals?", "Is urbanisation good for society?"],
  },
  {
    topic: "society",
    cueCard: "Describe something you bought that you now regret. You should say: what it was, why you bought it, why you regret it, and explain what you did with it.",
    part3: ["Why are people encouraged to buy more than they need?", "Does advertising make people unhappy?", "How could governments reduce waste?"],
  },
  {
    topic: "health",
    cueCard: "Describe something you do to stay healthy. You should say: what you do, when you started, how often you do it, and explain how it helps you.",
    part3: ["Why do many young people not get enough sleep?", "Should companies be responsible for employees' health?", "Is modern life making people less healthy?"],
  },
  {
    topic: "economy",
    cueCard: "Describe a service (an app, a platform or a shop) that you use often. You should say: what the service is, how you use it, why you chose it, and explain whether you would recommend it.",
    part3: ["Has the sharing economy changed how people own things?", "Are convenience and low prices always good for society?", "How might online platforms change jobs in the future?"],
  },
];

export const grammarWeaknessOptions = [
  "Tenses (past / present perfect)",
  "Third person -s",
  "Articles (a / the)",
  "Prepositions",
  "Conditional sentences",
  "Word order",
];

export const speakingWeaknessOptions = [
  "Fluency — long pauses",
  "Vocabulary — words don't come",
  "Pronunciation",
  "Grammar while speaking",
  "Fear of making mistakes",
];

export const listeningWeaknessOptions = [
  "Connected speech (gonna, linking)",
  "Speed of native speakers",
  "Vocabulary while listening",
  "Accents",
  "Losing focus after 1 minute",
];

export const shadowingSentences: string[] = [
  "I was going to go camping, but the weather looks bad.",
  "I've been meaning to check that out for ages!",
  "I was wondering if I could book a table for Saturday night.",
  "It turns out that most office jobs can be done from anywhere.",
  "When it comes to wildlife photography, you're sitting still for eleven hours.",
  "As far as equipment is concerned, the cheapest modern camera is good enough.",
];

// ── Active Reading Lab banks ────────────────────────────────────────────────

/** STEP 6 — Context transfer: rewrite the plain sentence using the chunk. */
export const transferByChunk: Record<string, string> = {
  "take up": "This sofa occupies too much space in my living room.",
  "end up doing": "In the end, we finally stayed at home and ordered pizza instead of going out.",
  "be supposed to": "The train's schedule said it would arrive at six, but it didn't.",
  "put off doing": "I postponed writing the report until Sunday night, as always.",
  "run out of": "I have no more patience with slow internet.",
  "cut down on": "I want to reduce the amount of coffee I drink.",
  "figure out": "I still haven't discovered how this machine works.",
  "come up with": "We need to think of a better name for the project.",
  "catch up on": "I need to compensate for all the sleep I lost this week.",
  "get used to": "After a month, driving on the left became normal for her.",
  "I've been meaning to": "I have wanted to call you for weeks, but I kept forgetting.",
  "I was going to": "My original plan was to study abroad, but it didn't happen.",
  "it turns out (that)": "Apparently, the restaurant we loved has closed down.",
  "have an impact on": "Smartphones strongly affect teenagers' sleep.",
  "be worth doing": "That museum deserves a second visit.",
  "keep up with": "He reads the news every day so he doesn't fall behind current events.",
  "when it comes to": "Regarding cooking, I'm completely hopeless.",
  "there is no denying (that)": "Nobody can deny that cities are getting noisier.",
};

/** STEP 8 — IELTS Part 3 style question per chunk. */
export const ieltsQuestionByChunk: Record<string, string> = {
  "take up": "Why do you think modern people find it hard to take up new hobbies?",
  "end up doing": "Describe something you planned carefully that didn't work out. Why do plans often end up changing?",
  "be supposed to": "Do you think rules that people are supposed to follow at work are always necessary? Why?",
  "put off doing": "Why do so many people put off important tasks until the last minute?",
  "run out of": "What should governments do when cities run out of space?",
  "cut down on": "Should governments encourage people to cut down on car use? How?",
  "figure out": "Why do some people figure out technology faster than others?",
  "come up with": "Which is more valued at work: experience, or the ability to come up with new ideas?",
  "catch up on": "Is it healthy to catch up on sleep at the weekend? Why or why not?",
  "get used to": "How long does it usually take people to get used to a new environment?",
  "I've been meaning to": "(Speaking naturally) Tell me about something you've been meaning to do for months. Why haven't you done it yet?",
  "it turns out (that)": "Tell me about a time when something turned out completely different from what you expected.",
  "have an impact on": "How has technology had an impact on the way young people communicate?",
  "when it comes to": "When it comes to learning languages, what matters more — talent or practice?",
  "there is no denying (that)": "There is no denying that online shopping has changed our lives. Is this change mostly positive?",
  "a double-edged sword": "Many technologies are double-edged swords. Discuss one example.",
  "get away with": "Why do some companies get away with polluting the environment?",
  "be aware of": "Are people today more aware of environmental problems than before? Why?",
  "stay up late": "Why do so many students stay up late before exams? Is it a good strategy?",
  "without a second thought": "What kind of purchases do people make without a second thought? Is this a problem?",
};

export function transferPromptFor(chunk: string): { sentence: string | null; instruction: string } {
  const sentence = transferByChunk[chunk] ?? null;
  return {
    sentence,
    instruction: sentence
      ? `Rewrite this sentence using "${chunk}" instead of the plain wording:`
      : `Write ONE new sentence about a completely different area of your life (not today's article) using "${chunk}".`,
  };
}

/** Targeted Writing: a natural essay prompt that IMPLIES the target chunks,
 *  never explicitly asking "use X". The learner should produce them because
 *  the topic demands it. */
export function targetedWritingPrompt(chunks: string[]): { prompt: string; hint: string } {
  // Map chunk themes to essay topics that naturally require those expressions
  const themes: Record<string, { topic: string; question: string; naturalChunks: string[] }> = {
    "have an impact on": { topic: "technology", question: "Many people believe that smartphones have had a significant impact on the way young people communicate. To what extent do you agree or disagree?", naturalChunks: ["have an impact on", "play a role in", "there is no denying"] },
    "play a role in": { topic: "education", question: "Some people think that teachers play a crucial role in motivating students, while others believe motivation comes from within. Discuss both views and give your opinion.", naturalChunks: ["play a role in", "when it comes to", "have an impact on"] },
    "there is no denying (that)": { topic: "environment", question: "There is growing concern about plastic pollution in the world's oceans. What are the main causes, and what solutions can you suggest?", naturalChunks: ["there is no denying", "have an impact on", "cut down on"] },
    "a double-edged sword": { topic: "technology", question: "Technology has made our lives easier in many ways, but it has also created new problems. Do the advantages outweigh the disadvantages?", naturalChunks: ["a double-edged sword", "have an impact on", "play a role in"] },
    "when it comes to": { topic: "work", question: "When it comes to choosing a career, some people prioritise salary while others value job satisfaction. Which do you think is more important?", naturalChunks: ["when it comes to", "as far as ... is concerned", "play a role in"] },
    "end up doing": { topic: "habits", question: "Many people start new hobbies or exercise programmes with good intentions but end up giving up within weeks. Why does this happen, and what can be done?", naturalChunks: ["end up doing", "put off doing", "be supposed to"] },
    "put off doing": { topic: "education", question: "Many students put off their assignments until the last minute. What are the causes of procrastination, and how can students overcome it?", naturalChunks: ["put off doing", "end up doing", "figure out"] },
    "be supposed to": { topic: "society", question: "In many countries, young adults are supposed to become independent by a certain age, but an increasing number still live with their parents. What are the reasons for this trend?", naturalChunks: ["be supposed to", "end up doing", "have an impact on"] },
    "run out of": { topic: "environment", question: "The world is running out of natural resources. What are the consequences of resource depletion, and what can individuals do to help?", naturalChunks: ["run out of", "cut down on", "have an impact on"] },
    "cut down on": { topic: "health", question: "Doctors recommend that people cut down on sugar and processed foods. Why is this difficult for many people, and what could governments do to encourage healthier eating?", naturalChunks: ["cut down on", "run out of", "have an impact on"] },
  };

  // Find the best-matching theme for the given chunks
  for (const chunk of chunks) {
    const theme = themes[chunk];
    if (theme) {
      return {
        prompt: theme.question,
        hint: `This topic naturally calls for expressions like: ${theme.naturalChunks.join(", ")}. Try to use at least two of them.`,
      };
    }
  }

  // Generic fallback that works with any chunk about trends/opinions
  return {
    prompt: `In today's world, many aspects of daily life are changing rapidly. What do you think are the most significant changes, and what impact have they had on society? Write at least 250 words.`,
    hint: `Your Retrieval Engine has selected these expressions for activation: ${chunks.join(", ")}. Find natural places to use them — the topic is broad enough to accommodate them.`,
  };
}

export function ieltsQuestionFor(chunk: string): string {
  return (
    ieltsQuestionByChunk[chunk] ??
    `Answer in IELTS Part 3 style with reasons and an example, using "${chunk}" naturally: is this becoming more common in modern life, and why?`
  );
}
