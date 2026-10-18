import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/** Server-side fetch guard for user-supplied URLs: only public http(s)
 * endpoints. Rejects localhost/loopback/private/link-local/CGNAT/reserved
 * addresses — both as literal hostnames and as DNS resolution results. */

const INVALID =
  "Base URL must be a valid public http(s) address — internal or loopback hosts are not allowed（必须是可公网访问的 http(s) 地址，不支持内网/本机地址）";

function isPrivateV4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast (224/4), reserved (240/4), broadcast
  return false;
}

/** Expand an IPv6 address (with "::" compression) into its 8 groups.
 * Returns null for anything that is not well-formed hex groups — callers
 * fail CLOSED on null. */
function expandV6(h: string): number[] | null {
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string): number[] | null => {
    if (!s) return [];
    const parts = s.split(":");
    for (const p of parts) if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
    return parts.map((p) => parseInt(p, 16));
  };
  const left = parse(halves[0]);
  const right = halves.length === 2 ? parse(halves[1]) : [];
  if (left === null || right === null) return null;
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  if (halves.length === 1 && left.length !== 8) return null;
  return [...left, ...Array<number>(halves.length === 2 ? fill : 0).fill(0), ...right];
}

function isPrivateV6(ip: string): boolean {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::") return true; // loopback, unspecified
  const dotted = h.match(/(\d+\.\d+\.\d+\.\d+)$/); // ::ffff:10.0.0.1 written dotted
  if (dotted) return isPrivateV4(dotted[1]);
  const groups = expandV6(h);
  if (!groups) return true; // unparseable → fail closed
  // IPv4-mapped ::ffff:0:0/96 — the URL parser normalizes the dotted form to
  // HEX groups (::ffff:7f00:1 == ::ffff:127.0.0.1), so decode both shapes
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return isPrivateV4(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
  }
  if (groups[0] === 0) return true; // ::/8 — unspecified, full-form loopback, v4-compatible
  const head = groups[0];
  if (head >= 0xfc00 && head <= 0xfdff) return true; // ULA fc00::/7
  if (head >= 0xfe80 && head <= 0xfebf) return true; // link-local fe80::/10
  if (head >= 0xff00) return true; // multicast ff00::/8
  return false;
}

function hostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  const kind = isIP(h);
  if (kind === 4) return isPrivateV4(h);
  if (kind === 6) return isPrivateV6(h);
  return false; // plain domain — checked via DNS below
}

/** Address classification, exported for regression tests: any literal IPv4 or
 * IPv6 (dotted- or hex-mapped, compressed or full form) resolves to its true
 * public/private status without relying on resolver side effects. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip.replace(/^\[|\]$/g, ""));
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) return isPrivateV6(ip);
  return true; // not an IP literal → callers treat as domain; tests fail closed
}

export async function checkPublicHttpUrl(
  raw: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: INVALID };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: INVALID };
  if (u.username || u.password) return { ok: false, error: INVALID };
  // classify on the UNBRACKETED host: a literal IPv6 (mapped/full form) is
  // an IP, not a domain — blocking must come from the address classes, never
  // from a resolver quirk
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostnameBlocked(host)) return { ok: false, error: INVALID };
  if (isIP(host) === 0) {
    try {
      const addrs = await lookup(u.hostname, { all: true });
      if (addrs.length === 0 || addrs.some((a) => hostnameBlocked(a.address))) {
        return { ok: false, error: INVALID };
      }
    } catch {
      return { ok: false, error: `Cannot resolve host 无法解析域名: ${u.hostname}` };
    }
  }
  return { ok: true, url: u.toString().replace(/\/+$/, "") };
}

/** Guard signature (injectable so tests can simulate an already-validated
 * first hop and prove every REDIRECT hop goes back through the real check). */
export type PublicUrlGuard = typeof checkPublicHttpUrl;

const MAX_REDIRECT_HOPS = 5;
const MAX_BODY_CHARS = 5 * 1024 * 1024;

/** Fetch a user-supplied page the safe way: every URL — the initial one AND
 * each redirect hop — passes checkPublicHttpUrl (DNS re-resolution included)
 * before any request is made. Redirects are followed manually (never by the
 * fetch runtime, which would skip the guard), capped at 5 hops; the body read
 * is capped so a hostile page cannot exhaust memory. */
export async function fetchPublicPage(
  raw: string,
  opts: { guard?: PublicUrlGuard; headers?: Record<string, string> } = {},
): Promise<{ ok: true; url: string; status: number; text: string } | { ok: false; error: string }> {
  const guard = opts.guard ?? checkPublicHttpUrl;
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const check = await guard(current);
    if (!check.ok) return { ok: false, error: check.error };
    let res: Response;
    try {
      res = await fetch(check.url, {
        headers: opts.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return { ok: false, error: `Cannot reach host 无法访问: ${new URL(check.url).hostname}` };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, error: "Redirect without a Location header（重定向缺少目标地址）" };
      try {
        current = new URL(loc, check.url).toString();
      } catch {
        return { ok: false, error: "Redirect to an invalid URL（重定向地址无效）" };
      }
      continue;
    }
    return { ok: true, url: check.url, status: res.status, text: await readCapped(res) };
  }
  return { ok: false, error: "Too many redirects 重定向次数过多" };
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    if (out.length > MAX_BODY_CHARS) {
      await reader.cancel();
      return out.slice(0, MAX_BODY_CHARS);
    }
  }
  return out + decoder.decode();
}
