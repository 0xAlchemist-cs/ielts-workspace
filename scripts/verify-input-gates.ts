/** Input-gate regression: every POST route must answer malformed / wrong-type /
 *  oversized input with 400 — never a 500 — and pass well-formed input through.
 * Calls the route handlers directly (no HTTP server needed). Positive controls
 * use nonexistent ids so they terminate at a 404 without writing anything. */
import { POST as analyzePost } from "../src/app/api/content/analyze/route";
import { POST as reviewAnswerPost } from "../src/app/api/review/answer/route";
import { POST as ieltsTaskPost } from "../src/app/api/ielts/task/route";
import { POST as generationPost } from "../src/app/api/ai/generation/route";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

function req(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function status(fn: (r: Request) => Promise<Response>, body: unknown): Promise<number> {
  const res = await fn(req(body));
  return res.status;
}

const LONG = "x".repeat(30_000);
const validText =
  "Technology has changed the way people learn English because students can now access free resources " +
  "anywhere and practice speaking with partners around the world every single day without paying money.";

async function main() {
  // ── /api/content/analyze ─────────────────────────────────────────────────
  check("analyze: malformed JSON → 400", (await status(analyzePost, "{bad")) === 400);
  check("analyze: wrong type → 400", (await status(analyzePost, { text: 123 })) === 400);
  check("analyze: >20k chars → 400", (await status(analyzePost, { text: LONG })) === 400);
  const okAnalyze = await analyzePost(req({ text: validText }));
  const analyzeJson = (await okAnalyze.json()) as { wordCount?: number };
  check("analyze: valid text → 200", okAnalyze.status === 200 && (analyzeJson.wordCount ?? 0) > 0);

  // ── /api/review/answer ───────────────────────────────────────────────────
  check("review: malformed JSON → 400", (await status(reviewAnswerPost, "{bad")) === 400);
  check(
    "review: invalid mode → 400",
    (await status(reviewAnswerPost, { retrievalItemId: 999999, mode: "hack" })) === 400,
  );
  check(
    "review: response >2k chars → 400",
    (await status(reviewAnswerPost, { retrievalItemId: 999999, mode: "production", response: LONG })) === 400,
  );
  check(
    "review: well-formed unknown item → 404 (gate passed, no write)",
    (await status(reviewAnswerPost, { retrievalItemId: 999999, mode: "production", response: "ok" })) === 404,
  );

  // ── POST /api/ielts/task ─────────────────────────────────────────────────
  check("ielts: malformed JSON → 400", (await status(ieltsTaskPost, "{bad")) === 400);
  check("ielts: non-integer taskId → 400", (await status(ieltsTaskPost, { taskId: "abc" })) === 400);
  check(
    "ielts: array responses → 400",
    (await status(ieltsTaskPost, { taskId: 1, responses: ["a"] })) === 400,
  );
  check(
    "ielts: unknown task → 404 (gate passed, no write)",
    (await status(ieltsTaskPost, { taskId: 999999, responses: {} })) === 404,
  );

  // ── POST /api/ai/generation ──────────────────────────────────────────────
  check("generation: malformed JSON → 400", (await status(generationPost, "{bad")) === 400);
  check(
    "generation: sentence >2k → 400",
    (await status(generationPost, { chunkId: 1, sentence: LONG })) === 400,
  );
  check(
    "generation: unknown chunk → 404 (gate passed, no write)",
    (await status(generationPost, { chunkId: 999999, sentence: "I was going to travel but I stayed." })) === 404,
  );

  console.log(failed === 0 ? "\nINPUT GATES OK — all POST routes hardened" : `\n${failed} gate check(s) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
