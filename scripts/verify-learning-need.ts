/** V10.1 Issue 1 — controlled experiment: does LEARNING NEED change article
 * ranking for same-CEFR learners? Isolated temp users + self-built candidate
 * contents; surgical cleanup; never touches real learner data or seed corpus.
 * Run: npm run test:need */
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, contents as contentsT, errors as errorsT, learningProfiles, retrievalItems, users } from "../src/db/schema";
import { selectNextContent } from "../src/server/services/content-selection";
import { ensureRetrievalItem } from "../src/server/services/retrieval";
import { pinActiveExam } from "./pin-exam";

const restoreExamFn: (() => Promise<void>) | null = null;

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

/* candidate bodies — matched length family, all B1-compatible, distinct signal */
const REASON_BODY = `Why people change careers. The reason is rarely money alone. Many switch because daily routines stop feeling meaningful. That's why engineers become teachers: they want visible impact. As a result of long commutes, office workers reshape their days. Due to remote work, boundaries blur; therefore people reconsider what they want. The explanation often lies in family. Since priorities shift after thirty, choices follow. Consequently, planning beats drifting: knowing why you act makes the next step easier. In other words, motivation survives when the purpose is clear.`;

const COMPARISON_BODY = `Two cities, two rhythms. Compared with London, Lisbon feels slower, whereas rents are far lower. On the one hand, big cities offer density; on the other hand, they cost calm. Similarly, Berlin and Madrid balance price and light differently. In contrast to Tokyo's silence, Seoul's cafes hum. The more options a city offers, the harder choosing becomes. Both places reward patience, though neither is cheaper than it looks. While salaries differ, the trade is time. Unlike vague dreams, a short list makes deciding simpler.`;

const NEUTRAL_BODY = `A quiet morning routine. Maria wakes at six and opens the curtains. She boils water, feeds the cat, and reads one page of a novel. The street below slowly fills with sound. By seven she writes three sentences in her notebook, then walks to the bakery on the corner. The baker knows her order. Small habits carry her through the seasons. In the evening she calls her sister and prepares tomorrow's clothes. Nothing about the day is unusual, and that is exactly its value.`;

const PREP_BODY = `A letter about a flat. Thank you for writing to me about the room. I am interested in renting it from the first of June. I will arrive at the station on Saturday and would like to look at the flat in the afternoon. Please reply to my email or call me at the number below. I look forward to hearing from you soon, and I am happy to provide references from my previous landlord without delay.`;

const ARTICLE_BODY = `Rules of a small library. A member may borrow up to six items at a time. The library keeps a copy of every title, and a member can reserve a book for two days. An overdue item costs ten pence a day. There is a reading room on the second floor; a visitor needs a ticket to enter. The staff issue tickets at the front desk each morning, and the desk also gives the information you need about events. The library closes at eight on weekdays.`;

async function mkUser(name: string, cefr: string): Promise<number> {
  const [u] = await db.insert(users).values({ name, examProfile: "ielts" }).returning();
  await db.insert(learningProfiles).values({ userId: u.id, cefr: cefr as "B1", immersionLevel: 1, dailyMinutes: 45 });
  return u.id;
}

async function mkContent(title: string, cefr: string, body: string): Promise<number> {
  const [c] = await db.insert(contentsT).values({
    type: "reading", title, topic: "experiment", cefr: cefr as "B1", difficulty: 3,
    body: `${body}\n\n${body}\n\n${body}`, minutes: 3, examProfile: "ielts",
  }).returning();
  return c.id;
}

async function mkWeakChunk(userId: number, text: string): Promise<void> {
  const [c] = await db.insert(chunksT).values({
    userId, text, meaningEn: `meaning of ${text}`, meaningZh: "实验用",
    examples: [`${text} — example sentence.`],
  }).returning();
  await ensureRetrievalItem(userId, "chunk", c.id);
  // push the ladder to mid-flight (retrieval) → counts as a live weak item
  await db.update(retrievalItems)
    .set({ learningState: { state: "retrieval", achievedAt: { exposure: 1, understanding: 1, recognition: 1, retrieval: 1 }, contexts: ["reading"], productionHits: 1, productionMisses: 0, contextualHits: 0, contextualMisses: 0 } })
    .where(eq(retrievalItems.itemId, c.id));
}

