import { mockProvider } from "../src/lib/ai";
import { gradeChunkUsage } from "../src/lib/grading";
import type { RewriteTask } from "../src/lib/types";

/* Verifies the Error-Bank gate (mirrors src/app/api/ai/writing/route.ts):
 * (1) a rewrite task only banks when its `original` is a real quote from the
 * essay — filters mock template rows (statistics / unused-expression notices)
 * and hallucinated live quotes alike; (2) since the kind classification landed,
 * only kind="error" (or legacy kindless) rows bank — register/style/ambiguity
 * feedback is a preference, not a mistake.
 * Run: npx tsx scripts/verify-writing-gate.ts */

const ESSAY =
  "In the modern world, technology have changed everything. I very like my phone because it are useful and convenient for everyone who wants to study English well.";

/** the route's combined gate: real quote AND genuinely-wrong kind */
function wouldBank(task: Pick<RewriteTask, "original" | "kind">, text: string) {
  if (!task.original || !text.includes(task.original)) return false;
  if (task.kind && task.kind !== "error") return false;
  return true;
}

async function main() {
  const fb = await mockProvider.writing({ prompt: "Discuss technology.", text: ESSAY, targetChunks: ["take up"] });
  const tasks = fb.rewriteTasks ?? [];
  const banked = tasks.filter((t) => wouldBank(t, ESSAY));
  const filtered = tasks.filter((t) => !wouldBank(t, ESSAY));

  console.log("total mock rewriteTasks:", tasks.length);
  console.log("would bank (real quotes):", banked.map((t) => t.original));
  console.log("filtered out (non-quotes):", filtered.map((t) => t.original));

  // synthetic kind-classification probes (quoted originals, different kinds)
  const mk = (kind: RewriteTask["kind"], original: string): RewriteTask => ({
    id: 0, original, problem: "grammar", fix: "x", explanation: "x", hint: "x", kind,
  });
  const probes: [string, boolean][] = [
    ["error quoted → bank", wouldBank(mk("error", "I very like my phone"), ESSAY)],
    ["register quoted → skip", !wouldBank(mk("register", "I very like my phone"), ESSAY)],
    ["style quoted → skip", !wouldBank(mk("style", "it are useful"), ESSAY)],
    ["ambiguity quoted → skip", !wouldBank(mk("ambiguity", "it are useful"), ESSAY)],
    ["legacy kindless quoted → bank", wouldBank(mk(undefined, "technology have changed"), ESSAY)],
  ];
  for (const [label, pass] of probes) console.log(pass ? "  ✓" : "  ✗", label);

  // ── chunk-usage quality (P1-5 regression): a chunk produced inside an
  // AI-flagged erroneous span is usage evidence (3), never mastery (5) ─────
  const CLEAN =
    "Technology plays a key role in modern education because it helps students keep up with change every day.";
  const FLAWED =
    "Technology plays a key role in modern education, but it are not always good for young learners.";
  const usageProbes: [string, boolean][] = [
    ["clean usage → quality 5", gradeChunkUsage("play a role in", CLEAN, ["but it are not always good"]) === 5],
    ["chunk inside flagged error quote → quality 3 (no mastery credit)",
      gradeChunkUsage("play a role in", FLAWED, ["plays a key role in modern education, but it are"]) === 3],
    ["unrelated error doesn't taint a clean chunk",
      gradeChunkUsage("keep up with", CLEAN, ["plays a key role in modern education"]) === 5],
    ["chunk not in CHUNK_DETECT falls back to exact-match (flawed → 3)",
      gradeChunkUsage("beyond all reasonable doubt", "This proves the point beyond all reasonable doubt, isn't it?",
        ["beyond all reasonable doubt, isn't it"]) === 3],
    ["non-error (style) quotes are never passed by the route — clean stays 5",
      gradeChunkUsage("play a role in", CLEAN, []) === 5],
  ];
  for (const [label, pass] of usageProbes) console.log(pass ? "  ✓" : "  ✗", label);

  const ok =
    banked.length >= 1 &&
    filtered.some((t) => /average sentence|didn't use/i.test(t.original)) &&
    probes.every(([, pass]) => pass) &&
    usageProbes.every(([, pass]) => pass);
  console.log(ok ? "GATE OK — template rows filtered, kind gate holds, real errors banked" : "GATE FAIL");
  process.exit(ok ? 0 : 1);
}
void main();
