import type { ReactNode } from "react";
import { T } from "@/components/i18n";

/* Apple-style primitives — server-safe, pure. Press feedback via .press class. */

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card-specular rounded-2xl bg-surface ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3.5">
          <div>
            {title && <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? "px-6 pb-6" : ""}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warn" | "danger" | "purple";
}) {
  // quiet low-saturation tints — colour supports meaning, never shouts
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent/[0.08] text-accent-text",
    success: "bg-ok/[0.10] text-ok-text",
    warn: "bg-warn/[0.10] text-warn-text",
    danger: "bg-err/[0.07] text-err-text",
    purple: "bg-[#af52de]/[0.08] text-[#8a43b8] dark:text-[#c58ce8]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function MockBadge() {
  return <Badge tone="warn">⚙︎ Mock AI</Badge>;
}

export function Stat({
  label,
  labelZh,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  labelZh?: string;
  value: ReactNode;
  sub?: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <div
      className={`card-specular card-lift rounded-2xl px-4 py-3.5 ${
        tone === "accent"
          ? "text-white btn-apple"
          : "bg-white"
      }`}
    >
      <div
        className={`text-[10px] font-semibold uppercase tracking-[0.07em] ${
          tone === "accent" ? "text-white/75" : "text-ink-3"
        }`}
      >
        <T en={label} zh={labelZh} />
      </div>
      <div
        className={`mt-1.5 font-mono text-[24px] font-semibold tabular-nums leading-none tracking-[-0.02em] ${
          tone === "accent" ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className={`mt-1 text-[12px] ${tone === "accent" ? "text-white/75" : "text-ink-3"}`}>{sub}</div>
      )}
    </div>
  );
}

/** Apple Activity-style progress ring — pure CSS conic arc, no JS. */
export function ProgressRing({
  value,
  total,
  size = 96,
  stroke = 9,
  centerLabel,
  centerSub,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  centerLabel?: ReactNode;
  centerSub?: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const deg = Math.round(pct * 360);
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke - 1}px))`;
  const complete = pct >= 1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* track */}
      <div
        className="absolute inset-0 rounded-full bg-black/[0.07]"
        style={{ WebkitMask: mask, mask }}
      />
      {/* progress arc — blue→indigo within the sweep; full rainbow when complete */}
      {deg > 0 && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: complete
              ? "conic-gradient(#0071e3, #5856d6, #af52de, #ff9f0a, #34c759, #0071e3)"
              : `conic-gradient(#0071e3 0deg, #5856d6 ${deg}deg, transparent ${deg}deg)`,
            transform: "rotate(-90deg)",
            WebkitMask: mask,
            mask,
          }}
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[17px] font-semibold tabular-nums leading-none text-ink">
          {centerLabel ?? `${value}/${total}`}
        </span>
        {centerSub && <span className="mt-1 text-[10px] font-medium text-ink-3">{centerSub}</span>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-8 first:mt-0">
      <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{children}</h2>
      {hint && <p className="mt-0.5 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-3">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-[12px] text-ink-3">
          <span>{label}</span>
          <span className="font-mono tabular-nums">{pct}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            pct >= 70 ? "bg-[#34c759]" : pct >= 40 ? "bg-[#0071e3]" : "bg-[#ff9f0a]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Tiny SVG sparkline — server-renderable, no JS. */
export function Sparkline({
  values,
  width = 132,
  height = 30,
  color = "#0071e3",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) {
    return <div className="h-[30px] w-[132px] rounded bg-black/[0.03]" />;
  }
  const max = Math.max(...values, 1);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - (v / max) * (height - 5)}`)
    .join(" ");
  const last = values[values.length - 1];
  const lastX = width;
  const lastY = height - 2 - (last / max) * (height - 5);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  );
}

/* Button classes — press scale(0.97) comes from .press in globals.css */
export const btn = {
  primary:
    "press btn-apple inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-[13.5px] font-medium text-white transition-[filter] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
  secondary:
    "press inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] font-medium text-ink transition-colors duration-150 hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
  ghost:
    "press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-ink-2 transition-colors duration-150 nav-hover hover:text-ink",
  danger:
    "press inline-flex items-center gap-1.5 rounded-xl bg-err/[0.07] px-3 py-2 text-[12.5px] font-medium text-err-text transition-colors duration-150 hover:bg-err/[0.12]",
};

export const inputCls =
  "input-base w-full px-3.5 py-3 text-sm";
