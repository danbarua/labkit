import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { Client } from "pg";

import { embeddedMigrations } from "./migrations";

/**
 * What `migrate()` reaches for once the folder has been read.
 *
 * `dialect` and `session` are typed `private` on drizzle's ORM object, hence
 * the cast. That is the honest cost of {@link applyEmbedded}, and it is the
 * same cost on both dialects.
 */
interface MigratableOrm {
  dialect: { migrate(migrations: unknown, session: unknown, config: unknown): Promise<void> };
  session: unknown;
}

/**
 * **`migrate()` with its first line replaced.**
 *
 * Drizzle's migrator — either dialect's — is two statements: read the folder
 * off disk, then hand the result to the dialect. The first cannot work inside a
 * compiled binary (see `./migrations.ts` for what that cost), so the migrations
 * come from there and the second statement is called directly.
 *
 * What makes the cast safe is that `setupTestDb()` calls this at every suite
 * boot: a drizzle upgrade that renames either field reddens the entire suite on
 * the next `bun test` rather than surfacing in something shipped.
 *
 * `dialect.migrate` reads only `migrationsTable` and `migrationsSchema` from
 * its third argument, so the empty object is the whole of what it wants — not a
 * placeholder standing in for a folder path.
 */
async function applyEmbedded(orm: MigratableOrm): Promise<void> {
  await orm.dialect.migrate(embeddedMigrations(), orm.session, {});
}

/**
 * Applies every migration in `drizzle/` (both drizzle-kit-generated and
 * hand-written `--custom` files, interleaved in one journal) that hasn't
 * already run against `db`. Idempotent — safe to call on an already-migrated
 * database, and cheap: a no-op run is 2ms (measured 2026-08-26), which is what
 * makes running it on every open affordable.
 *
 * The exclusive lock in `src/db/backend.ts` is held across this call, so there
 * is no concurrent-writer race on the migration ledger to reason about here.
 */
export async function runMigrations(db: PGlite): Promise<void> {
  await applyEmbedded(drizzlePglite(db) as unknown as MigratableOrm);
}

/**
 * The same migrations, against a real Postgres.
 *
 * **Deliberately not called by `directPostgresBackend`.** With no lock and N
 * processes connecting concurrently, migrating on connect would be a race;
 * against that backend migrations are an out-of-band deploy step run once
 * before any LabKit process starts. This exists for the callers that
 * *are* that step: `tests/helpers/db.ts` when `LABKIT_DB_URL` points it at a
 * container, and anyone migrating a database by hand.
 *
 * `node-postgres` rather than `pg-proxy` because the migrator wants a real
 * session to run its transaction on.
 */
export async function runMigrationsOnPostgres(client: Client): Promise<void> {
  // drizzle's node-postgres overload wants its own client union; a `pg.Client`
  // satisfies it structurally and the cast is the same shape as the one above.
  await applyEmbedded(drizzlePg(client as never) as unknown as MigratableOrm);
}
