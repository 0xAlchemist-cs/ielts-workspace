import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { chunkEvents, chunks as chunksT, errors as errorsT, reviewHistory, retrievalItems } from "@/db/schema";

/* ── Personal Learning Memory (V11) — derived, evidence-backed, human ───────
 * No new tables: everything computes from existing evidence on demand. Every
 * insight carries counted evidence (shown as human "Why?" text plus a hidden
 * developer explanation). Below-threshold evidence produces NO insight — an
 * honest empty state instead. Per-profile by construction (V8 user isolation). */

const DAY = 86_400_000;

export interface EvidenceRow {
  when: number;
  item: string;
  activity: { en: string; zh: string };
  result: { en: string; zh: string };
}

export interface Insight {
  key: string;
  title: { en: string; zh: string };
  desc: { en: string; zh: string };
  why: { en: string; zh: string }; // level-2 drill-down, counted
  evidence: EvidenceRow[]; // level-3, learner-friendly
  devExplanation: { evidence: string[]; confidence: number; updatedAt: number };
}

export interface MemoryPattern extends Insight {
  patternId: "writing_helps" | "fade_after_gap" | "recognise_not_produce";
}

export interface StrengthenedItem {
  text: string;
  note: { en: string; zh: string };
}

export interface TimelineEntry {
  when: number;
  text: { en: string; zh: string };
}

export interface LearningMemory {
  enoughEvidence: boolean;
  challenges: Insight[];
  improvements: Insight[];
  unstable: Insight[];
  patterns: MemoryPattern[];
  recentlyStrengthened: StrengthenedItem[];
  timeline: TimelineEntry[];
}

/* Category → human challenge labels (errors table categories) */
const CATEGORY_LABEL: Record<string, { en: string; zh: string }> = {
  preposition: { en: "Using prepositions accurately", zh: "准确使用介词" },
  grammar: { en: "Grammar accuracy", zh: "语法准确性" },
  vocabulary: { en: "Choosing the right word", zh: "选对词" },
  naturalness: { en: "Sounding natural", zh: "说得更自然" },
  chinese_english: { en: "Avoiding word-for-word Chinese", zh: "避免中式直译" },
  collocation: { en: "Words that go together", zh: "词语搭配" },
};

function mkInsight(
  key: string,
  title: { en: string; zh: string },
  desc: { en: string; zh: string },
  why: { en: string; zh: string },
  evidence: EvidenceRow[],
  confidence: number,
): Insight {
  return {
    key, title, desc, why, evidence,
    devExplanation: {
      evidence: evidence.slice(0, 8).map((e) => `${e.activity.en}: ${e.item} → ${e.result.en}`),
      confidence,
      updatedAt: Date.now(),
    },
  };
}

