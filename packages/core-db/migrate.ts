import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { Client } from "pg";

import { embeddedMigrations } from "./migrations";

/**
 * What `migrate()` reaches for once the folder has been read.
 */
interface MigratableOrm {
  dialect: { migrate(migrations: unknown, session: unknown, config: unknown): Promise<void> };
  session: unknown;
}

/**
 * **`migrate()` with its first line replaced.**
 */
async function applyEmbedded(orm: MigratableOrm): Promise<void> {
  await orm.dialect.migrate(embeddedMigrations(), orm.session, {});
}

/**
 * Applies every migration in `drizzle/` (both drizzle-kit-generated and hand-written `--custom`
 * files, interleaved in one journal) that hasn't already run against `db`.
 */
export async function runMigrations(db: PGlite): Promise<void> {
  await applyEmbedded(drizzlePglite(db) as unknown as MigratableOrm);
}

/**
 * The same migrations, against a real Postgres.
 */
export async function runMigrationsOnPostgres(client: Client): Promise<void> {
  // drizzle's node-postgres overload wants its own client union; a `pg.Client`
  // satisfies it structurally and the cast is the same shape as the one above.
  await applyEmbedded(drizzlePg(client as never) as unknown as MigratableOrm);
}
