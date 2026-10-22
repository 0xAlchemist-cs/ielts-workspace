import type { ReviewMode } from "@/lib/types";

/* ── Served-review credentials ──────────────────────────────────────────────
 * When generateReviewQueue serves a card, the server decides its format.
 * That decision is a credential: the /api/review/answer boundary only
 * accepts a submission whose mode matches what was actually served (or, for
 * embeds like read/listen labs and the welcome flow, a plain production
 * card). Privileged modes (context_transfer, audio_retrieval,
 * retention_check) can never be claimed out of thin air.
 *
 * Process-local by design (single-user local-first app, one Next.js
 * process); survives dev hot reloads via the globalThis singleton — the
 * same trick src/db/index.ts uses. A server restart simply empties the
 * ledger: the client re-pulls the queue and gets fresh credentials. */

const TTL_MS = 24 * 86_400_000;

interface ServedEntry {
  mode: ReviewMode;
  servedAt: number;
}

const globalForLedger = globalThis as unknown as {
  __ieltsServedReviews?: Map<string, ServedEntry>;
};
const ledger: Map<string, ServedEntry> = (globalForLedger.__ieltsServedReviews ??= new Map());

const key = (userId: number, retrievalItemId: number) => `${userId}:${retrievalItemId}`;

/** Record (or refresh) the format a queue entry was served in. */
export function recordServedReview(userId: number, retrievalItemId: number, mode: ReviewMode): void {
  // opportunistic sweep — stale entries otherwise pin memory across sessions
  if (ledger.size > 500) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of ledger) if (v.servedAt < cutoff) ledger.delete(k);
  }
  ledger.set(key(userId, retrievalItemId), { mode, servedAt: Date.now() });
}

/** The format this item was last served in, if still fresh. */
export function peekServedReview(userId: number, retrievalItemId: number): ReviewMode | null {
  const e = ledger.get(key(userId, retrievalItemId));
  if (!e) return null;
  if (Date.now() - e.servedAt > TTL_MS) {
    ledger.delete(key(userId, retrievalItemId));
    return null;
  }
  return e.mode;
}

/** Consume the credential after a successful graded submission — the same
 *  card cannot be replayed as a privileged mode a second time. */
export function consumeServedReview(userId: number, retrievalItemId: number): void {
  ledger.delete(key(userId, retrievalItemId));
}