/** Build the learner-readable memory from real evidence. */
export async function buildLearningMemory(userId: number): Promise<LearningMemory> {
  const now = Date.now();
  const [items, history, errorRows, events, chunkTexts] = await Promise.all([
    db.select().from(retrievalItems).where(eq(retrievalItems.userId, userId)),
    db.select().from(reviewHistory).where(eq(reviewHistory.userId, userId)).orderBy(desc(reviewHistory.createdAt)).limit(500),
    db.select().from(errorsT).where(and(eq(errorsT.userId, userId), eq(errorsT.status, "active"))),
    db.select().from(chunkEvents).where(and(eq(chunkEvents.userId, userId), gte(chunkEvents.createdAt, now - 30 * DAY))),
    db.select({ id: chunksT.id, text: chunksT.text }).from(chunksT).where(eq(chunksT.userId, userId)),
  ]);

  const textById = new Map(chunkTexts.map((c) => [c.id, c.text]));
  const chunkItems = items.filter((i) => i.itemType === "chunk");
  const historyByItem = new Map<number, typeof history>();
  for (const h of history) {
    const arr = historyByItem.get(h.retrievalItemId) ?? [];
    arr.push(h);
    historyByItem.set(h.retrievalItemId, arr);
  }

  const totalAttempts = history.length + items.reduce((a, i) => a + 0, 0);
  const memory: LearningMemory = {
    enoughEvidence: history.length >= 6 || items.length >= 8,
    challenges: [],
    improvements: [],
    unstable: [],
    patterns: [],
    recentlyStrengthened: [],
    timeline: [],
  };
  if (!memory.enoughEvidence) return memory;

  /* ── Challenges ─────────────────────────────────────────────────────────── */
  // 1. recurring errors by category (occurrenceCount ≥ 2)
  const byCategory = new Map<string, { count: number; examples: typeof errorRows }>();
  for (const e of errorRows) {
    const c = byCategory.get(e.category) ?? { count: 0, examples: [] };
    c.count += e.occurrenceCount;
    c.examples.push(e);
    byCategory.set(e.category, c);
  }
  for (const [cat, agg] of [...byCategory.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 2)) {
    if (agg.count < 2) continue;
    const label = CATEGORY_LABEL[cat] ?? { en: `${cat} patterns`, zh: `${cat} 类问题` };
    memory.challenges.push(
      mkInsight(
        `challenge_${cat}`,
        label,
        { en: `This has come back ${agg.examples.length} time${agg.examples.length > 1 ? "s" : ""} in your practice.`, zh: `这在你的练习中出现过 ${agg.examples.length} 次。` },
        { en: `You've had ${agg.count} slips here across recent work — e.g. "${agg.examples[0].wrongForm}" → "${agg.examples[0].correctForm}".`, zh: `近期在这里共滑倒 ${agg.count} 次——例如 "${agg.examples[0].wrongForm}" → "${agg.examples[0].correctForm}"。` },
        agg.examples.slice(0, 4).map((e) => ({
          when: e.lastSeenAt ?? now,
          item: e.wrongForm,
          activity: { en: "writing/speaking correction", zh: "写作/口语纠错" },
          result: { en: `corrected to "${e.correctForm}" (×${e.occurrenceCount})`, zh: `已纠正为 "${e.correctForm}"（${e.occurrenceCount} 次）` },
        })),
        Math.min(0.95, 0.5 + agg.count * 0.1),
      ),
    );
  }

  // 2. production weakness across chunks (productionMisses > hits, ≥3 items)
  const productionWeak = chunkItems.filter((i) => {
    const ls = i.learningState;
    return ls && ls.productionMisses > ls.productionHits && ls.productionMisses >= 1;
  });
  if (productionWeak.length >= 3) {
    memory.challenges.push(
      mkInsight(
        "challenge_production",
        { en: "Producing expressions without hints", zh: "不用提示产出表达" },
        { en: "You usually recognise these when reading, but producing them yourself is harder.", zh: "阅读时你通常认得它们，但自己说出来/写出来更难。" },
        { en: `${productionWeak.length} expressions were recognised but not yet produced freely in recent attempts.`, zh: `近期有 ${productionWeak.length} 个表达你能认出，但还不能自由产出。` },
        productionWeak.slice(0, 4).map((i) => ({
          when: i.lastRetentionCheckAt ?? now,
          item: textById.get(i.itemId) ?? "expression",
          activity: { en: "recall without hints", zh: "无提示回忆" },
          result: { en: "not produced yet", zh: "尚未产出" },
        })),
        0.7,
      ),
    );
  }

  // 3. forgetting cluster
  const forgetting = items.filter((i) => i.forgettingDetected === 1);
  if (forgetting.length >= 2) {
    memory.challenges.push(
      mkInsight(
        "challenge_forgetting",
        { en: "Keeping expressions over time", zh: "让表达经得起时间" },
        { en: "Some expressions you knew are slipping after a break.", zh: "一些你本来会的表达，隔了一段时间开始滑走。" },
        { en: `${forgetting.length} previously-learned expressions failed after a gap and were brought back.`, zh: `${forgetting.length} 个之前学会的表达在间隔后遗忘，已被带回复习。` },
        forgetting.slice(0, 4).map((i) => ({
          when: i.lastRetentionCheckAt ?? now,
          item: textById.get(i.itemId) ?? "expression",
          activity: { en: "delayed recall", zh: "延迟回忆" },
          result: { en: "forgotten — rescheduled", zh: "遗忘——已重新排期" },
        })),
        0.8,
      ),
    );
  }
  memory.challenges = memory.challenges.slice(0, 4);

  /* ── Improvements (before/after windows, ≥3 attempts each side) ────────── */
  const cutoff = now - 14 * DAY;
  const early = history.filter((h) => h.createdAt < cutoff);
  const late = history.filter((h) => h.createdAt >= cutoff);
  if (early.length >= 3 && late.length >= 3) {
    const acc = (rows: typeof history) => rows.filter((h) => h.correct).length / rows.length;
    const before = acc(early);
    const after = acc(late);
    if (after - before >= 0.2) {
      memory.improvements.push(
        mkInsight(
          "improve_recall",
          { en: "Recalling without hints", zh: "无提示回忆" },
          { en: "Your recall is clearly stronger than it was two weeks ago.", zh: "比起两周前，你的回忆能力明显变强了。" },
          { en: `Earlier attempts: ${Math.round(before * 100)}% correct (${early.length}); recent: ${Math.round(after * 100)}% (${late.length}).`, zh: `早期正确率 ${Math.round(before * 100)}%（${early.length} 次）；近期 ${Math.round(after * 100)}%（${late.length} 次）。` },
          late.slice(0, 4).map((h) => ({
            when: h.createdAt,
            item: historyItemText(h, chunkItems, textById),
            activity: { en: "recall practice", zh: "回忆练习" },
            result: h.correct ? { en: "recalled", zh: "回忆成功" } : { en: "missed", zh: "未想起" },
          })),
          Math.min(0.95, 0.5 + (after - before)),
        ),
      );
    }
  }
  // errors recovering: ≥3 recent successful attempts on a previously-failing item
  for (const [itemId, rows] of historyByItem) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.itemType !== "error") continue;
    const recent3 = rows.slice(0, 3);
    if (recent3.length === 3 && recent3.every((h) => h.correct) && (item.failCount ?? 0) >= 2) {
      memory.improvements.push(
        mkInsight(
          `improve_error_${itemId}`,
          { en: "A mistake that's fading", zh: "一个正在消失的错误" },
          { en: `You've corrected this pattern three times in a row.`, zh: `这个错误你已经连续三次改对了。` },
          { en: `It failed ${item.failCount} times before; your last 3 attempts all succeeded.`, zh: `此前错了 ${item.failCount} 次；最近 3 次全对。` },
          recent3.map((h) => ({
            when: h.createdAt,
            item: textById.get(item.itemId) ?? "correction",
            activity: { en: "error re-test", zh: "错误重测" },
            result: { en: "correct", zh: "正确" },
          })),
          0.85,
        ),
      );
      break; // one representative is enough
    }
  }
  // retention reached
  const retained = chunkItems.filter((i) => i.learningState?.state === "retention");
  if (retained.length >= 2) {
    memory.improvements.push(
      mkInsight(
        "improve_retention",
        { en: "Remembering after many days", zh: "隔多天还记得" },
        { en: `${retained.length} expressions have survived long gaps — they're becoming yours.`, zh: `${retained.length} 个表达已扛过较长间隔——正在变成你的。` },
        { en: `They succeeded even when checked after a week or more.`, zh: `即使隔一周以上再测，它们也答对了。` },
        retained.slice(0, 4).map((i) => ({
          when: i.lastRetentionCheckAt ?? now,
          item: textById.get(i.itemId) ?? "expression",
          activity: { en: "long-gap check", zh: "长间隔检查" },
          result: { en: "still remembered", zh: "仍然记得" },
        })),
        0.8,
      ),
    );
  }
  memory.improvements = memory.improvements.slice(0, 4);

  /* ── Still unstable: improving population + forgetting overlap ─────────── */
  if (late.length >= 3 && forgetting.length >= 2) {
    memory.unstable.push(
      mkInsight(
        "unstable_overall",
        { en: "Getting better — but it still drops after days", zh: "在变好——但隔几天还会掉" },
        { en: "Recent practice is strong; a few older items still fade without a refresher.", zh: "近期练习很强；少数旧项不做巩固仍会褪色。" },
        { en: `${forgetting.length} items needed rescue after a gap, while your recent accuracy stays high.`, zh: `近期正确率保持高位的同时，${forgetting.length} 项在间隔后需要救援。` },
        forgetting.slice(0, 3).map((i) => ({
          when: i.lastRetentionCheckAt ?? now,
          item: textById.get(i.itemId) ?? "expression",
          activity: { en: "delayed recall", zh: "延迟回忆" },
          result: { en: "slipped, rescheduled", zh: "滑落，已重新排期" },
        })),
        0.75,
      ),
    );
  }

  /* ── Patterns (thresholds enforced; absent evidence → absent pattern) ──── */
  // P1: writing use followed by successful retrieval (≥3 distinct items)
  const writtenThenOk: number[] = [];
  for (const ev of events) {
    if (ev.type !== "generation_pass" && ev.type !== "ielts_use") continue;
    const item = chunkItems.find((i) => i.itemId === ev.chunkId);
    if (!item) continue;
    const later = historyByItem
      .get(item.id)
      ?.some((h) => h.createdAt > ev.createdAt && h.createdAt < ev.createdAt + 7 * DAY && h.correct);
    if (later) writtenThenOk.push(item.id);
  }
  if (new Set(writtenThenOk).size >= 3) {
    memory.patterns.push({
      ...mkInsight(
        "pattern_writing_helps",
        { en: "Writing helps them stick", zh: "写一遍更牢" },
        { en: "Expressions you've used in your own writing tend to come back to you later.", zh: "你自己在写作里用过的表达，之后更容易想起来。" },
        { en: `${new Set(writtenThenOk).size} expressions were used in your writing and later recalled successfully.`, zh: `${new Set(writtenThenOk).size} 个表达在你的写作中用过，之后都成功回忆。` },
        [],
        0.75,
      ),
      patternId: "writing_helps",
    });
  }

  // P2: early success → fail after ≥7d gap (≥3 items)
  const fadeItems = chunkItems.filter((i) => {
    const rows = historyByItem.get(i.id) ?? [];
    if (rows.length < 2) return false;
    const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt);
    const earlyOk = sorted.find((h) => h.correct);
    if (!earlyOk) return false;
    return sorted.some((h) => !h.correct && h.createdAt - earlyOk.createdAt >= 7 * DAY);
  });
  if (fadeItems.length >= 3) {
    memory.patterns.push({
      ...mkInsight(
        "pattern_fade_after_gap",
        { en: "Needs one more review after a break", zh: "隔段需要再过一遍" },
        { en: "You often learn things quickly, then need another pass a week or two later.", zh: "你常学得快，但一两周后需要再过一遍。" },
        { en: `${fadeItems.length} expressions succeeded at first, then slipped after a week or more.`, zh: `${fadeItems.length} 个表达起初成功，一周以上后滑落。` },
        fadeItems.slice(0, 3).map((i) => ({
          when: now,
          item: textById.get(i.itemId) ?? "expression",
          activity: { en: "learned → gap → re-test", zh: "学会 → 间隔 → 重测" },
          result: { en: "slipped after the gap", zh: "间隔后滑落" },
        })),
        0.75,
      ),
      patternId: "fade_after_gap",
    });
  }

  // P3: recognise-but-not-produce (≥5 items, recognition ≥60% & production ≤40%)
  const recRows = history.filter((h) => h.mode === "recognition");
  const prodRows = history.filter((h) => h.mode === "production" || h.mode === "cued_recall");
  if (recRows.length >= 5 && prodRows.length >= 5) {
    const recOk = recRows.filter((h) => h.correct).length / recRows.length;
    const prodOk = prodRows.filter((h) => h.correct).length / prodRows.length;
    if (recOk >= 0.6 && prodOk <= 0.4) {
      memory.patterns.push({
        ...mkInsight(
          "pattern_recognise_not_produce",
          { en: "You recognise more than you can produce", zh: "认得出，还产不出" },
          { en: "In context you understand these expressions; producing them freely is the next step.", zh: "在语境里你看得懂；自由产出它们是下一步。" },
          { en: `Recognition attempts: ${Math.round(recOk * 100)}% correct; production attempts: ${Math.round(prodOk * 100)}%.`, zh: `再认正确率 ${Math.round(recOk * 100)}%；产出正确率 ${Math.round(prodOk * 100)}%。` },
          [],
          0.7,
        ),
        patternId: "recognise_not_produce",
      });
    }
  }

  /* ── Recently strengthened (last 7 days) ─────────────────────────────────── */
  const recentOk = new Map<number, number>();
  for (const h of history) {
    if (h.createdAt < now - 7 * DAY || !h.correct) continue;
    recentOk.set(h.retrievalItemId, (recentOk.get(h.retrievalItemId) ?? 0) + 1);
  }
  memory.recentlyStrengthened = [...recentOk.entries()]
    .filter(([id]) => (historyByItem.get(id)?.length ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => {
      const item = items.find((i) => i.id === id);
      const text = item ? textById.get(item.itemId) : undefined;
      if (!text) return null;
      const contexts = item?.learningState?.contexts ?? [];
      return {
        text,
        note:
          contexts.length >= 2
            ? { en: `Used in ${contexts.join(" + ")}.`, zh: `在 ${contexts.join(" + ")} 中用过。` }
            : { en: `Recalled successfully ${n} time${n > 1 ? "s" : ""}.`, zh: `成功回忆 ${n} 次。` },
      };
    })
    .filter((x): x is StrengthenedItem => x !== null);

  /* ── Timeline: meaningful changes this week (story, not clicks) ────────── */
  const weekAgo = now - 7 * DAY;
  const learnedThisWeek = chunkTexts.filter((c) => {
    const item = chunkItems.find((i) => i.itemId === c.id);
    return item && item.createdAt >= weekAgo;
  });
  const recalledThisWeek = [...recentOk.values()].reduce((a, b) => a + b, 0);
  const rescuedThisWeek = forgetting.filter((i) => (i.lastRetentionCheckAt ?? 0) >= weekAgo).length;
  if (learnedThisWeek.length > 0) {
    memory.timeline.push({
      when: now,
      text: { en: `You learned ${learnedThisWeek.length} new expression${learnedThisWeek.length > 1 ? "s" : ""} this week.`, zh: `本周学了 ${learnedThisWeek.length} 个新表达。` },
    });
  }
  if (recalledThisWeek > 0) {
    memory.timeline.push({
      when: now - 1,
      text: { en: `${recalledThisWeek} recall${recalledThisWeek > 1 ? "s" : ""} came back successfully.`, zh: `${recalledThisWeek} 次回忆成功带回。` },
    });
  }
  if (rescuedThisWeek > 0) {
    memory.timeline.push({
      when: now - 2,
      text: { en: `${rescuedThisWeek} older expression${rescuedThisWeek > 1 ? "s" : ""} faded and were brought back for review.`, zh: `${rescuedThisWeek} 个旧表达褪色，已带回复习。` },
    });
  }

  return memory;
}

function historyItemText(h: { retrievalItemId: number }, chunkItems: { id: number; itemId: number }[], textById: Map<number, string>): string {
  const item = chunkItems.find((i) => i.id === h.retrievalItemId);
  return (item && textById.get(item.itemId)) ?? "expression";
}
