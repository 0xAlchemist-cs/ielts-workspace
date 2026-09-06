"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/* ── Drawer — Vaul-style side sheet ─────────────────────────────────────────
 * Always mounted; enter/exit are pure CSS transitions on class change, so
 * they stay interruptible (grab mid-exit and it reverses) with no JS state. */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/25 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
      />
      <div
        className={`material-panel absolute inset-y-0 right-0 flex w-full ${width} flex-col rounded-l-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-black/[0.06] px-6 pt-5 pb-4">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="press -mr-1.5 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-ink-2 transition-colors hover:bg-black/[0.1]"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 transition-opacity duration-150 ${open ? "opacity-100 delay-100" : "opacity-0"}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Toast — Sonner-style ───────────────────────────────────────────────────
 * Enter from the bottom edge along its own axis; interruptible transition
 * (not keyframes); auto-dismiss with hover pause kept simple for MVP. */

let toastId = 0;
type Toast = { id: number; message: string; tone: "default" | "success" | "warn" };
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

export function toast(message: string, tone: Toast["tone"] = "default") {
  const t = { id: ++toastId, message, tone };
  toasts = [...toasts, t].slice(-3);
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, 2600);
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="material-panel enter pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink"
        >
          {t.tone === "success" && <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" />}
          {t.tone === "warn" && <span className="h-1.5 w-1.5 rounded-full bg-[#ff9f0a]" />}
          {t.tone === "default" && <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3]" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ── Segmented control — iOS style ────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`press rounded-[7px] px-3 py-1 text-[12px] font-medium transition-all duration-200 ${
            value === o.value
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-2 hover:text-ink"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Fold — smooth expand/collapse for lab sections ───────────────────────── */

export function Fold({
  title,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (el) setH(el.scrollHeight);
  }, []);
  return (
    <div className="rounded-xl bg-black/[0.03]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="press flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-medium text-ink"
      >
        {title}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        >
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-260"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      >
        <div className="overflow-hidden">
          <div ref={(el) => { ref.current = el; measure(el); }} className="px-4 pb-3.5 pt-0.5 text-[13px] leading-relaxed text-ink-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
