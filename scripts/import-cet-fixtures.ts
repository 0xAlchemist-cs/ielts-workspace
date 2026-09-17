/**
 * Import synthetic CET fixtures — CLEARLY LABELED synthetic_test, never official.
 * Official CET questions do NOT exist in this repo; these fixtures exist so the
 * engine, practice shell, readiness, and tests work end-to-end. Real official or
 * user-imported material can be added later with its own source label.
 * Run: npm run db:cetfixtures
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { cetTasks } from "../src/db/schema";

const PASSAGE = `Urban green spaces are increasingly recognized as essential infrastructure rather than decoration. Cities that invest in parks and tree-lined streets report lower summer temperatures and better public health outcomes. Researchers have found that residents living within a ten-minute walk of a park exercise more regularly and report lower stress levels. However, green space is distributed unevenly: wealthier districts often enjoy far more coverage than lower-income neighborhoods, raising questions about environmental justice. Some municipalities now require developers to include public green areas in new residential projects, while others experiment with rooftop gardens on public buildings.`;

const FIXTURES: {
  examProfile: "cet4" | "cet6";
  section: "writing" | "listening" | "reading" | "translation";
  taskType: string;
  prompt: string;
  content: string | null;
  questions: { question: string; options: string[]; answer: string }[] | null;
  referenceAnswer: string | null;
  durationMinutes: number;
}[] = [
  // ── CET-4 reading: careful reading (仔细阅读) ─────────────────────────────
  {
    examProfile: "cet4", section: "reading", taskType: "careful",
    prompt: "Read the passage and answer the questions.",
    content: PASSAGE,
    questions: [
      { question: "According to the passage, urban green spaces are now viewed as ____.", options: ["decoration", "essential infrastructure", "a luxury for the wealthy", "a source of pollution"], answer: "essential infrastructure" },
      { question: "What benefit is reported for residents near parks?", options: ["Higher incomes", "More regular exercise and lower stress", "Shorter commutes", "Better schools"], answer: "More regular exercise and lower stress" },
      { question: "What concern does the passage raise?", options: ["Green space is distributed unevenly", "Parks are too expensive to maintain", "Trees damage buildings", "Residents dislike parks"], answer: "Green space is distributed unevenly" },
    ],
    referenceAnswer: null, durationMinutes: 10,
  },
  // ── CET-4 listening: conversation (长对话) — transcript as content ────────
  {
    examProfile: "cet4", section: "listening", taskType: "conversation",
    prompt: "Listen to the conversation and answer the questions.",
    content: `M: Hi Sarah, I heard you just moved to a new apartment. How do you like it? W: I love it, especially the location. There's a big park right across the street, so I go jogging every morning. M: That sounds great. Is the rent reasonable? W: It's a bit higher than before, but I think the park and the shorter commute make it worth it.`,
    questions: [
      { question: "What does the woman do every morning?", options: ["She takes the bus", "She goes jogging in the park", "She works from home", "She visits her neighbor"], answer: "She goes jogging in the park" },
      { question: "How does the woman feel about the rent?", options: ["It's too expensive", "It's unreasonable", "It's worth it for the location", "She didn't mention it"], answer: "It's worth it for the location" },
    ],
    referenceAnswer: null, durationMinutes: 8,
  },
  // ── CET-4 writing: essay ─────────────────────────────────────────────────
  {
    examProfile: "cet4", section: "writing", taskType: "essay",
    prompt: "Directions: For this part, you are allowed 30 minutes to write an essay on the importance of urban green spaces. You should write at least 120 words but no more than 180 words.",
    content: null, questions: null, referenceAnswer: null, durationMinutes: 30,
  },
  // ── CET-4 translation: 段落汉译英 ───────────────────────────────────────
  {
    examProfile: "cet4", section: "translation", taskType: "passage_cn_to_en",
    prompt: "Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.\n\n近年来，越来越多的城市开始重视绿色空间的建设。公园和绿地不仅美化了城市环境，还为居民提供了锻炼和放松的场所。研究表明，居住在公园附近的人往往更加健康，生活压力也更小。因此，许多城市已经把增加绿地面积作为城市发展的重要目标。",
    content: null, questions: null,
    referenceAnswer: "In recent years, more and more cities have begun to attach importance to the development of green spaces. Parks and green areas not only beautify the urban environment but also provide residents with places to exercise and relax. Studies show that people living near parks tend to be healthier and experience less stress in their lives. Therefore, many cities have made increasing green space an important goal of urban development.",
    durationMinutes: 30,
  },
  // ── CET-6 reading: careful reading (longer/harder) ───────────────────────
  {
    examProfile: "cet6", section: "reading", taskType: "careful",
    prompt: "Read the passage and answer the questions.",
    content: `${PASSAGE}\n\nThe economic calculus is more contested than the health evidence. While property values near quality parks typically rise—a premium some researchers estimate at between five and twenty percent—critics argue that this very appreciation fuels gentrification, displacing precisely the lower-income residents the green spaces were meant to serve. The paradox has prompted urban planners to pair green investment with affordable-housing mandates, though enforcement remains inconsistent across jurisdictions.`,
    questions: [
      { question: "What paradox do urban planners face?", options: ["Parks cost too much to build", "Green investment can displace the residents it was meant to serve", "Residents oppose new parks", "Property values fall near parks"], answer: "Green investment can displace the residents it was meant to serve" },
      { question: "How have planners responded?", options: ["By abandoning green projects", "By pairing green investment with affordable-housing mandates", "By raising taxes", "By building fewer roads"], answer: "By pairing green investment with affordable-housing mandates" },
      { question: "What does the passage say about enforcement?", options: ["It is consistent", "It is inconsistent across jurisdictions", "It is impossible", "It is delegated to residents"], answer: "It is inconsistent across jurisdictions" },
    ],
    referenceAnswer: null, durationMinutes: 12,
  },
  // ── CET-6 listening: lecture (讲座) ──────────────────────────────────────
  {
    examProfile: "cet6", section: "listening", taskType: "lecture",
    prompt: "Listen to the lecture and answer the questions.",
    content: `Good morning. Today I want to challenge a common assumption about urban green space—namely, that its benefits are distributed equally. My research across twelve cities suggests the opposite. When a new park opens, property values in the surrounding blocks rise within eighteen months, and rising values attract higher-income residents. The original community, which often campaigned for the park, finds itself priced out. This phenomenon—sometimes called green gentrification—forces us to ask not simply whether cities should build green space, but for whom, and with what protections.`,
    questions: [
      { question: "What assumption does the lecturer challenge?", options: ["That parks are popular", "That green space benefits are distributed equally", "That cities need more parks", "That property values matter"], answer: "That green space benefits are distributed equally" },
      { question: "What happens within eighteen months of a new park opening?", options: ["Crime increases", "Property values rise", "Population declines", "Schools close"], answer: "Property values rise" },
      { question: "What term does the lecturer use?", options: ["Green expansion", "Green gentrification", "Urban sprawl", "Eco-justice"], answer: "Green gentrification" },
    ],
    referenceAnswer: null, durationMinutes: 10,
  },
  // ── CET-6 writing ────────────────────────────────────────────────────────
  {
    examProfile: "cet6", section: "writing", taskType: "essay",
    prompt: "Directions: For this part, you are allowed 30 minutes to write an essay on the question: should cities prioritize green space even when it risks displacing lower-income residents? You should give reasons for your answer and include relevant examples. Write at least 150 words but no more than 200 words.",
    content: null, questions: null, referenceAnswer: null, durationMinutes: 30,
  },
  // ── CET-6 translation ───────────────────────────────────────────────────
  {
    examProfile: "cet6", section: "translation", taskType: "passage_cn_to_en",
    prompt: "Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.\n\n随着城市化进程的加速，绿色空间的供需矛盾日益突出。一方面，城市土地资源稀缺，开发商倾向于将土地用于商业用途以获取更高的利润；另一方面，公众对宜居环境的需求不断提高，推动政府加大绿地建设的投入。如何在经济效益与公共利益之间取得平衡，已成为城市规划者面临的重要课题。一些城市通过立法确保新建项目必须配套公共绿地，这一做法值得借鉴。",
    content: null, questions: null,
    referenceAnswer: "With the acceleration of urbanization, the contradiction between the supply of and demand for green space has become increasingly prominent. On the one hand, urban land resources are scarce, and developers tend to devote land to commercial use in pursuit of higher profits. On the other hand, the public's growing demand for a livable environment has prompted governments to increase investment in green space construction. How to strike a balance between economic benefits and the public interest has become a major challenge facing urban planners. Some cities have ensured that new construction projects must include public green areas through legislation, a practice worth learning from.",
    durationMinutes: 30,
  },
];

async function main() {
  let inserted = 0;
  const existing = await db.select({ prompt: cetTasks.prompt }).from(cetTasks);
  const seen = new Set(existing.map((r) => r.prompt));
  for (const f of FIXTURES) {
    if (seen.has(f.prompt)) continue;
    await db.insert(cetTasks).values({
      ...f,
      difficulty: f.examProfile === "cet4" ? 3 : 4,
      topic: "urban-environment",
      source: "synthetic_test",
    });
    inserted++;
  }
  const counts = await db.select({ exam: cetTasks.examProfile, n: cetTasks.id }).from(cetTasks);
  console.log(`inserted ${inserted}; total cet_tasks rows: ${counts.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
