"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, Pause, Play, RotateCcw, X } from "lucide-react";
import { T } from "@/components/i18n";
import type { AudioController } from "@/hooks/audio-controller";

/* ── Apple-like audio player bar — sticky, quiet, always one tap from ──────
 * replay. Play/Pause only (no Stop); scrub to seek; mark missed segments
 * live; every segment replays with ONE click (seek + play + auto-pause). */

const RATES = [0.75, 1, 1.25];

export function AudioPlayerBar({ c }: { c: AudioController }) {
  const draggingRef = useRef(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /* Coalesce seeks to one per animation frame — pointermove can fire far
   * above display rate on high-polling mice and back-to-back currentTime
   * writes make the scrub feel stuttery. */
  const scheduleSeek = (time: number) => {
    pendingSeekRef.current = time;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingSeekRef.current != null) c.seek(pendingSeekRef.current);
        pendingSeekRef.current = null;
      });
    }
  };

  const playing = c.state === "playing";
  const loading = c.state === "loading";
  const pct = c.duration > 0 ? Math.min(100, (c.currentTime / c.duration) * 100) : 0;

  const ratioFromClientX = (el: HTMLElement, clientX: number) => {
    const box = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width));
  };

  return (
    <div className="card-specular sticky top-[56px] z-20 rounded-card bg-surface px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-4">
        {/* play / pause — the one big control */}
        <button
          type="button"
          onClick={c.toggle}
          disabled={loading}
          aria-label={playing ? "Pause" : "Play"}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[var(--shadow-button)] disabled:opacity-50"
        >
          {loading ? (
            <span className="text-[10.5px] font-medium">…</span>
          ) : playing ? (
            <Pause size={17} strokeWidth={2.2} />
          ) : (
            <Play size={17} strokeWidth={2.2} className="ml-0.5" />
          )}
        </button>

        {/* scrub bar + time — click OR drag to seek */}
        {c.isReal ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(c.duration)}
              aria-valuenow={Math.round(c.currentTime)}
              tabIndex={0}
              draggable={false}
              className="group relative h-6 flex-1 cursor-pointer touch-none select-none"
              onDragStart={(e) => {
                // native HTML5 drag would hijack the gesture (🚫 cursor)
                e.preventDefault();
              }}
              onPointerDown={(e) => {
                // stop text-selection drag so the pointer gesture owns the move
                e.preventDefault();
                e.currentTarget.focus({ preventScroll: true });
                draggingRef.current = true;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* untrusted events can't capture — the ref flag still tracks the drag */
                }
                const ratio = ratioFromClientX(e.currentTarget, e.clientX);
                setHoverRatio(ratio);
                scheduleSeek(ratio * c.duration);
              }}
              onPointerMove={(e) => {
                const ratio = ratioFromClientX(e.currentTarget, e.clientX);
                setHoverRatio(ratio);
                if (draggingRef.current) scheduleSeek(ratio * c.duration);
              }}
              onPointerLeave={() => {
                if (!draggingRef.current) setHoverRatio(null);
              }}
              onPointerUp={(e) => {
                draggingRef.current = false;
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  /* nothing captured */
                }
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
                setHoverRatio(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") { e.preventDefault(); c.seek(Math.max(0, c.currentTime - 5)); }
                if (e.key === "ArrowRight") { e.preventDefault(); c.seek(Math.min(c.duration, c.currentTime + 5)); }
              }}
            >
              {/* time bubble — follows the pointer while hovering / dragging */}
              {hoverRatio != null && c.duration > 0 && (
                <span
                  className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 select-none rounded-md bg-ink px-2 py-1 text-[12px] font-medium tabular-nums text-bg shadow-sm"
                  style={{ left: `${Math.max(4, Math.min(96, hoverRatio * 100))}%` }}
                >
                  {c.fmt(hoverRatio * c.duration)}
                </span>
              )}
              <div className="absolute top-1/2 h-[4px] w-full -translate-y-1/2 rounded-full bg-surface-2" />
              <div
                className="absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-accent shadow-sm transition-transform duration-100 group-hover:scale-125"
                style={{ left: `calc(${pct}% - 6px)` }}
              />
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-3">
              {c.fmt(c.currentTime)} <span className="opacity-50">/ {c.fmt(c.duration)}</span>
            </span>
          </div>
        ) : (
          <p className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
            <T en="Synthesised speech — real recording not attached" zh="合成语音——未挂载真实录音" />
          </p>
        )}
      </div>

      {/* secondary row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {c.isReal && (
          <button
            type="button"
            onClick={() => c.replayFrom(7)}
            className="press flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink"
          >
            <RotateCcw size={12} strokeWidth={1.9} />
            <T en="Replay −7s" zh="回退 7 秒" />
          </button>
        )}

        <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => c.changeRate(r)}
              className={`press rounded-md px-2 py-0.5 text-[12px] font-medium tabular-nums transition-colors ${
                c.rate === r ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
              }`}
            >
              {r}×
            </button>
          ))}
        </div>

        {c.isReal && (
          <button
            type="button"
            onClick={() => c.markMissed()}
            className="press flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink"
            title="Mark the moment you just missed"
          >
            <Flag size={12} strokeWidth={1.9} />
            <T en="Mark missed" zh="标记漏听" />
          </button>
        )}

        {/* missed segment chips — one click = locate + play */}
        {c.segments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {c.segments.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-[12px] tabular-nums text-ink-2"
              >
                <button
                  type="button"
                  onClick={() => c.playSegment(s.start, s.end)}
                  className="press flex items-center gap-1 font-medium hover:text-ink"
                  title="Locate & replay this segment"
                >
                  <Play size={9} strokeWidth={2.4} className="text-accent-text" />
                  {c.fmt(s.start)}–{c.fmt(s.end)}
                </button>
                <button
                  type="button"
                  onClick={() => c.removeSegment(s.id)}
                  aria-label="Remove segment"
                  className="press flex items-center text-ink-3 hover:text-ink"
                >
                  <X size={10} strokeWidth={2.2} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
