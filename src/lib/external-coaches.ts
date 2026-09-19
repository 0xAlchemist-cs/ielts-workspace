export const EXTERNAL_COACH_URL =
  "https://chatgpt.com/g/g-69064123ce508191a55e2aa3cf07e152-english-language-coach-for-ielts-speaking-test";

/* V14.2: IELTSCB is where real-exam practice happens (the workspace imports
 * the reports). The reading-practice list URL is user-supplied (verified
 * live, HTTP 200); only the site root is used for anything else — deep links
 * are never invented. */
export const IELTSCB_URL = "https://www.ieltscb.com/";
export const IELTSCB_READING_URL = "https://www.ieltscb.com/ReadQuestion/listpage?classify=2";

export interface ExternalCoach {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  recommendedFor: string;
  recommendedForZh: string;
  /** "both" = one coach covering both skills (single GPT link) */
  skill: "listening" | "speaking" | "both";
  url: string;
}

/* One GPT link = one card. It used to be rendered as two coaches (speaking /
 * listening) pointing at the same URL — duplicated chrome, zero information. */
export const EXTERNAL_COACHES: ExternalCoach[] = [
  {
    id: "ielts-coach",
    name: "IELTS Speaking & Listening Coach",
    nameZh: "雅思口语·听力教练",
    description:
      "One AI coach for both skills: Part 1/2/3 speaking practice with feedback and follow-up, or ask it to read passages aloud, explain connected speech, and drill dictation.",
    descriptionZh:
      "一个 AI 教练覆盖两项：口语 Part 1/2/3 提问、反馈与追问；或让它朗读文章、讲解连读、练习听写。",
    recommendedFor:
      "Speaking Part 2 long turns · Part 3 discussion · pronunciation feedback · connected speech · dictation",
    recommendedForZh: "口语 Part 2 长独白 · Part 3 讨论 · 发音反馈 · 连读辨认 · 听写",
    skill: "both",
    url: EXTERNAL_COACH_URL,
  },
];
