import { mockProvider } from "../src/lib/ai";

/* Verifies the Error-Bank gate: a rewrite task only banks when its `original`
 * is a real quote from the essay. Mock template rows (statistics / unused-
 * expression notices) must be filtered out; real error quotes must pass.
 * Run: npx tsx scripts/verify-writing-gate.ts */

const ESSAY =
  "In the modern world, technology have changed everything. I very like my phone because it are useful and convenient for everyone who wants to study English well.";

async function main() {
  const fb = await mockProvider.writing({ prompt: "Discuss technology.", text: ESSAY, targetChunks: ["take up"] });
  const tasks = fb.rewriteTasks ?? [];
  const passGate = (o: string) => !!o && ESSAY.includes(o);
  const banked = tasks.filter((t) => passGate(t.original));
  const filtered = tasks.filter((t) => !passGate(t.original));

  console.log("total mock rewriteTasks:", tasks.length);
  console.log("would bank (real quotes):", banked.map((t) => t.original));
  console.log("filtered out (non-quotes):", filtered.map((t) => t.original));

  const templateLeak = filtered.length === 0 || filtered.every((t) => !/average sentence|didn't use/i.test(t.original) === false);
  const ok =
    banked.length >= 1 &&
    filtered.some((t) => /average sentence|didn't use/i.test(t.original));
  console.log(ok ? "GATE OK — template rows filtered, real quotes banked" : "GATE FAIL");
  process.exit(ok ? 0 : 1);
}
void main();
