# Database migrations (versioned, rehearsed, recoverable)

Since step-10 the schema is evolved through **versioned migrations** — never
by pointing `drizzle-kit push --force` at a database that matters.

## Pieces

| Piece | Role |
|---|---|
| `drizzle/` | Migration SQL + journal, committed to git. `0000_*.sql` is the idempotent baseline (`CREATE ... IF NOT EXISTS`) — it initializes a fresh install AND adopts an existing pre-migration database without rebuilding anything. |
| `scripts/db-migrate.mjs` | The runner: refuses the production path without `--yes-production` (before opening anything), writes a `*.pre-migrate-*.snapshot` (VACUUM INTO) next to the target, applies pending migrations (journal-deduplicated), verifies `integrity_check`. |
| `scripts/db-push-guard.mjs` | Blocks `db:push` when `data/app.db` already exists. Fresh checkouts (CI bootstrap) pass through. |
| `scripts/verify-db-migrations.ts` | Regression suite: fresh init, forward upgrade with data intact, idempotent re-runs, snapshot rollback, production refusal, push guard. |

## Changing the schema (developer workflow)

1. Edit `src/db/schema.ts`.
2. `npx drizzle-kit generate` → review the generated SQL in `drizzle/`.
   New migrations are normal (non-idempotent) increments — only the 0000
   baseline is `IF NOT EXISTS`.
3. Rehearse on a copy:
   ```bash
   cp data/app.db data/test-fixtures/rehearsal.db
   node scripts/db-migrate.mjs --db data/test-fixtures/rehearsal.db
   # check integrity, row counts, the app against the copy
   ```
4. Apply for real, explicitly acknowledging the production path:
   ```bash
   node scripts/db-migrate.mjs --db data/app.db --yes-production
   ```
   A snapshot is written first — see rollback below.

## Rollback

Every run writes `<db>.pre-migrate-<timestamp>.snapshot` before touching
anything. To roll back: stop the app, copy the snapshot over the database
file, start the app. (The regression suite exercises exactly this.)

## Why the baseline is idempotent

The production database was kept in sync with `schema.ts` by years of
`db:push` (verified 2026-10: column-level diff is empty — only textual
column-order differences). An `IF NOT EXISTS` baseline therefore adopts the
existing database into the migration journal without any destructive diff,
and every future migration applies uniformly to old and new databases.

## CI

CI boots a fresh database (`npm run db:push` on an empty checkout — the
guard passes because no file exists yet), then runs the full gate including
`test:db-migrations`, which re-verifies fresh-init and forward-upgrade on
copies of whatever `data/app.db` the bootstrap produced.
