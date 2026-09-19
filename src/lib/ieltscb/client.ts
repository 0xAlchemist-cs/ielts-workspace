/* ── IELTSCB HTTP client — fetches /Report/show and validates the envelope.
 *    Behavior verified live 2026-09-19: the endpoint answers WITHOUT any
 *    session cookie (the tid acts as the capability token), so no credential
 *    handling exists here by design. If the site ever starts requiring a
 *    session we surface AUTH_REQUIRED — never attempt to bypass. */

import { ieltscbApiUrl, type IeltscbReportParams } from "./url";
import type { IeltscbEnvelope, IeltscbReportData } from "./types";

export type IeltscbFetchResult =
  | { ok: true; data: IeltscbReportData }
  | { ok: false; code: "NETWORK_ERROR" | "HTTP_ERROR" | "AUTH_REQUIRED" | "API_ERROR" | "PARSE_ERROR"; message: string; httpStatus?: number };

const API_SUCCESS = "9999";
const TIMEOUT_MS = 20_000;

export async function fetchIeltscbReport(params: IeltscbReportParams): Promise<IeltscbFetchResult> {
  const url = ieltscbApiUrl(params);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // plain browser-ish identity; no cookies, no auth headers, ever
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.ieltscb.com/Report/indexread",
      },
      redirect: "manual", // 3xx → treat as auth/routing problem, never follow
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "NETWORK_ERROR", message: `Could not reach ieltscb.com: ${msg}` };
  }

  if (res.status >= 300 && res.status < 400) {
    // A login redirect means the report now requires a session.
    return { ok: false, code: "AUTH_REQUIRED", message: "ieltscb asked for a login (redirect) — this report needs an authenticated session.", httpStatus: res.status };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, code: "AUTH_REQUIRED", message: "ieltscb rejected the request as unauthorized.", httpStatus: res.status };
  }
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, code: "HTTP_ERROR", message: `ieltscb returned HTTP ${res.status}.`, httpStatus: res.status };
  }

  const bodyText = await res.text();
  let envelope: IeltscbEnvelope;
  try {
    envelope = JSON.parse(bodyText) as IeltscbEnvelope;
  } catch {
    return { ok: false, code: "PARSE_ERROR", message: "ieltscb returned a non-JSON body.", httpStatus: res.status };
  }
  return validateIeltscbEnvelope(envelope);
}

export function validateIeltscbEnvelope(envelope: IeltscbEnvelope): IeltscbFetchResult {
  const code = envelope.e;
  const message = envelope.m;
  if (code !== API_SUCCESS) {
    const authish = /登录|login|unauthor|session/i.test(String(message ?? ""));
    return {
      ok: false,
      code: authish ? "AUTH_REQUIRED" : "API_ERROR",
      message: `ieltscb API error (e=${String(code)}): ${String(message ?? "unknown")}`,
    };
  }
  const data = envelope.data;
  if (!data || typeof data !== "object" || !("question_list" in data)) {
    return { ok: false, code: "API_ERROR", message: "ieltscb response is missing the report data." };
  }
  return { ok: true, data };
}
