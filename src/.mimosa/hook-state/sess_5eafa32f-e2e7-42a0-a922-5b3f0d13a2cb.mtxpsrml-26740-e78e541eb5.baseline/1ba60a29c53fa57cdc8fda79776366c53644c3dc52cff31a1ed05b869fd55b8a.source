export const EXTERNAL_COACH_URL =
  "https://chatgpt.com/g/g-69064123ce508191a55e2aa3cf07e152-english-language-coach-for-ielts-speaking-test";

export interface ExternalCoach {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  recommendedFor: string;
  recommendedForZh: string;
  skill: "listening" | "speaking";
  url: string;
}

export const EXTERNAL_COACHES: ExternalCoach[] = [
  {
    id: "ielts-speaking",
    name: "IELTS Speaking Coach",
    nameZh: "雅思口语教练",
    description: "AI speaking practice with Part 1/2/3 questions, feedback, and follow-up.",
    descriptionZh: "AI 口语练习：Part 1/2/3 提问、反馈与追问。",
    recommendedFor: "Speaking Part 2 long turns, Part 3 abstract discussion, pronunciation feedback",
    recommendedForZh: "口语 Part 2 长篇独白、Part 3 抽象讨论、发音反馈",
    skill: "speaking",
    url: EXTERNAL_COACH_URL,
  },
  {
    id: "ielts-listening",
    name: "IELTS Listening Coach",
    nameZh: "雅思听力教练",
    description: "Active listening / spoken English training. Ask it to read passages aloud, explain connected speech, or practice dictation.",
    descriptionZh: "主动听力 / 口语英语训练。让它朗读文章、解释连读现象、练习听写。",
    recommendedFor: "Connected speech recognition, dictation practice, spoken form analysis",
    recommendedForZh: "连读辨认、听写练习、口语形态分析",
    skill: "listening",
    url: EXTERNAL_COACH_URL,
  },
];
