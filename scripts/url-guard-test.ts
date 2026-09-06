import { checkPublicHttpUrl } from "../src/lib/url-guard";

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
async function main() {
  for (const [raw, expectOk] of cases) {
    const r = await checkPublicHttpUrl(raw);
    const pass = r.ok === expectOk;
    if (!pass) fails++;
    console.log(pass ? "PASS" : "FAIL", raw, "->", r.ok ? r.url : r.error.slice(0, 60));
  }
  const dns = await checkPublicHttpUrl("https://www.baidu.com");
  console.log(dns.ok ? "PASS dns public" : "FAIL dns", dns.ok ? dns.url : dns.error);
  process.exit(fails === 0 && dns.ok ? 0 : 1);
}
void main();
