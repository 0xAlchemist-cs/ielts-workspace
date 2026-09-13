import type { DrillInput, DrillSet } from "@/lib/types";

/** Deterministic offline drill frames — generic but honest (MockBadge shows).
 * Every blank expects the error's correctForm, so the pattern is re-tested
 * even without a live model. */
export function mockDrills(input: DrillInput): DrillSet {
  const cf = input.correctForm.trim();
  const frames = [
    { context: "In my last job, I had to ____ almost every single day.", scene: "at work" },
    { context: "If you want to see real progress this year, you should ____ regularly.", scene: "giving advice" },
    { context: "Most people find it hard to ____ at first — that is completely normal.", scene: "talking about habits" },
  ];
  return { items: frames.map((f) => ({ ...f, answer: cf })), isMock: true };
}
