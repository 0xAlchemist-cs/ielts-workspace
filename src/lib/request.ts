/** Route-body hardening shared by the AI endpoints: malformed JSON → null
 *  (never a 500 from req.json()), string type coercion, and a length cap so
 *  oversized payloads can't ride the paid API. */

export async function readJsonBody<T extends Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Returns the string field, or null when missing / wrong type / over cap. */
export function stringField(
  body: Record<string, unknown> | null,
  key: string,
  maxChars: number,
): string | null {
  const v = body?.[key];
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > maxChars) return null;
  return s;
}

export function badRequest(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
