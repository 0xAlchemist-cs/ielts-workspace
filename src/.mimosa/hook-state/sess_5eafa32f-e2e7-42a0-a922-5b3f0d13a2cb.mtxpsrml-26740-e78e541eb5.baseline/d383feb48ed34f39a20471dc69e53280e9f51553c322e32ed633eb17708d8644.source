/** English count + noun pluralization — one helper for the whole product.
 *  Always use this for user-visible `${count} noun` strings; handwritten
 *  per-site conditionals drift into "1 items" bugs.
 *
 *    plural(1, "item")           → "1 item"
 *    plural(5, "expression")     → "5 expressions"
 *    plural(2, "quiz", "quizzes") → "2 quizzes"   (irregular: pass plural)
 *
 *  For inline suffixes inside longer templates use s():
 *    `${n} item${s(n)} need${n === 1 ? "" : "s"} attention` */
export function plural(n: number, one: string, many?: string): string {
  const word = n === 1 ? one : (many ?? `${one}s`);
  return `${n} ${word}`;
}

/** Plural suffix only: s(1) → "", s(2) → "s". */
export function s(n: number): string {
  return n === 1 ? "" : "s";
}
