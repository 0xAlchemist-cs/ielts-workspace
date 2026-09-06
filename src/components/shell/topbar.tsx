"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Menu, Settings, User } from "lucide-react";
import { setImmersionLevelAction } from "@/app/actions";
import { T, useImmersion } from "@/components/i18n";
import { ThemeToggle } from "@/components/theme";

/* ── Top Bar — one line of wayfinding; chrome, not content ─────────────────── */

const SECTION_MAP: { match: (p: string) => boolean; en: string; zh: string }[] = [
  { match: (p) => p === "/", en: "Mission Control", zh: "主控台" },
  { match: (p) => p.startsWith("/library"), en: "Reading", zh: "阅读" },
  { match: (p) => p.startsWith("/read"), en: "Active Reading", zh: "主动阅读" },
  { match: (p) => p.startsWith("/listen"), en: "Listening", zh: "听力" },
  { match: (p) => p.startsWith("/writing"), en: "Writing", zh: "写作" },
  { match: (p) => p.startsWith("/speaking"), en: "Speaking", zh: "口语" },
  { match: (p) => p.startsWith("/ielts"), en: "IELTS", zh: "雅思" },
  { match: (p) => p.startsWith("/review"), en: "Review", zh: "复习" },
  { match: (p) => p.startsWith("/chunks"), en: "Language", zh: "语言库" },
  { match: (p) => p.startsWith("/lab"), en: "Lab", zh: "语言实验室" },
  { match: (p) => p.startsWith("/errors"), en: "Errors", zh: "错误银行" },
  { match: (p) => p.startsWith("/profile"), en: "Profile", zh: "学习画像" },
  { match: (p) => p.startsWith("/external"), en: "External Coach", zh: "外部教练" },
  { match: (p) => p.startsWith("/settings"), en: "Settings", zh: "设置" },
];

/* Two language display modes, stored as legacy immersion levels in the DB:
 * 中英 = bilingual (levels 1–2) · 沉浸 = English only (levels 3–4) */
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

export function Topbar({ aiLive, onOpenMobileNav }: { aiLive: boolean; onOpenMobileNav: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const level = useImmersion();
  const [pending, start] = useTransition();

  const section = SECTION_MAP.find((s) => s.match(pathname));

  return (
    <header className="material-header sticky top-0 z-30 flex h-[56px] shrink-0 items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
      {/* left — mobile nav + page title */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
          className="press flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-2 nav-hover lg:hidden"
        >
          <Menu size={16} strokeWidth={1.8} />
        </button>
        <span className="truncate text-[13.5px] font-semibold tracking-[-0.012em] text-ink">
          {section ? <T en={section.en} zh={section.zh} /> : "…"}
        </span>
      </div>

      {/* right — AI · Language · Appearance · Profile · Settings */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          title={aiLive ? "Live AI provider connected" : "Offline Mock AI — set AI_BASE_URL + AI_API_KEY in .env.local to upgrade"}
          className="mr-0.5 hidden items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-[10.5px] font-medium text-ink-3 md:inline-flex"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${aiLive ? "bg-ok" : "bg-warn"}`} />
          {aiLive ? "AI Live" : "Mock AI"}
        </span>

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
