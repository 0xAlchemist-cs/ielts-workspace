/* ── IELTSCB saved-HTML report parsing — for reports the API can no longer
 *    fetch. Since ~Oct 2026 the site renders reports from the login session
 *    (window.tid = ''), so a pasted report URL carries no capability token.
 *    The user's browser CAN see the report, though — and "Save page as"
 *    captures the rendered DOM. This parser extracts what that DOM reliably
 *    holds: the report identity (window.* page params), the answer table
 *    (question number / correct answer / user answer per row) and the result
 *    banner (正确率 / 正确数量 / 总耗时).
 *
 *    Everything the DOM does NOT hold (passage, stems, options, official
 *    explanations, synonyms) is NOT fabricated here — the caller joins this
 *    attempt record onto the previously imported canonical material by test
 *    key (chapters_id + paper_id + p_type). */

export interface IeltscbHtmlReportParams {
  classify: number;
  chaptersId: number;
  paperId: number;
  pType: number;
}

export interface IeltscbHtmlAnswerRow {
  number: number;
  correctAnswer: string;
  userAnswer: string;
}

export interface IeltscbHtmlReport {
  params: IeltscbHtmlReportParams;
  /** the URL the page was saved from (browser "saved from url" comment) */
  sourceUrl: string | null;
  rows: IeltscbHtmlAnswerRow[];
  stats: {
    rightCount: number | null;
    totalQuestions: number;
    durationSeconds: number | null;
    correctRate: number | null;
  };
}

export type IeltscbHtmlParseResult =
  | { ok: true; report: IeltscbHtmlReport }
  | { ok: false; code: "NOT_IELTSCB_PAGE" | "MISSING_PARAMS" | "NO_ANSWER_TABLE" | "EMPTY_TABLE"; message: string };

const SAVED_FROM = /<!--\s*saved from url=\(\d+\)(https?:\/\/[^>\s]+?)\s*-->/i;

function windowParam(html: string, name: string): number | null {
  const m = html.match(new RegExp(`window\\.${name}\\s*=\\s*['"](\\d+)['"]`));
  return m ? Number(m[1]) : null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** "5分57秒" / "1小时2分3秒" / "45秒" → seconds. */
function parseDuration(text: string): number | null {
  const h = text.match(/(\d+)\s*小时/);
  const m = text.match(/(\d+)\s*分/);
  const s = text.match(/(\d+)\s*秒/);
  if (!h && !m && !s) return null;
  return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
}

/** Extract one balanced <table>…</table> block (no nested tables expected —
 *  the report answer table is flat, but be defensive about truncation). */
function extractTable(html: string, afterClass: string): string | null {
  const anchor = html.indexOf(afterClass);
  if (anchor === -1) return null;
  const start = html.indexOf("<table", anchor);
  if (start === -1) return null;
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const open = html.indexOf("<table", i);
    const close = html.indexOf("</table>", i);
    if (close === -1) return null;
    if (open !== -1 && open < close) {
      depth++;
      i = open + 6;
    } else {
      depth--;
      i = close + 8;
      if (depth === 0) return html.slice(start, i);
    }
  }
  return null;
}

/** Unanswered fill-ins render as "not yet" fragments ("no"/"not"/"yet") in
 *  the my-answer cell (class my-answer-error) — never a real answer. */
const BLANK_MARKERS = new Set(["no", "not", "yet", "not yet", "n/a", "-", "—"]);

function cleanUserAnswer(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim().toLowerCase();
  return BLANK_MARKERS.has(s) ? "" : raw.trim();
}

export function parseIeltscbHtmlReport(input: string): IeltscbHtmlParseResult {
  const html = typeof input === "string" ? input : "";
  if (!html) return { ok: false, code: "NOT_IELTSCB_PAGE", message: "Empty input." };
  if (!/ieltscb\.com/i.test(html)) {
    return { ok: false, code: "NOT_IELTSCB_PAGE", message: "This does not look like an ieltscb.com page." };
  }

  const classify = windowParam(html, "classify");
  const chaptersId = windowParam(html, "chapters_id");
  const paperId = windowParam(html, "paper_id");
  const pType = windowParam(html, "p_type");
  if (classify == null || chaptersId == null || paperId == null || pType == null) {
    return { ok: false, code: "MISSING_PARAMS", message: "Page params (classify/chapters_id/paper_id/p_type) not found — save the page again as “Webpage, HTML Only”." };
  }

  const table = extractTable(html, "report-read-cont-right-box-table");
  if (table == null) {
    return { ok: false, code: "NO_ANSWER_TABLE", message: "Answer table not found — the report view may not have been open when the page was saved." };
  }

  const rows: IeltscbHtmlAnswerRow[] = [];
  for (const trMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    if (cells.length < 4) continue;
    const num = Number(cells[0]);
    if (!Number.isInteger(num) || num <= 0) continue; // header or junk row
    // column order per the report table header: 题号 | 对/错 | 正确答案 | 我的答案 | 解析
    rows.push({ number: num, correctAnswer: cells[2] ?? "", userAnswer: cleanUserAnswer(cells[3] ?? "") });
  }
  if (rows.length === 0) {
    return { ok: false, code: "EMPTY_TABLE", message: "Answer table found but no question rows parsed." };
  }
  rows.sort((a, b) => a.number - b.number);

  const bannerIdx = html.indexOf("report-read-dtk");
  const banner = bannerIdx >= 0 ? stripTags(html.slice(bannerIdx, bannerIdx + 600)) : "";
  const rightMatch = banner.match(/正确数量\s*(\d+)/);
  const rateMatch = banner.match(/正确率\s*(\d+)\s*%/);
  const durationMatch = banner.match(/总耗时\s*([0-9小时分秒\s]+)/);

  return {
    ok: true,
    report: {
      params: { classify, chaptersId, paperId, pType },
      sourceUrl: html.match(SAVED_FROM)?.[1] ?? null,
      rows,
      stats: {
        rightCount: rightMatch ? Number(rightMatch[1]) : null,
        totalQuestions: rows.length,
        durationSeconds: durationMatch ? parseDuration(durationMatch[1]) : null,
        correctRate: rateMatch ? Number(rateMatch[1]) : null,
      },
    },
  };
}

/** Official-grade comparison of a user answer against the correct answer —
 *  same semantics the site's 对/错 column shows: choice questions compare
 *  the option letter prefix (case-insensitive); fill-ins accept any listed
 *  variant ("anchor / ship's anchor" style), case-insensitive, trimmed. */
export function htmlAnswerIsCorrect(userAnswer: string, correctAnswer: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const user = norm(userAnswer);
  const correct = norm(correctAnswer);
  if (!user || !correct) return false;
  if (user === correct) return true;
  // multiple accepted variants separated by "/"
  const variants = correct.split("/").map((v) => v.trim()).filter(Boolean);
  if (variants.length > 1 && variants.includes(user)) return true;
  // choice answers render as "D. English" / "d" — compare the leading letter
  const userLetter = user.match(/^([a-h])\b/)?.[1];
  const correctLetter = correct.match(/^([a-h])\b/)?.[1];
  if (userLetter && correctLetter) return userLetter === correctLetter;
  return false;
}
