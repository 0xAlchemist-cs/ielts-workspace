"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useSpeech } from "@/hooks/speech";
import { T } from "@/components/i18n";

/* Listen chip for the Today's expression card: plays the real recording when
 * the word has one (corpus vocab), else falls back to TTS so EVERY card can
 * be heard. Chip turns accent while playing — .chip-on convention.
 * The media element is JSX-mounted (React owns the ref — the compiler forbids
 * writing ref.current from handlers); replay-from-start is free because the
 * HTML media spec restarts ended elements on play(). */
export function ExpressionAudio({ text, audioUrl }: { text: string; audioUrl?: string | null }) {
  const [filePlaying, setFilePlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tts = useSpeech();
  const playing = audioUrl ? filePlaying : tts.speaking;
  const stopTts = tts.stop;

  useEffect(() => () => {
    // unmount mid-playback must not leave audio running in the background
    audioRef.current?.pause();
    stopTts();
  }, [stopTts]);

  const toggle = () => {
    if (playing) {
      audioRef.current?.pause();
      tts.stop();
      setFilePlaying(false);
      return;
    }
    if (audioUrl) {
      void audioRef.current?.play().catch(() => setFilePlaying(false));
    } else {
      tts.speak(text);
    }
  };

  return (
    <>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="none"
          onPlay={() => setFilePlaying(true)}
          onEnded={() => setFilePlaying(false)}
          onPause={() => setFilePlaying(false)}
          onError={() => setFilePlaying(false)}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label="Listen"
        className={`press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors duration-150 ${
          playing ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
        }`}
      >
        <Volume2 size={13} strokeWidth={2} />
        <T en="Listen" zh="听" />
      </button>
    </>
  );
}
