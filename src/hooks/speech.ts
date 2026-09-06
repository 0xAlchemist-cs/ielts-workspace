"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── TTS: play any sentence with SpeechSynthesis ──────────────────────────── */

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string, rate = 0.95) => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = rate;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { speak, stop, speaking, supported };
}

/* ── STT: Web Speech Recognition for speaking practice ───────────────────── */

type RecognitionState = "idle" | "listening" | "unsupported";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; [0]: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}

export function useSpeechRecognition() {
  const [state, setState] = useState<RecognitionState>("unsupported");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return; // state already initialises as "unsupported"
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interimText += r[0].transcript;
      }
      setTranscript(finalRef.current.trim());
      setInterim(interimText);
    };
    rec.onend = () => setState("idle");
    rec.onerror = (e) => {
      // Surface why the session died (mic denied, no device, no speech…) —
      // swallowing this made the recorder look like it "never records".
      if (e.error) setLastError(e.error);
      setState("idle");
    };
    recRef.current = rec;
    // Feature detection can only happen after mount (browser API check).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("idle");
    return () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!recRef.current) return;
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setLastError(null);
    try {
      recRef.current.start();
      setState("listening");
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
    setState("idle");
  }, []);

  return { supported: state !== "unsupported", state, transcript, interim, lastError, start, stop };
}

/** Voice input that KEEPS its text: shows the live transcript while listening
 *  and commits the final transcript into your draft state when recording
 *  stops — including the final result SpeechRecognition emits asynchronously
 *  after stop(). Without this commit, the box visually "loses" everything the
 *  moment the user stops talking. */
export function useVoiceDraft(
  draft: string,
  setDraft: (updater: (d: string) => string) => void,
) {
  const rec = useSpeechRecognition();
  const committedRef = useRef("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external async event (speech result) → state sync
    if (rec.state === "listening") return;
    const final = rec.transcript.trim();
    if (!final || final === committedRef.current) return;
    committedRef.current = final;
    setDraft((d) => (d ? `${d} ${final}`.trim() : final));
  }, [rec.state, rec.transcript, setDraft]);

  const live = rec.state === "listening" ? `${rec.transcript} ${rec.interim}`.trim() : draft;
  return { rec, live };
}

/* ── Recorder: MediaRecorder for shadowing A/B compare ────────────────────── */

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      chunksRef.current = [];
      m.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      m.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      m.start();
      mediaRef.current = m;
      setRecording(true);
      setUrl(null);
    } catch {
      alert("Microphone access is required for shadowing.");
    }
  }, []);

  const stop = useCallback(() => {
    mediaRef.current?.stop();
    setRecording(false);
  }, []);

  const reset = useCallback(() => setUrl(null), []);

  return { recording, url, start, stop, reset };
}
