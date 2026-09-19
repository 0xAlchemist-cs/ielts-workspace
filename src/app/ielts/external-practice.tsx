import Link from "next/link";
import { ArrowDown, FileUp, Globe, Headphones, Layers, Mic, PenLine } from "lucide-react";
import { T } from "@/components/i18n";
import { EXTERNAL_COACH_URL, IELTSCB_READING_URL, IELTSCB_URL } from "@/lib/external-coaches";

/* ── V14.2 External Practice — the product's front door for real exams.
 *    Narrative: 真题在外部完成，能力在工作区沉淀 (practice outside, ability
 *    settles here). Every external link opens a NEW tab so this workspace
 *    page is never navigated away from. URLs come from existing config only
 *    (external-coaches.ts) — nothing invented. */

const ENTRIES: {
  key: string;
  icon: typeof Globe;
  titleEn: string;
  titleZh: string;
  noteEn: string;
  noteZh: string;
  url: string;
  /** internal = a workspace route (Writing Lab), not an external site */
  internal?: boolean;
}[] = [
  {
    key: "reading",
    icon: Globe,
    titleEn: "IELTS Reading 真题",
    titleZh: "雅思阅读真题",
    noteEn: "Do real passages on IELTSCB, then import the report here",
    noteZh: "在 IELTSCB 做真题阅读，回来导入报告",
    url: IELTSCB_READING_URL,
  },
  {
    key: "full",
    icon: Layers,
    titleEn: "Full practice / mock",
    titleZh: "整套练习 / 模考",
    noteEn: "Pick a full paper on IELTSCB — finish outside, import per-passage reports",
    noteZh: "在 IELTSCB 选整套试卷——外面做完，按篇导入报告",
    url: IELTSCB_URL,
  },
  {
    key: "speaking",
    icon: Mic,
    titleEn: "IELTS Speaking",
    titleZh: "雅思口语",
    noteEn: "External AI coach — Part 1/2/3 with feedback and follow-ups",
    noteZh: "外部 AI 教练——Part 1/2/3 提问、反馈与追问",
    url: EXTERNAL_COACH_URL,
  },
  {
    key: "listening",
    icon: Headphones,
    titleEn: "IELTS Listening",
    titleZh: "雅思听力",
    noteEn: "Same coach — passages read aloud, connected speech, dictation",
    noteZh: "同一教练——朗读文章、连读讲解、听写练习",
    url: EXTERNAL_COACH_URL,
  },
  {
    key: "writing",
    icon: PenLine,
    titleEn: "IELTS Writing",
    titleZh: "雅思写作",
    noteEn: "Write here in the workspace — plan, AI feedback, rewrite yourself",
    noteZh: "直接在工作区写——列提纲、AI 反馈、自己重写",
    url: "/writing",
    internal: true,
  },
];

export function ExternalPractice() {
  return (
    <div className="card-specular rounded-2xl bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16.5px] font-semibold tracking-[-0.015em] text-ink">
            <T en="External practice" zh="外部练习" />
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-2">
            <T
              en="Real exams happen outside — your ability settles here."
              zh="真题在外部完成，能力在工作区沉淀。"
            />
          </p>
        </div>
        {/* primary CTAs: go do real exams (new tab) / import a report */}
        <div className="flex items-center gap-2.5">
          <a
            href={IELTSCB_READING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-apple press inline-flex h-10 items-center gap-2 rounded-lg px-4.5 text-[13.5px] font-medium text-white"
          >
            <Globe size={14} />
            <T en="去做真题" zh="去做真题" />
          </a>
          <Link
            href="/library?add=1"
            className="press inline-flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-4 text-[13.5px] font-medium text-ink hover:bg-line"
          >
            <FileUp size={14} />
            <T en="导入练习报告" zh="导入练习报告" />
          </Link>
        </div>
      </div>

      {/* the round-trip flow, stated once, plainly */}
      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-3">
        <T en="外部完成练习" zh="外部完成练习" />
        <ArrowDown size={11} className="-rotate-90" />
        <T en="获得报告" zh="获得报告" />
        <ArrowDown size={11} className="-rotate-90" />
        <T en="回到 IELTS Workspace" zh="回到 IELTS Workspace" />
        <ArrowDown size={11} className="-rotate-90" />
        <T en="粘贴报告链接" zh="粘贴报告链接" />
        <ArrowDown size={11} className="-rotate-90" />
        <T en="导入并生成学习证据" zh="导入并生成学习证据" />
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {ENTRIES.map((e) => {
          const inner = (
            <>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <e.icon size={15} strokeWidth={1.8} className="text-accent-text" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink group-hover:text-accent-text">{e.titleZh} · {e.titleEn}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">{e.noteZh}</span>
                <span className="sr-only">{e.noteEn}</span>
              </span>
            </>
          );
          const cls = "press group flex items-start gap-3 rounded-xl bg-surface-2 p-3.5 transition-colors hover:bg-line/60";
          return e.internal ? (
            <Link key={e.key} href={e.url} className={cls}>
              {inner}
            </Link>
          ) : (
            <a key={e.key} href={e.url} target="_blank" rel="noopener noreferrer" className={cls}>
              {inner}
            </a>
          );
        })}
      </div>
    </div>
  );
}
