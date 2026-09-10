"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CircleAlert,
  ClipboardCheck,
  FlaskConical,
  GraduationCap,
  Headphones,
  Layers,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  RotateCcw,
  Settings,
  Target,
  TrendingUp,
} from "lucide-react";
import { T } from "@/components/i18n";
import type { LucideIcon } from "lucide-react";

/* ── Sidebar — quiet canvas rail; the content is the hero, never the nav ──── */

type Item = { href: string; en: string; zh: string; icon: LucideIcon };
type Group = { label: string; labelZh: string; items: Item[] };

/* IA v2 — the product is the loop, modules are environments:
 * Today (the loop's daily orchestration) · Practice (environments) ·
 * Study (memory-driven training) · Progress (evidence). No engine names. */
export const NAV: Group[] = [
  {
    label: "Today",
    labelZh: "今日",
    items: [{ href: "/", en: "Today", zh: "今日", icon: Target }],
  },
  {
    label: "Practice",
    labelZh: "练习",
    items: [
      { href: "/library", en: "Reading", zh: "阅读", icon: BookOpen },
      { href: "/library?type=listening", en: "Listening", zh: "听力", icon: Headphones },
      { href: "/writing", en: "Writing", zh: "写作", icon: PenLine },
      { href: "/external", en: "Speaking", zh: "口语", icon: Mic },
      { href: "/ielts", en: "IELTS Practice", zh: "雅思练习", icon: GraduationCap },
      { href: "/ielts/mock", en: "Mock Exam", zh: "全真模考", icon: ClipboardCheck },
    ],
  },
  {
    label: "Study",
    labelZh: "学习",
    items: [
      { href: "/review", en: "Review", zh: "复习", icon: RotateCcw },
      { href: "/errors", en: "Mistakes", zh: "惯犯错误", icon: CircleAlert },
      { href: "/chunks", en: "Language", zh: "语言库", icon: Layers },
      { href: "/lab", en: "Lab", zh: "语言实验室", icon: FlaskConical },
    ],
  },
  {
    label: "Progress",
    labelZh: "进步",
    items: [{ href: "/profile", en: "My Progress", zh: "我的进步", icon: TrendingUp }],
  },
];

function isActive(pathname: string, href: string, hash: string, search: string): boolean {
  const [routeQ, anchor] = href.split("#");
  const [route, query] = routeQ.split("?");
  if (pathname !== route) return false;
  if (anchor) return hash === `#${anchor}`;
  // queried siblings (Listening vs Reading on /library) split by the param;
  // the query-less item never lights up while a queried sibling matches
  if (query) return search.includes(query);
  return !search.includes("type=");
}

export function Sidebar({
  userName,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onNavigate,
}: {
  userName?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const read = () => {
      setHash(window.location.hash);
      setSearch(window.location.search);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [pathname]);

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
        className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-line transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:translate-x-0 ${
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

        {/* nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-5">
          {NAV.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "mt-7" : ""}>
              {collapsed ? (
                <div className="mx-auto mb-3 h-px w-6 bg-line" />
              ) : (
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3/80">
                  <T en={group.label} zh={group.labelZh} />
                </div>
              )}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href, hash, search);
                const Icon = item.icon;
                // Same-page "/profile → /profile#trajectory" links: a plain
                // Link to the same route won't strip the hash or scroll —
                // handle it manually so Profile ↔ Progress always works.
                const samePageProfile = item.href === "/profile" && pathname === "/profile";
                const samePageTrajectory = item.href === "/profile#trajectory" && pathname === "/profile";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      onNavigate();
                      if (samePageProfile) {
                        // same route without hash: Link would no-op — return to top manually
                        e.preventDefault();
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        history.replaceState(null, "", window.location.pathname);
                        setHash("");
                      } else if (samePageTrajectory) {
                        // same route adding a hash: Link would drop it — set it manually
                        e.preventDefault();
                        history.pushState(null, "", "/profile#trajectory");
                        document.getElementById("trajectory")?.scrollIntoView({ behavior: "smooth" });
                        setHash("#trajectory");
                      }
                    }}
                    title={collapsed ? item.en : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`press mb-0.5 flex items-center gap-3 rounded-[11px] text-[14px] transition-colors duration-150 ${
                      collapsed ? "justify-center px-0 py-[12px]" : "px-3 py-[10px]"
                    } ${
                      active
                        ? "nav-selected font-semibold text-ink"
                        : "nav-hover text-ink-2 hover:text-ink"
                    }`}
                  >
                    <Icon size={collapsed ? 19 : 18} strokeWidth={active ? 1.9 : 1.6} className={active ? "text-ink-2" : "text-ink-3"} />
                    {!collapsed && <T en={item.en} zh={item.zh} />}
                  </Link>
                );
              })}
            </div>
          ))}
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
