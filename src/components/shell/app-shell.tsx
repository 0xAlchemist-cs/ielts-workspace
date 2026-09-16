"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

/* ── App shell — owns sidebar collapse (persisted) + mobile drawer state ──── */

export function AppShell({
  userName,
  aiLive,
  examProfile,
  children,
}: {
  userName?: string;
  aiLive: boolean;
  examProfile: "ielts" | "cet4" | "cet6";
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted pref once
    setCollapsed(localStorage.getItem("sb-collapsed") === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sb-collapsed", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={userName}
        examProfile={examProfile}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar aiLive={aiLive} examProfile={examProfile} onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1">
          {/* Page width is opt-out: labs that benefit from a wider canvas
           * (Reading/Listening/Writing/IELTS) wrap their content in
           * `.shell-wide`; narrow pages (Settings/Profile) use `.shell-narrow`.
           * Default stays 6xl for focused content. */}
          <div className="app-frame mx-auto max-w-6xl px-4 py-10 sm:px-10 sm:py-12">{children}</div>
        </main>
      </div>
    </div>
  );
}
