import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chunks as chunksT, contentHistory, contents, learningProfiles, retrievalItems, sentences as sentencesT, users } from "../src/db/schema";
import {
  contentFingerprint,
  markContentUsed,
  selectNextContent,
} from "../src/server/services/content-selection";
import { importContentAction } from "../src/app/actions";
import type { CEFR, ContentType, ItemLearningState } from "../src/lib/types";

/* ── Content Rotation / Fallback Engine — acceptance tests (self-cleaning) ──
 * Run: npx tsx scripts/verify-rotation.ts
 * Uses a temp user + temp contents; leaves the real library untouched. */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const BODY = (tag: string) =>
  `${tag} ${"The city council recently announced a new plan to improve public transport across the metropolitan area, promising faster journeys and cleaner vehicles within the next five years. ".repeat(6)}`;

async function main() {
  // ── setup: temp user + profile ────────────────────────────────────────────
  const [u] = await db.insert(users).values({ name: "rotation-verify", createdAt: Date.now() }).returning({ id: users.id });
  const userId = u.id;
  await db.insert(learningProfiles).values({ userId, cefr: "B2", createdAt: Date.now() });

  const mkContent = async (title: string, type: "reading" | "listening", cefr: string, topic = "city") => {
    const [row] = await db
      .insert(contents)
      .values({
        type: type as ContentType,
        title,
        topic,
        cefr: cefr as CEFR,
        difficulty: 3,
        ieltsRelevance: 4,
        body: BODY(title),
        minutes: 8,
        fingerprint: contentFingerprint(BODY(title)),
      })
      .returning({ id: contents.id });
    return row.id;
  };

  const readIds = await Promise.all(
    ["rot-a", "rot-b", "rot-c", "rot-d", "rot-e"].map((t) => mkContent(t, "reading", "B2")),
  );
  const listenIds = await Promise.all(
    ["rot-la", "rot-lb", "rot-lc"].map((t) => mkContent(t, "listening", "B2")),
  );
  const poolRead = { userId, skill: "reading" as const, restrictToIds: readIds };
  const pickAndUse = async () => {
    const sel = await selectNextContent(poolRead);
    if (!sel) return null;
    await markContentUsed(userId, sel.content.id);
    return sel.content.id;
  };

  // Test 1 — five successive picks rotate across all five, never stuck on one
  const picks: number[] = [];
  for (let i = 0; i < 5; i++) {
    const id = await pickAndUse();
    if (id) picks.push(id);
  }
  check("T1 five entries rotate A–E (no repeats)", new Set(picks).size === 5 && picks.length === 5, picks.join(","));

  // Test 2 — just-used content enters cooldown: next pick differs
  const last = picks[picks.length - 1];
  const next = await pickAndUse();
  check("T2 recently used content is skipped", next != null && next !== last, `last=${last} next=${next}`);

  // Test 3 — single-content pool: re-use allowed, never null
  const solo = await selectNextContent({ ...poolRead, restrictToIds: [last] });
  check("T3 single-content pool re-uses that content", solo?.content.id === last, `got ${solo?.content.id}`);

  // Test 4 — listening skill returns listening content
  const lis = await selectNextContent({ userId, skill: "listening", restrictToIds: listenIds });
  check("T4 listening request returns a listening content", lis?.content.type === "listening", lis?.content.title);

  // Test 5 — empty pool returns null → caller renders empty state (not blank)
  const none = await selectNextContent({ userId, skill: "listening", restrictToIds: [-1] });
  check("T5 empty pool → null (empty-state signal, never a fake pick)", none === null);

  // Test 6 — CEFR total mismatch still returns the closest content
  const c1Pool = await Promise.all([mkContent("rot-f", "reading", "C1"), mkContent("rot-g", "reading", "C1")]);
  const relaxed = await selectNextContent({ userId, skill: "reading", restrictToIds: c1Pool, cefr: "A2" });
  check("T6 CEFR mismatch relaxes to closest match", relaxed != null && c1Pool.includes(relaxed.content.id), relaxed?.content.title);

  // Test 7 — weak LanguageItems raise a content's priority
  const x = await mkContent("rot-x", "reading", "B2");
  const y = await mkContent("rot-y", "reading", "B2");
  for (let i = 0; i < 2; i++) {
    const [ch] = await db
      .insert(chunksT)
      .values({
        userId,
        text: `weak item ${i} ${x}`,
        meaningEn: "e",
        meaningZh: "z",
        sourceContentId: x,
      })
      .returning({ id: chunksT.id });
    await db.insert(retrievalItems).values({
      userId,
      itemType: "chunk",
      itemId: ch.id,
      learningState: {
        state: "usage",
        achievedAt: { usage: Date.now() },
        contexts: [],
        productionHits: 0,
        productionMisses: 0,
        contextualHits: 0,
        contextualMisses: 0,
      } satisfies ItemLearningState,
    });
  }
  const weakPick = await selectNextContent({ userId, skill: "reading", restrictToIds: [x, y] });
  check("T7 weak-retrieval content outranks equal fresh content", weakPick?.content.id === x, `picked ${weakPick?.content?.title} (score ${weakPick?.score}, ${weakPick?.reason})`);

  // Test 8 — deterministic: same state, same pick (refresh-stable)
  const s1 = await selectNextContent({ userId, skill: "reading", restrictToIds: [x, y] });
  const s2 = await selectNextContent({ userId, skill: "reading", restrictToIds: [x, y] });
  check("T8 selection is deterministic across repeated calls", s1?.content.id === s2?.content.id, `${s1?.content.id} vs ${s2?.content.id}`);

  // Test 9 — import dedup: same body never inserts twice
  const [existing] = await db.select({ id: contents.id }).from(contents).where(eq(contents.title, "rot-a")).limit(1);
  const before = (await db.select({ id: contents.id }).from(contents)).length;
  const dup = await importContentAction({ text: BODY("rot-a"), title: "dup attempt" });
  const after = (await db.select({ id: contents.id }).from(contents)).length;
  check("T9 duplicate import returns existing content, no new row", dup.ok && dup.duplicate === true && dup.id === existing.id && after === before, `dup=${JSON.stringify(dup)}`);

  // ── cleanup ───────────────────────────────────────────────────────────────
  const allTemp = [...readIds, ...listenIds, ...c1Pool, x, y];
  await db.delete(contentHistory).where(eq(contentHistory.userId, userId));
  await db.delete(retrievalItems).where(eq(retrievalItems.userId, userId));
  await db.delete(chunksT).where(eq(chunksT.userId, userId));
  await db.delete(sentencesT).where(inArray(sentencesT.contentId, allTemp));
  await db.delete(contents).where(inArray(contents.id, allTemp));
  await db.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  console.log(`\n${pass} passed, ${fail} failed (temp data cleaned)`);
  process.exit(fail === 0 ? 0 : 1);
}
void main();