async function mkRecurringError(userId: number, wrong: string, correct: string): Promise<void> {
  const [e] = await db.insert(errorsT).values({
    userId, category: "preposition", wrongForm: wrong, correctForm: correct,
    explanation: "experiment", occurrenceCount: 3, status: "active",
  }).returning();
  await ensureRetrievalItem(userId, "error", e.id);
}

/** full ranking of a candidate set via successive exclusion (deterministic) */
async function rank(userId: number, ids: number[]): Promise<{ id: number; title: string; score: number; reason: string; reasonHuman: string }[]> {
  const out: { id: number; title: string; score: number; reason: string; reasonHuman: string }[] = [];
  let exclude: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const sel = await selectNextContent({ userId, skill: "reading", restrictToIds: ids, excludeContentIds: exclude });
    if (!sel) break;
    out.push({ id: sel.content.id, title: sel.content.title, score: sel.score, reason: sel.reason, reasonHuman: sel.reasonHuman.en });
    exclude = [...exclude, sel.content.id];
  }
  return out;
}

async function cleanup(userIds: number[], contentIds: number[]) {
  for (const uid of userIds) {
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, uid));
    await db.delete(chunksT).where(eq(chunksT.userId, uid));
    await db.delete(errorsT).where(eq(errorsT.userId, uid));
    await db.delete(learningProfiles).where(eq(learningProfiles.userId, uid));
    await db.delete(users).where(eq(users.id, uid));
  }
  if (contentIds.length) await db.delete(contentsT).where(inArray(contentsT.id, contentIds));
}

