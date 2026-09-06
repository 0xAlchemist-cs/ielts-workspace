import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { contents } from "../src/db/schema";
import { contentFingerprint } from "../src/server/services/content-selection";

/* One-shot: backfill contents.fingerprint for the import-dedup guard.
 * Run: npx tsx scripts/backfill-content-fingerprints.ts */

async function main() {
  const rows = await db.select({ id: contents.id, body: contents.body }).from(contents);
  let filled = 0;
  let dupes = 0;
  const seen = new Map<string, number>();
  for (const r of rows) {
    const fp = contentFingerprint(r.body);
    const existing = seen.get(fp);
    if (existing !== undefined) {
      dupes++;
      console.log(`DUPLICATE body: content ${r.id} matches ${existing} — left in place, fingerprint set`);
    }
    seen.set(fp, r.id);
    await db.update(contents).set({ fingerprint: fp }).where(eq(contents.id, r.id));
    filled++;
  }
  console.log(`fingerprints set: ${filled}, duplicate bodies detected: ${dupes}`);
  process.exit(0);
}
void main();
