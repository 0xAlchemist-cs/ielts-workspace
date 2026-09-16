"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Menu, Settings, User } from "lucide-react";
import { setExamProfileAction, setImmersionLevelAction } from "@/app/actions";
import { T, useImmersion } from "@/components/i18n";
import { ThemeToggle, applyFontZoom, FONT_ZOOM_STEPS } from "@/components/theme";
import { EXAM_PROFILES, type ExamProfile } from "@/lib/exam-profiles";

/* ── Top Bar — one line of wayfinding; chrome, not content ───────────────────
 * The active exam goal always sits at the left: switching it switches the
 * whole workspace (corpus, memory, missions) — it must never be hidden. */

const SECTION_MAP: { match: (p: string) => boolean; en: string; zh: string; ieltsOnly?: boolean }[] = [
  { match: (p) => p === "/", en: "Today", zh: "今日" },
  { match: (p) => p.startsWith("/welcome"), en: "Welcome", zh: "开始" },
  { match: (p) => p.startsWith("/library"), en: "Library", zh: "内容库" },
  { match: (p) => p.startsWith("/read"), en: "Reading", zh: "阅读" },
  { match: (p) => p.startsWith("/listen"), en: "Listening", zh: "听力" },
  { match: (p) => p.startsWith("/writing"), en: "Writing", zh: "写作", ieltsOnly: true },
  { match: (p) => p.startsWith("/ielts/mock"), en: "Mock exam", zh: "全真模考", ieltsOnly: true },
  { match: (p) => p.startsWith("/ielts"), en: "IELTS", zh: "雅思练习", ieltsOnly: true },
  { match: (p) => p.startsWith("/review"), en: "Practice", zh: "练习" },
  { match: (p) => p.startsWith("/chunks"), en: "Language", zh: "语言库" },
  { match: (p) => p.startsWith("/lab"), en: "AI Lab", zh: "AI 实验室" },
  { match: (p) => p.startsWith("/errors"), en: "Mistakes", zh: "惯犯错误" },
  { match: (p) => p.startsWith("/profile"), en: "Progress", zh: "进步" },
  { match: (p) => p.startsWith("/external"), en: "Speaking", zh: "口语" },
  { match: (p) => p.startsWith("/settings"), en: "Settings", zh: "设置" },
];

/* Two language display modes, stored as legacy immersion levels in the DB:
 *  中英 = bilingual (levels 1–2) · 沉浸 = English only (levels 3–4) */
const LANG_MODES: { value: number; label: string; title: string }[] = [
  { value: 1, label: "中英", title: "Bilingual — English + Chinese assistance 中英辅助" },
  { value: 4, label: "沉浸", title: "Immersion — English only 纯英文环境" },
];

function IconLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`press flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors duration-150 ${
        active ? "nav-selected text-ink" : "text-ink-3 nav-hover hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function Topbar({
  aiLive,
  examProfile,
  onOpenMobileNav,
}: {
  aiLive: boolean;
  examProfile: ExamProfile;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const level = useImmersion();
  const [examOpen, setExamOpen] = useState(false);
  const examRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const saved = parseFloat(localStorage.getItem("fs-zoom") ?? "1");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted zoom once
    if (Number.isFinite(saved) && saved > 0.5) setZoom(saved);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (examRef.current && !examRef.current.contains(e.target as Node)) setExamOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const switchExam = (exam: ExamProfile) => {
    setExamOpen(false);
    if (exam === examProfile) return;
    start(async () => {
      await setExamProfileAction(exam);
      router.refresh();
    });
  };

  const section = SECTION_MAP.find((s) => s.match(pathname) && !(s.ieltsOnly && examProfile !== "ielts"));

  // slider position = nearest preset step; dragging previews live, snaps to step
  const zoomIndex = (() => {
    let best = 0;
    FONT_ZOOM_STEPS.forEach((s, i) => {
      if (Math.abs(s - zoom) <= Math.abs(FONT_ZOOM_STEPS[best] - zoom)) best = i;
    });
    return best;
  })();
  const setZoomStep = (i: number) => {
    const step = FONT_ZOOM_STEPS[i] ?? 1;
    setZoom(step);
    applyFontZoom(step);
  };

  return (
    <header className="app-topbar material-header sticky top-0 z-30 flex h-[56px] shrink-0 items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
      {/* left — mobile nav + exam switcher + page title */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
          className="press flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-2 nav-hover lg:hidden"
        >
          <Menu size={16} strokeWidth={1.8} />
        </button>

        {/* active exam — always visible; feels like choosing a goal, not a db */}
        <div ref={examRef} className="relative">
          <button
            type="button"
            onClick={() => setExamOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={examOpen}
            title="Current exam 当前考试目标"
            className={`press flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors duration-150 ${
              examOpen ? "nav-selected text-ink" : "text-ink-2 nav-hover hover:text-ink"
            }`}
          >
            {EXAM_PROFILES.find((p) => p.value === examProfile)?.label}
            <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform duration-150 ${examOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </button>
          {examOpen && (
            <div role="menu" className="enter absolute left-0 top-[38px] z-50 w-[180px] rounded-xl border border-line bg-surface p-1.5 shadow-xl">
              {EXAM_PROFILES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="menuitem"
                  onClick={() => switchExam(p.value)}
          disabled={pending}
                  className={`press flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                    p.value === examProfile ? "bg-accent/[0.08] text-accent-text" : "text-ink-2 nav-hover hover:text-ink"
                  }`}
                >
                  <span>{p.label}</span>
                  <span className="text-[11px] font-normal text-ink-3">{p.zh}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="hidden truncate text-[13px] font-medium text-ink-3 sm:inline">
          {section ? <T en={section.en} zh={section.zh} /> : "…"}
        </span>
      </div>

      {/* right — AI dot · Font zoom · Language · Appearance · Profile · Settings */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          title={aiLive ? "Live AI provider connected" : "Offline Mock AI — set AI_BASE_URL + AI_API_KEY in .env.local to upgrade"}
          aria-label={aiLive ? "AI live" : "Mock AI"}
          className={`mr-1 hidden h-1.5 w-1.5 rounded-full md:block ${aiLive ? "bg-ok" : "bg-warn"}`}
        />

        {/* text size — discrete preset pills, same visual grammar as the
         * language switcher next to it */}
        <div className="flex h-[30px] items-center gap-1.5" title="Text size 字号（90%–145%）">
          <span className="text-[13px] font-bold text-ink-3">Aa</span>
          <div className="flex items-center rounded-lg bg-surface-2 p-0.5">
            {FONT_ZOOM_STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setZoomStep(i)}
                aria-pressed={zoomIndex === i}
                aria-label={`Text size ${Math.round(s * 100)}%`}
                className={`press rounded-md px-[7px] py-[3px] text-[11px] font-semibold tabular-nums transition-colors duration-150 ${
                  zoomIndex === i
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {Math.round(s * 100)}
              </button>
            ))}
          </div>
        </div>

        <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />

        <div
          className={`hidden items-center rounded-lg bg-surface-2 p-0.5 transition-opacity duration-150 sm:flex ${
            pending ? "opacity-60" : ""
          }`}
        >
          {LANG_MODES.map((l) => (
            <button
              key={l.value}
              type="button"
              title={l.title}
              aria-label={`Language mode: ${l.title}`}
              aria-pressed={level <= 2 ? l.value === 1 : l.value === 4}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setImmersionLevelAction(l.value);
                  router.refresh();
                })
              }
              className={`press rounded-md px-2.5 py-[3px] text-[12px] font-medium transition-colors duration-150 ${
                (level <= 2) === (l.value === 1)
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />

        <ThemeToggle />
        <IconLink href="/profile" label="Profile" active={pathname.startsWith("/profile")}>
          <User size={15} strokeWidth={1.8} />
        </IconLink>
        <IconLink href="/settings" label="Settings" active={pathname.startsWith("/settings")}>
          <Settings size={15} strokeWidth={1.8} />
        </IconLink>
      </div>
    </header>
  );
}
