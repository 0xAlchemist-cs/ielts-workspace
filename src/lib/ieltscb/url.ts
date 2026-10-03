/* ── IELTSCB report URL parsing — accepts the human-facing Report page URL
 *    and extracts the API query parameters. duration is NOT required (the API
 *    returns the identical payload without it — verified against the live
 *    endpoint); we never fabricate a duration. */

export interface IeltscbReportParams {
  paperId: number;
  classify: number;
  chaptersId: number;
  pType: number;
  tid: number;
}

export type IeltscbUrlParseResult =
  | { ok: true; params: IeltscbReportParams; host: string }
  | { ok: false; code: "INVALID_URL" | "UNSUPPORTED_URL" | "INVALID_PARAMS"; message: string };

const REQUIRED: { key: keyof IeltscbReportParams; names: string[] }[] = [
  { key: "paperId", names: ["paper_id"] },
  { key: "classify", names: ["classify"] },
  { key: "chaptersId", names: ["chapters_id"] },
  { key: "pType", names: ["p_type"] },
  { key: "tid", names: ["tid"] },
];

export function parseIeltscbReportUrl(input: string): IeltscbUrlParseResult {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, code: "INVALID_URL", message: "URL is empty." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: "INVALID_URL", message: "Not a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "INVALID_URL", message: "Only http(s) URLs are supported." };
  }
  // Accept www.ieltscb.com and ieltscb.com report pages/API; nothing else.
  const host = url.hostname.toLowerCase();
  if (host !== "www.ieltscb.com" && host !== "ieltscb.com") {
    return { ok: false, code: "UNSUPPORTED_URL", message: "Only ieltscb.com report links are supported." };
  }
  // The live site serves /report/ and /Report/ identically — accept both,
  // since users paste whatever casing their browser address bar shows.
  if (!url.pathname.toLowerCase().startsWith("/report/")) {
    return { ok: false, code: "UNSUPPORTED_URL", message: "Link must be an ieltscb.com /Report/ page." };
  }

  const params = {} as Partial<IeltscbReportParams>;
  for (const { key, names } of REQUIRED) {
    const raw = names.map((n) => url.searchParams.get(n)).find((v) => v != null);
    if (raw == null || raw === "") {
      return { ok: false, code: "INVALID_PARAMS", message: `Missing required parameter: ${names[0]}.` };
    }
    const num = Number(raw);
    if (!Number.isInteger(num) || num <= 0) {
      return { ok: false, code: "INVALID_PARAMS", message: `Parameter ${names[0]} must be a positive integer.` };
    }
    params[key] = num;
  }

  return { ok: true, params: params as IeltscbReportParams, host };
}

/** The API endpoint for a parsed set of params (duration omitted — optional). */
export function ieltscbApiUrl(p: IeltscbReportParams): string {
  return `https://www.ieltscb.com/Report/show?classify=${p.classify}&chapters_id=${p.chaptersId}&paper_id=${p.paperId}&p_type=${p.pType}&tid=${p.tid}`;
}

/** Stable duplicate-detection key for one report (one answering session). */
export function ieltscbExternalKey(p: IeltscbReportParams): string {
  return `ieltscb:${p.chaptersId}:${p.paperId}:${p.pType}:${p.tid}`;
}

/** Same passage/test (ignores tid — a re-test of the same material). */
export function ieltscbTestKey(p: IeltscbReportParams): string {
  return `ieltscb:${p.chaptersId}:${p.paperId}:${p.pType}`;
}
