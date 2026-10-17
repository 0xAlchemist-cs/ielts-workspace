import { decideFormat, advanceState, holisticStrength } from "../src/lib/retrieval-engine";
import type { ItemLearningState } from "../src/lib/types";

const fresh: ItemLearningState = {
  state: "exposure",
  achievedAt: {},
  contexts: [],
  productionHits: 0,
  productionMisses: 0,
  contextualHits: 0,
  contextualMisses: 0,
};

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
};

async function main() {
  console.log("── Retrieval Engine state ladder ──");

  // State 0: exposure → recognition
  const f1 = decideFormat("chunk", fresh);
  check("exposure → recognition", f1.mode === "recognition", f1.mode);

  // Advance to recognition
  const s1 = advanceState(fresh, f1, 5, "reading");
  check("state advances to recognition", s1.state === "recognition", s1.state);
  check("context 'reading' tracked", s1.contexts.includes("reading"));

  // State 2: recognition → cued_recall
  const f2 = decideFormat("chunk", s1);
  check("recognition → cued_recall", f2.mode === "cued_recall", f2.mode);

  const s2 = advanceState(s1, f2, 5, "review");
  check("state advances to retrieval", s2.state === "retrieval", s2.state);

  // State 3: retrieval → production or cloze (alternating)
  const f3 = decideFormat("chunk", s2);
  check("retrieval → production or cloze", ["production", "cloze"].includes(f3.mode), f3.mode);

  const s3 = advanceState(s2, f3, 5, "speaking");
  check("state advances to usage", s3.state === "usage", s3.state);
  check("context 'speaking' tracked", s3.contexts.includes("speaking"));

  // State 4: usage → context_transfer
  const f4 = decideFormat("chunk", s3);
  check("usage → context_transfer", f4.mode === "context_transfer", f4.mode);

  const s4 = advanceState(s3, f4, 5, "listening");
  check("state advances to transfer", s4.state === "transfer", s4.state);
  check("4 contexts tracked", s4.contexts.length === 4, `got ${s4.contexts.length}`);

  // State 5: transfer with cross-module → audio_retrieval
  const f5 = decideFormat("chunk", s4);
  check("transfer + cross-module → audio_retrieval", f5.mode === "audio_retrieval", f5.mode);

  const s5 = advanceState(s4, f5, 5, "ielts");
  check("state advances to retention", s5.state === "retention", s5.state);

  // State 6: retention → rotating formats
  const f6 = decideFormat("chunk", s5);
  check("retention → rotating format", ["production", "cloze", "audio_retrieval"].includes(f6.mode), f6.mode);

  // Failure demotes
  const sFail = advanceState(s3, f4, 0, "review");
  check("failure demotes from usage", sFail.state === "retrieval", sFail.state);

  // Partial quality keeps state
  const sPartial = advanceState(s3, f4, 3, "review");
  check("partial (quality=3) keeps usage", sPartial.state === "usage", sPartial.state);

  // Strength grows with state
  check("strength grows", holisticStrength(s5) > holisticStrength(s1), `${holisticStrength(s5)} > ${holisticStrength(s1)}`);

  // Error items always production
  const fErr = decideFormat("error", fresh);
  check("error always production", fErr.mode === "production", fErr.mode);

  console.log("── Retrieval grading: order matters (P1-6) ──");
  const { gradeRetrieval } = await import("../src/lib/grading");
  const T = { itemType: "chunk" as const, chunkText: "play a crucial role" };
  check(
    "scrambled tokens (role crucial play) → NOT quality 5",
    gradeRetrieval(T, "the role crucial play in society today").quality !== 5,
    `got ${gradeRetrieval(T, "the role crucial play in society today").quality}`,
  );
  check(
    "scrambled tokens still earn partial credit (3) — all pieces present",
    gradeRetrieval(T, "the role crucial play in society today").quality === 3,
  );
  check(
    "inflection + insertion in natural order → 5",
    gradeRetrieval(T, "technology has played a really crucial role in education").quality === 5,
  );
  check("exact production → 5", gradeRetrieval(T, "play a crucial role").quality === 5);
  check("partial coverage (2/3 tokens) → 3", gradeRetrieval(T, "play role").quality === 3);
  check("nothing relevant → 0", gradeRetrieval(T, "an unrelated sentence entirely").quality === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
main();
