import http from "node:http";
import { checkPublicHttpUrl, fetchPublicPage } from "../src/lib/url-guard";

/* One-shot verification of the SSRF guard (run: npx tsx scripts/url-guard-test.ts). */

const cases: Array<[string, boolean]> = [
  ["http://127.0.0.1:3000/v1", false], // loopback literal (tester's exact probe)
  ["http://localhost:9999/v1", false], // localhost name
  ["http://192.168.1.1/api", false], // private v4
  ["http://10.0.0.5/v1", false], // private v4
  ["http://172.16.0.1/v1", false], // private v4
  ["http://169.254.169.254/latest", false], // link-local metadata endpoint
  ["http://[::1]:8080/v1", false], // ipv6 loopback
  ["http://100.64.0.1/v1", false], // CGNAT
  ["http://240.0.0.1/v1", false], // reserved
  ["notaurl", false], // unparseable
  ["ftp://example.com/v1", false], // bad protocol
  ["https://open.bigmodel.cn/api/paas/v4", true], // real public endpoint (user's)
  ["https://api.openai.com/v1", true], // public
];

let fails = 0;
function report(name: string, pass: boolean, detail = "") {
  if (!pass) fails++;
  console.log(pass ? "PASS" : "FAIL", name, detail);
}

/** Deterministic offline tests for the article-fetch path: a local server on
 * 127.0.0.1 plays both "attacker redirector" and "honest page". The guard is
 * injectable so hop 1 can be simulated as already-validated — hop 2 must
 * still go through the REAL guard (per-hop re-validation, the redirect gap). */
async function fetchPageTests(): Promise<void> {
  const srv = http.createServer((req, res) => {
    const port = (srv.address() as { port: number }).port;
    if (req.url?.startsWith("/redirect")) {
      // attacker shape: public-looking page that 301s to a loopback target
      res.writeHead(301, { location: `http://127.0.0.1:${port}/target` });
      res.end();
    } else if (req.url?.startsWith("/loop")) {
      res.writeHead(301, { location: `http://127.0.0.1:${port}/loop` }); // never resolves
      res.end();
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>public article body</body></html>");
    }
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const port = (srv.address() as { port: number }).port;
  const firstUrl = `http://127.0.0.1:${port}/redirect`;
  try {
    // 1 · loopback literal — the real guard must block hop 1 outright
    const r1 = await fetchPublicPage(firstUrl);
    report("fetchPublicPage: loopback blocked before any fetch", r1.ok === false);

    // 2 · redirect re-validation — stub lets hop 1 pass, hop 2 (Location →
    //     127.0.0.1) must be re-checked by the real guard and rejected
    const stubGuard = (raw: string) =>
      raw === firstUrl ? Promise.resolve({ ok: true as const, url: raw }) : checkPublicHttpUrl(raw);
    const r2 = await fetchPublicPage(firstUrl, { guard: stubGuard });
    report("fetchPublicPage: redirect to internal address blocked at hop 2", r2.ok === false);

    // 3 · redirect cap — permissive guard, self-redirecting loop → cap error
    const allowAll = (raw: string) => Promise.resolve({ ok: true as const, url: raw });
    const r3 = await fetchPublicPage(`http://127.0.0.1:${port}/loop`, { guard: allowAll });
    report("fetchPublicPage: endless redirect chain capped", r3.ok === false);

    // 4 · happy path — validated 200 page returns its body
    const r4 = await fetchPublicPage(`http://127.0.0.1:${port}/page`, { guard: allowAll });
    report(
      "fetchPublicPage: guarded fetch returns body",
      r4.ok === true && r4.status === 200 && r4.text.includes("public article body"),
      JSON.stringify(r4.ok ? r4.status : r4.error),
    );
  } finally {
    srv.close();
  }
}

async function main() {
  for (const [raw, expectOk] of cases) {
    const r = await checkPublicHttpUrl(raw);
    report(raw + " -> " + (r.ok ? r.url : r.error.slice(0, 60)), r.ok === expectOk);
  }
  const dns = await checkPublicHttpUrl("https://www.baidu.com");
  report("dns public " + (dns.ok ? dns.url : dns.error), dns.ok);

  await fetchPageTests();
  process.exit(fails === 0 ? 0 : 1);
}
void main();
