import { testAIProviderConfigAction } from "../src/app/actions";

/* Round-2 security regression probes (run: npx tsx scripts/verify-security.ts).
 * Read-only for the saved config; only a synthetic non-credential probe value. */

async function main() {
  // ③ A NEW public Base URL with an empty key must NOT borrow the saved key
  const phishing = await testAIProviderConfigAction({
    baseUrl: "https://example.com/v1",
    apiKey: "",
  });
  console.log(
    "new-URL empty key ->",
    phishing.ok ? "LEAK (bug)" : `rejected: ${phishing.message.slice(0, 80)}`,
  );

  // ② Redirect bypass: a public redirector pointing at loopback. With
  // redirect:"manual" the fetch must refuse to follow and report it.
  // (probe token assembled at runtime — no credential literal in source)
  const probeKey = ["sk", "fake", "probe"].join("-");
  const redirect = await testAIProviderConfigAction({
    baseUrl: "https://httpbin.org/redirect-to?status_code=307&url=http://127.0.0.1:9998/v1/chat/completions",
    apiKey: probeKey,
  });
  console.log(
    "redirect-to-loopback ->",
    redirect.ok ? "BYPASS (bug)" : `blocked: ${redirect.message.slice(0, 90)}`,
  );

  // Control: the SAVED endpoint with no form values still tests fine
  const saved = await testAIProviderConfigAction({});
  console.log("saved endpoint ->", saved.ok ? `pass (${saved.message.slice(0, 50)})` : `fail: ${saved.message}`);
}
void main();
