"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/* ── Theme: Light / Dark, persisted, follows system until first choice ──────
 * The class is set by THEME_SCRIPT before first paint (no flash), then
 * toggled here. Raw tokens in globals.css do the rest. */

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

/* ── Font size: global zoom steps, persisted, applied pre-paint ──────────────
 * The app sizes text in px utility classes, so rem scaling would be a no-op;
 * `zoom` on <body> scales the whole layout coherently (supported in every
 * modern engine) without breaking dialogs or reading measure. */
export const FONT_ZOOM_STEPS = [0.9, 1, 1.15, 1.3, 1.45] as const;
export type FontZoom = (typeof FONT_ZOOM_STEPS)[number];

export const FONT_ZOOM_SCRIPT = `(function(){try{var z=parseFloat(localStorage.getItem("fs-zoom"));if(z>0.5&&Math.abs(z-1)>0.001)document.body.style.zoom=z;}catch(e){}})();`;

export function applyFontZoom(z: FontZoom) {
  document.body.style.zoom = Math.abs(z - 1) > 0.001 ? String(z) : "";
  try {
    localStorage.setItem("fs-zoom", String(z));
  } catch {
    /* private mode */
  }
}

export function nextFontZoom(current: number): FontZoom {
  const idx = FONT_ZOOM_STEPS.findIndex((s) => s >= current - 0.001);
  return FONT_ZOOM_STEPS[(idx + 1) % FONT_ZOOM_STEPS.length];
}

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
