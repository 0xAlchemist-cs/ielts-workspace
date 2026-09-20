import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Headphones, PenLine, RotateCcw } from "lucide-react";
import { requireUser } from "@/server/current-user";
import { getReviewBalance } from "@/server/services/retention";
import { T } from "@/components/i18n";

export const dynamic = "force-dynamic";

/* ── V16.2 Practice — the chooser for ACTIVE learning. It never tells you
 *    what you SHOULD do today (that's Today/Planner's job); it answers
 *    "if I want to practise right now, what can I pick?" — five doors into
 *    existing surfaces, zero new engines. Review lives here too, with its
 *    live count quoted from the canonical queue. Static /practice coexists
 *    with /practice/[errorId] (wrong→practice deep link). */

export default async function PracticeHubPage() {
  const cu = await requireUser();
  const balance = await getReviewBalance(cu.user.id);
  const dueNow = Math.max(balance.overdueCount, 0);

  const entries: { href: string; icon: typeof BookOpen; titleEn: string; titleZh: string; noteEn: string; noteZh: string; count?: string }[] = [
    {
      href: "/review",
      icon: RotateCcw,
      titleEn: "Review from memory",
      titleZh: "凭记忆复习",
      noteEn: "The system scheduled these — items you're about to forget",
      noteZh: "系统排好的——那些快被忘掉的项",
      count: dueNow > 0 ? `${dueNow}` : undefined,
    },
    {
      href: "/library?type=reading",
      icon: BookOpen,
      titleEn: "Reading practice",
      titleZh: "阅读练习",
      noteEn: "Pick a passage, notice expressions, save what you want to keep",
      noteZh: "选一篇文章，注意表达，留下想记的",
    },
    {
      href: "/library?type=listening",
      icon: Headphones,
      titleEn: "Listening practice",
      titleZh: "听力练习",
      noteEn: "Real audio, segment control, connected-speech work",
      noteZh: "真实音频、逐段控制、连读辨析",
    },
    {
      href: "/writing",
      icon: PenLine,
      titleEn: "Writing practice",
      titleZh: "写作练习",
      noteEn: "Plan, write, get feedback, rewrite it yourself",
      noteZh: "列提纲、写、拿反馈、自己重写",
    },
    {
      href: "/ielts",
      icon: GraduationCap,
      titleEn: "Exam practice & speaking",
      titleZh: "考试练习与口语",
      noteEn: "External real exams + coach, import your reports back here",
      noteZh: "外部真题与教练，把报告导回这里",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header>
        <h1 className="text-display">
          <T en="Practice" zh="练习" />
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          <T
            en="Pick what to practise right now — Today's plan is on the home page."
            zh="现在想练什么自己选——今天的计划在首页。"
          />
        </p>
      </header>

      <div className="mt-8 space-y-2.5">
        {entries.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="press group flex items-center gap-4 rounded-card bg-surface p-5 transition-colors hover:bg-surface-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <e.icon size={18} strokeWidth={1.8} className="text-accent-text" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink group-hover:text-accent-text">
                {e.titleZh}
                <span className="ml-2 text-[12.5px] font-normal text-ink-3">{e.titleEn}</span>
                {e.count && (
                  <span className="ml-2 rounded-md bg-accent/[0.1] px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-accent-text">
                    {e.count}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{e.noteZh}</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-ink-3 group-hover:text-accent-text" />
          </Link>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-ink-3">
        <T en="Made a mistake somewhere? " zh="哪里出过错？" />
        <Link href="/errors" className="press font-medium text-accent-text">
          <T en="Practice a mistake →" zh="去练错题 →" />
        </Link>
      </p>
    </div>
  );
}
