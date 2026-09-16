"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CircleAlert,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { T } from "@/components/i18n";
import type { LucideIcon } from "lucide-react";

/* ── Sidebar — four places, then everything else folded away ────────────────
 * A learner needs to answer "where do I do things", not "how is the product
 * architected": TODAY / PRACTICE / LIBRARY / PROGRESS are the whole primary
 * nav. Capabilities (writing, mock, mistakes, language tools) live behind one
 * collapsed "More" group; Settings stays in the footer. */

type Item = { href: string; en: string; zh: string; icon: LucideIcon };

const PRIMARY: Item[] = [
  { href: "/", en: "Today", zh: "今日", icon: Target },
  { href: "/review", en: "Practice", zh: "练习", icon: RotateCcw },
  { href: "/library", en: "Library", zh: "内容库", icon: BookOpen },
  { href: "/profile", en: "Progress", zh: "进步", icon: TrendingUp },
];

const MORE: (Item & { ieltsOnly?: boolean })[] = [
  { href: "/writing", en: "Writing", zh: "写作", icon: PenLine, ieltsOnly: true },
  { href: "/external", en: "Speaking", zh: "口语", icon: Mic },
  { href: "/ielts", en: "IELTS", zh: "雅思练习", icon: GraduationCap, ieltsOnly: true },
  { href: "/ielts/mock", en: "Mock exam", zh: "全真模考", icon: ClipboardCheck, ieltsOnly: true },
  { href: "/errors", en: "Mistakes", zh: "惯犯错误", icon: CircleAlert },
  { href: "/chunks", en: "Language", zh: "语言库", icon: Layers },
  { href: "/lab", en: "AI Lab", zh: "AI 实验室", icon: Sparkles },
];

function isActive(pathname: string, href: string): boolean {
  const route = href.split("?")[0];
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function Sidebar({
  userName,
  examProfile,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onNavigate,
}: {
  userName?: string;
  examProfile: "ielts" | "cet4" | "cet6";
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  // IELTS-format engines (writing tasks, IELTS practice, mock) have no CET
  // counterpart yet — hiding beats faking. Reading/Listening/Practice/Language
  // are exam-agnostic environments fed by the active profile's corpus.
  const more = MORE.filter((m) => !m.ieltsOnly || examProfile === "ielts");  const itemCls = (active: boolean, secondary: boolean) =>
    `press mb-0.5 flex items-center gap-3 rounded-[11px] transition-colors duration-150 ${
      collapsed ? "justify-center px-0 py-[12px]" : "px-3 py-[10px]"
    } ${secondary ? "text-[13px]" : "text-[14px]"} ${
      active ? "nav-selected font-semibold text-ink" : "nav-hover text-ink-2 hover:text-ink"
    }`;

  const renderItem = (item: Item, secondary: boolean) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.en : undefined}
        aria-current={active ? "page" : undefined}
        className={itemCls(active, secondary)}
      >
        <Icon
          size={collapsed ? 19 : secondary ? 16 : 18}
          strokeWidth={active ? 1.9 : 1.6}
          className={active ? "text-ink-2" : "text-ink-3"}
        />
        {!collapsed && <T en={item.en} zh={item.zh} />}
      </Link>
    );
  };

  return (
    <>
      {/* mobile scrim */}
      <div
        aria-hidden={!mobileOpen}
        onClick={onNavigate}
        className={`fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-line transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:h-auto lg:translate-x-0 lg:self-stretch ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-[68px]" : "w-[240px]"}`}
      >
        {/* header — collapsed: one centred expand button; expanded: brand + collapse */}
        <div className="flex h-[56px] shrink-0 items-center px-3.5">
          {collapsed ? (
            <button
              type="button"
              aria-label="Expand sidebar"
              title="Expand sidebar 展开侧栏"
              onClick={onToggleCollapsed}
              className="press mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] text-ink-2 transition-colors duration-150 nav-hover hover:text-ink"
            >
              <PanelLeftOpen size={19} strokeWidth={1.8} />
            </button>
          ) : (
            <>
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent">
                <span className="text-[12.5px] font-bold tracking-tight text-white">IW</span>
              </div>
              <div className="min-w-0 pl-3 leading-tight">
                <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">IELTS Workspace</div>
              </div>
              <button
                type="button"
                aria-label="Collapse sidebar"
                title="Collapse sidebar 收起侧栏"
                onClick={onToggleCollapsed}
                className="press ml-auto flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-3 transition-colors duration-150 nav-hover hover:text-ink"
              >
                <PanelLeftClose size={17} strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>

        {/* nav — four primary destinations, then capabilities listed plainly */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-5">
          {PRIMARY.map((item) => renderItem(item, false))}

          <div className="mt-7">
            {collapsed ? (
              <div className="mx-auto mb-3 h-px w-6 bg-line" />
            ) : (
              <div className="mx-3 mb-2 h-px bg-line" />
            )}
            {more.map((item) => renderItem(item, true))}
          </div>
        </nav>

        {/* footer — settings + user, breathing room */}
        <div className="shrink-0 p-3 pb-5">
          <Link
            href="/settings"
            onClick={onNavigate}
            title={collapsed ? "Settings" : undefined}
            className={`press flex items-center gap-3 rounded-[11px] text-[14px] transition-colors duration-150 ${
              collapsed ? "justify-center px-0 py-[12px]" : "px-3 py-[10px]"
            } ${
              pathname.startsWith("/settings")
                ? "nav-selected font-semibold text-ink"
                : "nav-hover text-ink-2 hover:text-ink"
            }`}
          >
            <Settings
              size={collapsed ? 19 : 18}
              strokeWidth={1.6}
              className={pathname.startsWith("/settings") ? "text-ink-2" : "text-ink-3"}
            />
            {!collapsed && <T en="Settings" zh="设置" />}
          </Link>
          {!collapsed && (
            <div className="mt-3 flex items-center gap-2.5 px-3 pt-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-ink-2">
                {(userName ?? "L")[0].toUpperCase()}
              </div>
              <span className="truncate text-[12px] text-ink-3">{userName ?? "Single-user mode"}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
