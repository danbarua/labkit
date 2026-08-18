import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PGlite } from "@electric-sql/pglite";

/**
 * Applies every migration in ./drizzle (both drizzle-kit-generated and
 * hand-written `--custom` files, interleaved in one journal) that hasn't
 * already run against `db`. Idempotent — safe to call on an already-migrated
 * database.
 *
 * Only ever called by the connection that owns exclusive write access for
 * its backend strategy (see src/db/backend.ts) — under PGlite leader
 * election, that's the election winner, and only the winner ever reaches
 * this call site, so there is no concurrent-writer race on the migration
 * ledger to reason about here.
 */
export async function runMigrations(db: PGlite): Promise<void> {
  await migrate(drizzle(db), { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
}
