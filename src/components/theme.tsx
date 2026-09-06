"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/* ── Theme: Light / Dark, persisted, follows system until first choice ──────
 * The class is set by THEME_SCRIPT before first paint (no flash), then
 * toggled here. Raw tokens in globals.css do the rest. */

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* private mode — class alone is fine */
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate current theme once
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  if (dark === null) {
    // placeholder keeps layout stable before hydration
    return <span className={`block h-[30px] w-[30px] ${className}`} aria-hidden />;
  }

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        applyTheme(next);
      }}
      className={`press flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink ${className}`}
    >
      {dark ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
    </button>
  );
}
