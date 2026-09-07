import { db } from "../src/db";
import { contents } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { isReadableContent } from "../src/server/services/content-selection";

/* ── Topic reclassification ──────────────────────────────────────────────────
 * The topic column mixed SOURCES ("cambridge reading", "worksheet") with
 * SUBJECTS. Learners filter by subject: education, environment, technology…
 * This script classifies every readable content into IELTS-frequent topics
 * via title-weighted + body keyword scoring. Idempotent — safe to re-run.
 * Run: npx tsx scripts/reclassify-topics.ts */

const TOPIC_KEYWORDS: Record<string, string[]> = {
  education: ["school", "student", "universit", "college", "course", "teach", "educat", "campus", "lecture", "tutorial", "exam", "academic", "tuition", "graduate", "scholar", "curriculum", "classroom", "study"],
  environment: ["environment", "climate", "carbon", "pollut", "recycl", "ecolog", "wildlife", "forest", "species", "conserv", "energy", "sustainab", "emission", "warming", "endangered", "habitat"],
  technology: ["technolog", "computer", "internet", "digital", "software", "robot", "artificial intelligence", "online", "innovat", "device", "smartphone", "automat", "machine", "cyber", "app "],
  health: ["health", "disease", "medic", "doctor", "patient", "diet", "nutrition", "exercis", "fitness", "mental", "stress", "sleep", "obes", "smok", "hospital", "wellbeing", "well-being", "sugar", "addiction"],
  society: ["societ", "social", "community", "urban", "city", "population", "crime", "law", "government", "policy", "public", "citizen", "inequal", "poverty", "homeless", "volunteer"],
  "work & career": ["job", "career", "employ", "workplace", "office", "profession", "manager", "interview", "salary", "colleague", "boss", "worker"],
  "business & economy": ["econom", "market", "trade", "business", "industr", "compan", "finance", "money", "consumer", "advertis", "commercial", "growth", "retail", "customer", "profit"],
  "science & nature": ["research", "scientist", "experiment", "discover", "physics", "chemistry", "biology", "geolog", "astronom", "fossil", "animal", "marine", "insect", "plant", "bird", "evolution", "specimen", "laboratory"],
  "culture & history": ["histor", "ancient", "culture", "museum", "artist", "painting", "music", "literat", "tradit", "archaeolog", "civilis", "civiliz", "heritage", "empire", "medieval", "festival"],
  travel: ["travel", "tourism", "tourist", "journey", "transport", "airport", "flight", "hotel", "holiday", "visit", "excursion", "railway", "train"],
  "daily life": ["shopping", "rent", "apartment", "household", "restaurant", "family", "friend", "hobby", "leisure", "weather", "appointment", "booking", "enquir", "neighbour", "neighbor", "weekend"],
};

//体裁类：写作素材整组归 writing
const GENRE_TOPICS: Array<[RegExp, string]> = [
  [/worksheet|essay|paraphrase|writing ideas/i, "writing"],
  [/spoken english/i, "daily life"],
];

function classify(title: string, body: string): string {
  const t = title.toLowerCase();
  for (const [re, topic] of GENRE_TOPICS) if (re.test(t)) return topic;

  const scores = new Map<string, number>();
  const bump = (topic: string, n: number) => scores.set(topic, (scores.get(topic) ?? 0) + n);
  // word-boundary regex — substring matching let "art" hit every "Part 1"
  const re = (kw: string) => new RegExp(`\\b${kw}\\w*`, "i");
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (re(kw).test(t)) bump(topic, 3); // title match weighs heavily
    }
  }
  if (scores.size === 0) {
    // body scan on a bounded slice — listening dialogues and untitled passages
    const b = body.slice(0, 4000).toLowerCase();
    for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
      for (const kw of kws) {
        const r = re(kw);
        const hits = Math.min(4, (b.match(new RegExp(r.source, "gi")) ?? []).length);
        if (hits > 0) bump(topic, hits);
      }
    }
  }
  if (scores.size === 0) return "general";
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function main() {
  const rows = await db.select().from(contents);
  const changes: Array<{ id: number; title: string; from: string; to: string }> = [];
  for (const c of rows) {
    const next = isReadableContent(c) ? classify(c.title, c.body) : "archive";
    if (next !== c.topic) {
      changes.push({ id: c.id, title: c.title.slice(0, 44), from: c.topic, to: next });
      await db.update(contents).set({ topic: next }).where(eq(contents.id, c.id));
    }
  }
  console.log(`reclassified ${changes.length}/${rows.length} contents`);
  const dist = new Map<string, number>();
  for (const c of await db.select({ topic: contents.topic }).from(contents)) {
    dist.set(c.topic, (dist.get(c.topic) ?? 0) + 1);
  }
  console.log("new distribution:", [...dist.entries()].sort((a, b) => b[1] - a[1]));
  process.exit(0);
}
void main();
