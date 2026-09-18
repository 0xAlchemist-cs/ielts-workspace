"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { T } from "@/components/i18n";

/* ── CET Exam-Mode section timer — server-clock truth, client render ───────
 * remainingMs comes from the DB-backed session; this component only counts
 * DOWN locally between polls. Refresh/remount re-fetches the same clock —
 * time can never be reset or added. Warnings at 5 min and 1 min. */

export interface ExamSessionState {
  sessionId: number;
  exam: "cet4" | "cet6";
  currentSection: "writing" | "listening" | "reading" | "translation";
  sections: Record<string, { remainingMs: number | null; exhausted?: boolean }>;
  timedOut: string[];
  submitted: boolean;
  testMode: boolean;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function SectionTimer({
  session,
  onExhausted,
}: {
  session: ExamSessionState;
  onExhausted: () => void;
}) {
  const section = session.sections[session.currentSection];
  const serverRemaining = section?.remainingMs ?? 0;
  const [display, setDisplay] = useState(serverRemaining);
  const firedRef = useRef(false);
  const exhaustedRef = useRef(false);

  // resync when the server says the section changed
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync to server clock on section change
    setDisplay(serverRemaining);
    firedRef.current = false;
    exhaustedRef.current = false;
  }, [session.currentSection, serverRemaining]);

  useEffect(() => {
    const tick = setInterval(() => {
      setDisplay((d) => Math.max(0, d - 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (display <= 0 && !firedRef.current) {
      firedRef.current = true;
      exhaustedRef.current = true;
      onExhausted();
    }
  }, [display, onExhausted]);

  const danger = display <= 60_000;
  const warn = !danger && display <= 5 * 60_000;
  const label: Record<string, { en: string; zh: string }> = {
    writing: { en: "Writing", zh: "写作" },
    listening: { en: "Listening", zh: "听力" },
    reading: { en: "Reading", zh: "阅读" },
    translation: { en: "Translation", zh: "翻译" },
  };
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${
        danger ? "bg-[#ff3b30]/[0.08]" : warn ? "bg-[#ff9f0a]/[0.08]" : "bg-surface-2"
      }`}
    >
      <span className="text-[13.5px] font-semibold text-ink">
        <T en={label[session.currentSection]?.en ?? session.currentSection} zh={label[session.currentSection]?.zh ?? ""} />
      </span>
      <div className="flex items-center gap-2">
        {warn && !danger && <AlertTriangle size={13} strokeWidth={2} className="text-warn-text" />}
        {danger && display > 0 && <AlertTriangle size={13} strokeWidth={2} className="text-err-text" />}
        <span
          className={`font-mono text-[16px] font-semibold tabular-nums ${
            danger ? "text-err-text" : warn ? "text-warn-text" : "text-ink"
          }`}
        >
          {display <= 0 ? "00:00" : fmt(display)}
        </span>
      </div>
    </div>
  );
}

/** Countdown in test mode shows the same component — shorter times, same rules. */
export function useSectionAdvance(
  session: ExamSessionState | null,
  advance: (timedOut: boolean) => Promise<void>,
) {
  const lockedRef = useRef(false);
  const advanceIfExhausted = useCallback(() => {
    if (!session || lockedRef.current) return;
    const section = session.sections[session.currentSection];
    if (section && (section.remainingMs ?? Infinity) <= 0) {
      lockedRef.current = true;
      void advance(true).finally(() => {
        lockedRef.current = false;
      });
    }
  }, [session, advance]);
  useEffect(() => {
    advanceIfExhausted();
  }, [advanceIfExhausted]);
  return { advanceIfExhausted };
}