async function main() {
  const contentIds: number[] = [];
  const userIds: number[] = [];
  try {
    const cReason = await mkContent("Why People Change Careers", "B1", REASON_BODY);
    const cCompare = await mkContent("Two Cities Two Rhythms", "B1", COMPARISON_BODY);
    const cNeutral = await mkContent("A Quiet Morning Routine", "B1", NEUTRAL_BODY);
    const cPrep = await mkContent("A Letter About a Flat", "B1", PREP_BODY);
    const cArticle = await mkContent("Rules of a Small Library", "B1", ARTICLE_BODY);
    contentIds.push(cReason, cCompare, cNeutral, cPrep, cArticle);

    // ── Experiment A: same CEFR, different weak chunks ──────────────────────
    const la = await mkUser("__need_A__", "B1");
    const lb = await mkUser("__need_B__", "B1");
    userIds.push(la, lb);
    await mkWeakChunk(la, "as a result");
    await mkWeakChunk(la, "the reason is");
    await mkWeakChunk(lb, "in contrast");
    await mkWeakChunk(lb, "on the other hand");

    const poolABC = [cReason, cCompare, cNeutral];
    const rankA = await rank(la, poolABC);
    const rankB = await rank(lb, poolABC);
    console.log("\nExperiment A — Learner A (reason weakness):");
    rankA.forEach((r, i) => console.log(`  ${i + 1}. ${r.title} score=${r.score} reason="${r.reasonHuman}"`));
    console.log("Experiment A — Learner B (comparison weakness):");
    rankB.forEach((r, i) => console.log(`  ${i + 1}. ${r.title} score=${r.score} reason="${r.reasonHuman}"`));

    const scoreOf = (rs: typeof rankA, id: number) => rs.find((r) => r.id === id)?.score ?? 0;
    const A_reasonAdv = scoreOf(rankA, cReason) - scoreOf(rankA, cNeutral);
    const A_compareAdv = scoreOf(rankA, cCompare) - scoreOf(rankA, cNeutral);
    const B_reasonAdv = scoreOf(rankB, cReason) - scoreOf(rankB, cNeutral);
    const B_compareAdv = scoreOf(rankB, cCompare) - scoreOf(rankB, cNeutral);
    check("A: reason-weak learner prefers reason article", rankA[0]?.id === cReason, JSON.stringify(rankA.map((r) => r.title)));
    check("B: comparison-weak learner prefers comparison article", rankB[0]?.id === cCompare, JSON.stringify(rankB.map((r) => r.title)));
    check("A vs B: preference flips with the weakness", A_reasonAdv > A_compareAdv && B_compareAdv > B_reasonAdv,
      `A: reason+${A_reasonAdv.toFixed(3)} compare+${A_compareAdv.toFixed(3)}; B: reason+${B_reasonAdv.toFixed(3)} compare+${B_compareAdv.toFixed(3)}`);

    // ── Experiment B: same CEFR, different recurring error ──────────────────
    const le1 = await mkUser("__need_E1__", "B1");
    const le2 = await mkUser("__need_E2__", "B1");
    userIds.push(le1, le2);
    await mkRecurringError(le1, "arrive to", "arrive at"); // preposition pattern → PREP_BODY is dense with "at the station / at the number"
    await mkRecurringError(le2, "a information", "the information"); // article pattern → ARTICLE_BODY is article-dense
    const rankE1 = await rank(le1, [cPrep, cArticle, cNeutral]);
    const rankE2 = await rank(le2, [cPrep, cArticle, cNeutral]);
    console.log("\nExperiment B — preposition-error learner:", rankE1.map((r) => `${r.title}=${r.score}`).join(" > "));
    console.log("Experiment B — article-error learner:", rankE2.map((r) => `${r.title}=${r.score}`).join(" > "));
    const e1prepAdv = scoreOf(rankE1, cPrep) - scoreOf(rankE1, cArticle);
    const e2artAdv = scoreOf(rankE2, cArticle) - scoreOf(rankE2, cPrep);
    check("B: error relevance moves the ranking", (rankE1[0]?.id === cPrep || e1prepAdv > 0) && (rankE2[0]?.id === cArticle || e2artAdv > 0),
      `prep-learner prep-vs-article ${e1prepAdv.toFixed(3)}; article-learner article-vs-prep ${e2artAdv.toFixed(3)}`);

    // ── Experiment C: level + need together ─────────────────────────────────
    const cA2un = await mkContent("Simple Daily List A2", "A2", `I get up. I eat bread. I drink tea. The bus comes. ${NEUTRAL_BODY}`);
    const cB1un = cNeutral;
    const cB1rel = cReason;
    const cB2rel = await mkContent("Why Careers Shift B2", "B2", `${REASON_BODY} Consequently, whereas earlier generations stayed, today's workers therefore weigh meaning more heavily, and that is why the pattern repeats.`);
    const cC1rel = await mkContent("On Rethinking Work C1", "C1", `${REASON_BODY} Notwithstanding these considerations, the underlying rationale — and, by extension, the reason such transitions compound — therefore merits nuance.`);
    contentIds.push(cA2un, cB2rel, cC1rel);
    const lc = await mkUser("__need_C__", "B1");
    userIds.push(lc);
    await mkWeakChunk(lc, "as a result");
    const rankC = await rank(lc, [cA2un, cB1un, cB1rel, cB2rel, cC1rel]);
    console.log("\nExperiment C — B1 learner, mixed pool:", rankC.map((r, i) => `${i + 1}.${r.title}=${r.score}`).join(" "));
    check("C: B1-relevant beats B1-unrelated", scoreOf(rankC, cB1rel) > scoreOf(rankC, cB1un));
    check("C: ±1-level relevant stays usable (not buried, not auto-win)", scoreOf(rankC, cB2rel) > scoreOf(rankC, cA2un) && scoreOf(rankC, cC1rel) < scoreOf(rankC, cB1rel));

    // ── Experiment D (strongest control): remove the need ───────────────────
    const before = scoreOf(await rank(la, poolABC), cReason) - scoreOf(await rank(la, poolABC), cNeutral);
    await db.delete(retrievalItems).where(eq(retrievalItems.userId, la));
    await db.delete(chunksT).where(eq(chunksT.userId, la));
    const rankD = await rank(la, poolABC);
    const after = scoreOf(rankD, cReason) - scoreOf(rankD, cNeutral);
    console.log(`\nExperiment D — reason-article advantage: with need ${before.toFixed(3)} → without need ${after.toFixed(3)}`);
    check("D: advantage collapses when the need is removed", before - after > 0.01, `before=${before.toFixed(3)} after=${after.toFixed(3)}`);

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    await cleanup(userIds, contentIds);
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
