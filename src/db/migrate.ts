import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { embeddedMigrations } from "./migrations";

/**
 * Applies every migration in `drizzle/` (both drizzle-kit-generated and
 * hand-written `--custom` files, interleaved in one journal) that hasn't
 * already run against `db`. Idempotent — safe to call on an already-migrated
 * database.
 *
 * Only ever called by the connection that owns exclusive write access for
 * its backend strategy (see src/db/backend.ts) — under PGlite leader
 * election, that's the election winner, and only the winner ever reaches
 * this call site, so there is no concurrent-writer race on the migration
 * ledger to reason about here.
 *
 * **This is `drizzle-orm/pglite/migrator`'s `migrate()` with its first line
 * replaced.** That function is two statements: read the folder off disk, then
 * hand the result to the dialect. The first cannot work inside a compiled
 * binary — see `./migrations.ts` for what that cost — so the migrations come
 * from there and the second statement is called directly.
 *
 * `dialect` and `session` are typed `private`, hence the cast, and that is the
 * honest cost of this. The alternative was writing the embedded files to a
 * temporary directory at runtime so the public `migrate()` could read them
 * back, which trades one cast for a read-only-`/tmp` failure mode, a cleanup
 * path, and a shared-path race between two binaries. What makes the cast safe
 * *here* is that `setupTestDb()` calls this at every suite boot: a drizzle
 * upgrade that renames either field reddens the entire suite on the next
 * `bun test` rather than surfacing in something shipped.
 *
 * `dialect.migrate` reads only `migrationsTable` and `migrationsSchema` from
 * its third argument, so the empty object is the whole of what it wants — not a
 * placeholder standing in for a folder path.
 */
export async function runMigrations(db: PGlite): Promise<void> {
  const orm = drizzle(db) as unknown as {
    dialect: { migrate(migrations: unknown, session: unknown, config: unknown): Promise<void> };
    session: unknown;
  };
  await orm.dialect.migrate(embeddedMigrations(), orm.session, {});
}
