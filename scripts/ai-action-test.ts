import { testAIProviderConfigAction } from "../src/app/actions";

/* Direct action-level check of fix ②: an invalid form URL must error out,
 * never silently fall back to the saved config and report a pass.
 * Run: npx tsx scripts/ai-action-test.ts  (read-only for saved config;
 * does NOT call save/clear, and with an invalid URL no request is sent.) */

async function main() {
  const bad1 = await testAIProviderConfigAction({ baseUrl: "notaurl", apiKey: "sk-x" });
  console.log("notaurl      ->", bad1.ok ? "MISLEADING PASS (bug)" : `correctly rejected: ${bad1.message.slice(0, 70)}`);

  const bad2 = await testAIProviderConfigAction({ baseUrl: "http://127.0.0.1:3000", apiKey: "sk-x" });
  console.log("loopback     ->", bad2.ok ? "MISLEADING PASS (bug)" : `correctly rejected: ${bad2.message.slice(0, 70)}`);

  const bad3 = await testAIProviderConfigAction({ baseUrl: "http://169.254.169.254/latest", apiKey: "sk-x" });
  console.log("metadata IP  ->", bad3.ok ? "MISLEADING PASS (bug)" : `correctly rejected: ${bad3.message.slice(0, 70)}`);

  const ok = !bad1.ok && !bad2.ok && !bad3.ok;
  console.log(ok ? "ALL ACTION CHECKS PASS" : "ACTION CHECK FAILED");
  process.exit(ok ? 0 : 1);
}
void main();
