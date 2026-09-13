"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   AudioController — the ONLY owner of the <audio> element's truth.
   State machine: idle · loading · playing · paused · ended.

   Invariants:
   - React state derives from audio element events, never guessed: every
     play()/pause() flows through the element, so `state` and the element
     cannot disagree for more than a tick.
   - Seek is a complete action: seekAndPlay()/playSegment() position AND
     start playback in one call — the caller never presses play twice.
   - A segment {start, end} auto-pauses exactly at end (timeupdate guard),
     then clears itself, leaving the player paused at the boundary.
   - TTS fallback (no real audio): the owner injects onPlayTTS (speak the
     material); pause = stop. Scrub and segments need real audio and the
     UI hides them.
   ═══════════════════════════════════════════════════════════════════════════ */

export type AudioState = "idle" | "loading" | "playing" | "paused" | "ended";

export interface MissedSegment {
  id: number;
  start: number;
  end: number;
}

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
};

export function useAudioController({
  src,
  onPlayTTS,
  ttsStop,
}: {
  src: string | null;
  onPlayTTS: () => void;
  ttsStop: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentRef = useRef<{ start: number; end: number } | null>(null);
  const [state, setState] = useState<AudioState>(src ? "loading" : "idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [segments, setSegments] = useState<MissedSegment[]>([]);

  const isReal = !!src;

  /* ── element events: the element is the source of truth ────────────────── */
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    const onCanPlay = () => setState((s) => (s === "loading" ? "idle" : s));
    const onPlay = () => setState("playing");
    const onPause = () => setState((s) => (s === "ended" ? s : "paused"));
    const onEnded = () => {
      segmentRef.current = null;
      setState("ended");
    };
    const onTime = () => {
      setCurrentTime(el.currentTime);
      const seg = segmentRef.current;
      if (seg && el.currentTime >= seg.end) {
        el.pause();
        segmentRef.current = null;
      }
    };
    const onMeta = () => setDuration(el.duration || 0);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    // The mp3 can finish loading metadata BEFORE this effect attaches the
    // listeners (cached audio) — loadedmetadata then never fires and duration
    // stays 0, breaking the scrub bar. Sync once from the element's reality.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot element-state sync
    {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
      if (el.readyState >= 3) setState((s) => (s === "loading" ? "idle" : s));
      if (!el.paused) setState("playing");
    }
    return () => {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [src]);

  /* ── controls ──────────────────────────────────────────────────────────── */

  const pause = useCallback(() => {
    if (isReal) {
      audioRef.current?.pause();
    } else {
      ttsStop();
      setState("paused");
    }
  }, [isReal, ttsStop]);

  const toggle = useCallback(() => {
    if (isReal) {
      const el = audioRef.current;
      if (!el) return;
      if (el.paused || el.ended) {
        if (el.ended) el.currentTime = 0;
        el.playbackRate = rate;
        void el.play();
      } else {
        el.pause();
      }
    } else {
      if (state === "playing") {
        ttsStop();
        setState("paused");
      } else {
        onPlayTTS();
        setState("playing");
      }
    }
  }, [isReal, onPlayTTS, rate, state, ttsStop]);

  const seek = useCallback((t: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(t, el.duration || t));
    setCurrentTime(el.currentTime);
  }, []);

  /** Seek AND play — one complete action. */
  const seekAndPlay = useCallback(
    (t: number) => {
      segmentRef.current = null;
      if (!isReal) {
        onPlayTTS();
        setState("playing");
        return;
      }
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, t);
      el.playbackRate = rate;
      void el.play();
    },
    [isReal, onPlayTTS, rate],
  );

  /** Play [start, end] then auto-pause at end — from any state. */
  const playSegment = useCallback(
    (start: number, end: number) => {
      if (!isReal) {
        onPlayTTS();
        setState("playing");
        return;
      }
      const el = audioRef.current;
      if (!el) return;
      segmentRef.current = { start, end };
      el.currentTime = Math.max(0, start);
      el.playbackRate = rate;
      void el.play();
    },
    [isReal, onPlayTTS, rate],
  );

  /** Jump back N seconds and keep playing. */
  const replayFrom = useCallback(
    (back: number) => {
      const el = audioRef.current;
      if (!el) return;
      seekAndPlay(Math.max(0, el.currentTime - back));
    },
    [seekAndPlay],
  );

  const changeRate = useCallback((r: number) => {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  }, []);

  /* ── missed segments (learning feature, needs real audio) ──────────────── */

  const markMissed = useCallback(
    (at?: number, span = 8) => {
      if (!isReal) return;
      const t = at ?? audioRef.current?.currentTime ?? 0;
      const d = audioRef.current?.duration || 0;
      const start = Math.max(0, t - 1.5);
      const end = d ? Math.min(start + span, d) : start + span;
      setSegments((s) => [...s, { id: Date.now(), start, end }]);
    },
    [isReal],
  );

  /** Add a segment from a user-entered mm:ss timestamp ("locate missed part"). */
  const locateMissed = useCallback(
    (mmss: string) => {
      const m = mmss.match(/^(\d+):([0-5]?\d)$/);
      if (!m) return false;
      markMissed(Number(m[1]) * 60 + Number(m[2]));
      return true;
    },
    [markMissed],
  );

  const removeSegment = useCallback((id: number) => {
    setSegments((s) => s.filter((x) => x.id !== id));
  }, []);

  return {
    audioRef,
    isReal,
    state,
    currentTime,
    duration,
    rate,
    segments,
    fmt,
    toggle,
    pause,
    seek,
    seekAndPlay,
    playSegment,
    replayFrom,
    changeRate,
    markMissed,
    locateMissed,
    removeSegment,
  };
}

export type AudioController = ReturnType<typeof useAudioController>;
