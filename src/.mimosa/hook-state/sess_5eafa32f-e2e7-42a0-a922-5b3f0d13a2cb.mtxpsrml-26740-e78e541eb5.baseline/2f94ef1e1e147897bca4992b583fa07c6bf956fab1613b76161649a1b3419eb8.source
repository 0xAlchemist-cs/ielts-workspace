/** Client-safe listening taxonomy labels (no server imports). */
export type MissCategory =
  | "unknown" // A: vocabulary unknown
  | "known_not_recognized" // B: knows the word, couldn't hear it
  | "connected_speech" // C: linking fused the words
  | "weak_form" // D: weak form hid the word
  | "reduction" // E: gonna/wanna etc.
  | "speed" // F: too fast overall
  | "attention" // G: drifted
  | "meaning_integration"; // H: heard the words, missed the meaning

export const MISS_LABELS: Record<MissCategory, { en: string; zh: string }> = {
  unknown: { en: "Don't know the word", zh: "根本不认识这个词" },
  known_not_recognized: { en: "Know it, but couldn't hear it", zh: "认识，但没听出来" },
  connected_speech: { en: "Words ran together", zh: "连读粘在一起了" },
  weak_form: { en: "Weak form hid it", zh: "弱读吞掉了" },
  reduction: { en: "Reduced (gonna/wanna)", zh: "缩读变形了" },
  speed: { en: "Too fast overall", zh: "整体语速太快" },
  attention: { en: "Attention drifted", zh: "走神了" },
  meaning_integration: { en: "Heard the words, missed the meaning", zh: "词都听到了，句意没接住" },
};
