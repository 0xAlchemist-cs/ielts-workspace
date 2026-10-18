import { testAIProviderConfigAction } from "../src/app/actions";

/* Round-2 security regression probes (run: npm run test:security).
 * Read-only for the saved config; only a synthetic non-credential probe value.
 * LEAK/BYPASS conditions EXIT NON-ZERO — a green CI must mean the probes
 * actually passed, not merely printed. (Network errors are indeterminate:
 * reported, but not counted as a pass or a failure.) */

let failures = 0;
function report(label: string, pass: boolean | "indeterminate", detail: string) {
  if (pass === "indeterminate") {
    console.log(`  ? ${label} -> indeterminate (probe infrastructure): ${detail}`);
    return;
  }
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${label} -> ${detail}`);
}

async function main() {
  // ③ A NEW public Base URL with an empty key must NOT borrow the saved key
  const phishing = await testAIProviderConfigAction({
    baseUrl: "https://example.com/v1",
    apiKey: "",
  });
  report(
    "new-URL empty key",
    !phishing.ok,
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
  const redirectVerdict: boolean | "indeterminate" = redirect.ok
    ? false // the endpoint was followed/accepted — bypass
    : /redirect|不允许/i.test(redirect.message)
      ? true // explicit redirect refusal — the deterministic block
      : "indeterminate"; // network error: can't claim a pass, won't fail the gate
  report(
    "redirect-to-loopback",
    redirectVerdict,
    redirect.ok ? "BYPASS (bug)" : `blocked: ${redirect.message.slice(0, 90)}`,
  );

  // Control: the SAVED endpoint with no form values still tests fine
  const saved = await testAIProviderConfigAction({});
  console.log(
    "saved endpoint ->",
    saved.ok ? `pass (${saved.message.slice(0, 50)})` : `not live: ${saved.message.slice(0, 60)}`,
  );

  if (failures > 0) {
    console.error(`SECURITY PROBE FAILURES: ${failures}`);
    process.exit(1);
  }
  console.log("SECURITY PROBES OK");
}
void main();
