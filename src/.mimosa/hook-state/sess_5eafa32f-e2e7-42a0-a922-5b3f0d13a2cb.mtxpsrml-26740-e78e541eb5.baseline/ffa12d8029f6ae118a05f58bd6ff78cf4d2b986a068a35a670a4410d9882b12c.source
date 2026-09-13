import { contentTokens } from "@/lib/text";
import type { SpeechPhenomenon } from "@/lib/types";

/* ── Spoken-English analyzer: Written ↔ Natural speech ─────────────────────
 * Deterministic transform + annotation. Honest scope: this describes WHAT
 * happens in fast speech; it does not analyse any actual recording. */

interface Reduction {
  re: RegExp;
  span: string;
  spoken: string;
  note: string;
}

const REDUCTIONS: Reduction[] = [
  { re: /\bgoing to\b/gi, span: "going to", spoken: "gonna", note: "'going to' reduces to 'gonna' before a verb — the /t/ disappears entirely." },
  { re: /\bwant to\b/gi, span: "want to", spoken: "wanna", note: "'want to' → 'wanna': the /t/ and the vowel merge into one syllable." },
  { re: /\bhave to\b/gi, span: "have to", spoken: "hafta", note: "'have to' → 'hafta': the /v/ assimilates to /f/ before the /t/." },
  { re: /\bhas to\b/gi, span: "has to", spoken: "hasta", note: "'has to' → 'hasta', same /s/+/t/ fusion as 'hafta'." },
  { re: /\bkind of\b/gi, span: "kind of", spoken: "kinda", note: "'kind of' → 'kinda': the final /d/ links into the vowel." },
  { re: /\bsort of\b/gi, span: "sort of", spoken: "sorta", note: "'sort of' → 'sorta', same pattern as 'kinda'." },
  { re: /\blet me\b/gi, span: "let me", spoken: "lemme", note: "'let me' → 'lemme': the /t/ is dropped, vowels fuse." },
  { re: /\bgive me\b/gi, span: "give me", spoken: "gimme", note: "'give me' → 'gimme' in fast colloquial speech." },
  { re: /\bdon't know\b/gi, span: "don't know", spoken: "dunno", note: "'don't know' → 'dunno': the whole cluster collapses." },
  { re: /\bout of\b/gi, span: "out of", spoken: "outta", note: "'out of' → 'outta': final /t/ flaps, 'of' reduces to /ə/." },
  { re: /\bwhat are you\b/gi, span: "what are you", spoken: "whaddaya", note: "'what are you' → 'whaddaya': three weak words compress to two syllables." },
  { re: /\bdid you\b/gi, span: "did you", spoken: "didja", note: "'did you' → 'didja': /d/+/j/ palatalise to /dʒ/." },
  { re: /\bwould you\b/gi, span: "would you", spoken: "wouldja", note: "'would you' → 'wouldja', same /dʒ/ fusion." },
  { re: /\blots of\b/gi, span: "lots of", spoken: "lottsa", note: "'lots of' → 'lottsa': /ts/+/ə/ blend." },
  { re: /\bbecause\b/gi, span: "because", spoken: "'cause / cuz", note: "'because' usually shrinks to 'cause' in conversation." },
];

const WEAK_WORDS = new Set(["to", "for", "can", "and", "of", "at", "a", "the", "is", "are", "was", "that", "have", "has"]);

/** Written sentence → its natural fast-speech shape. */
export function naturalForm(sentence: string): string {
  let s = sentence;
  for (const r of REDUCTIONS) s = s.replace(r.re, r.spoken);
  // consonant-vowel linking hint: pick it up → pick‿it‿up is too noisy; keep reductions only
  return s;
}

/** Auto-annotate phenomena for any sentence (imported/real-audio content). */
export function autoPhenomena(sentence: string): SpeechPhenomenon[] {
  const out: SpeechPhenomenon[] = [];
  for (const r of REDUCTIONS) {
    if (r.re.test(sentence)) {
      r.re.lastIndex = 0;
      out.push({ type: "reduction", span: r.span, spoken: r.spoken, note: r.note });
    }
  }
  // weak forms: unstressed function words between content words
  const words = sentence.split(/\b/);
  for (const w of words) {
    const lw = w.toLowerCase();
    if (WEAK_WORDS.has(lw)) {
      out.push({
        type: "weak_form",
        span: w,
        spoken: `/${schwaOf(lw)}/`,
        note: `'${lw}' is unstressed here — it shrinks to a schwa, not the full vowel you learned.`,
      });
      break; // one example is enough per sentence
    }
  }
  // linking: word ending in consonant followed by word starting with a vowel
  const link = sentence.match(/\b([a-z]+[^aeiou\s])\s+([aeiou][a-z]*)\b/i);
  if (link) {
    out.push({
      type: "linking",
      span: `${link[1]} ${link[2]}`,
      spoken: `${link[1]}‿${link[2]}`,
      note: `Consonant-vowel linking: '${link[1]}' and '${link[2]}' join into one continuous sound — no pause between them.`,
    });
  }
  return out.slice(0, 3);
}

function schwaOf(w: string): string {
  const map: Record<string, string> = { to: "tə", for: "fə", can: "kən", and: "ən", of: "əv", at: "ət", a: "ə", the: "ðə", is: "z", are: "ər", was: "wəz", that: "ðət", have: "həv", has: "həz" };
  return map[w] ?? "ə";
}

/** Stress skeleton: content words carry the beat. */
export function stressLine(sentence: string): { display: string; stressed: string[] } {
  const stressed = contentTokens(sentence).slice(0, 4);
  const display = sentence
    .split(/(\s+)/)
    .map((tok) => {
      const clean = tok.toLowerCase().replace(/[^a-z'-]/g, "");
      return stressed.includes(clean) ? tok.toUpperCase() : tok;
    })
    .join("");
  return { display, stressed };
}

/** Simple, honest intonation description. */
export function intonationOf(sentence: string): { contour: "rising" | "falling"; note: string } {
  const trimmed = sentence.trim();
  if (trimmed.endsWith("?")) {
    return { contour: "rising", note: "Yes/no questions rise at the end; wh-questions usually fall — this one's pitch lifts on the last stressed word." };
  }
  if (/\bbut\b|\bhowever\b/i.test(sentence)) {
    return { contour: "falling", note: "Contrastive: the pitch peaks on the stressed word before 'but', then falls — the contrast lands on the stress, not the grammar." };
  }
  return { contour: "falling", note: "Statements fall on the final stressed word — the pitch drop is what signals 'I finished the thought'." };
}
