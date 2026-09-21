import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { Client } from "pg";

import pkg from "../../package.json" with { type: "json" };
import { embeddedMigrations } from "./migrations";
import { noteDecision } from "./trace";
import { labkitVersion } from "./version";

/** `drizzle-orm@0.45.2` — the range this was built against, not what is installed now. */
const MIGRATOR = `drizzle-orm@${pkg.dependencies["drizzle-orm"].replace(/^[\^~]/, "")}`;

/**
 * Copies drizzle's record of what it applied into `public.__migrations`, adding who applied
 * it. Same connection, same transaction as the migrations themselves.
 *
 * Rows already there are left alone, so running twice changes nothing. The version is decided
 * once per statement: a first run — our table empty — takes the column default, because those
 * migrations were applied by binaries nobody recorded.
 */
const RECORD_PROVENANCE = `
  INSERT INTO public.__migrations (id, migrator, hash, created_at, applied_at, labkit_version)
  SELECT d.id, $1, d.hash, to_timestamp(d.created_at / 1000.0), now(),
         CASE WHEN (SELECT count(*) FROM public.__migrations) = 0
              THEN '__UNKNOWN_VERSION__' ELSE $2 END
    FROM drizzle."__drizzle_migrations" d
  ON CONFLICT (hash) DO NOTHING`;

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
 * True when `public.__migrations` already holds every hash this build carries.
 *
 * One query instead of drizzle's read-and-compare, so the common case — a record that is
 * up to date — costs a single count rather than the migrator's own round trips. False
 * whenever the table is missing, which is every record before 0016.
 */
async function alreadyApplied(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
): Promise<boolean> {
  const hashes = embeddedMigrations().map((m) => m.hash);
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM public.__migrations WHERE hash = ANY($1::text[])`,
      [hashes],
    );
    const found = (rows[0] as { n: number } | undefined)?.n ?? 0;
    noteDecision("migrations", {
      embedded: hashes.length,
      found,
      skipped: found === hashes.length,
    });
    return found === hashes.length;
  } catch (e) {
    noteDecision("migrations", {
      embedded: hashes.length,
      skipped: false,
      why: (e as Error).message,
    });
    return false;
  }
}

/**
 * Applies every migration in `drizzle/` (both drizzle-kit-generated and hand-written `--custom`
 * files, interleaved in one journal) that hasn't already run against `db`.
 */
export async function runMigrations(db: PGlite): Promise<void> {
  if (await alreadyApplied((sql, params) => db.query(sql, params))) return;
  await applyEmbedded(drizzlePglite(db) as unknown as MigratableOrm);
  await db.query(RECORD_PROVENANCE, [MIGRATOR, labkitVersion()]);
}

/**
 * The same migrations, against a real Postgres.
 */
export async function runMigrationsOnPostgres(client: Client): Promise<void> {
  // drizzle's node-postgres overload wants its own client union; a `pg.Client`
  // satisfies it structurally and the cast is the same shape as the one above.
  if (await alreadyApplied((sql, params) => client.query(sql, params as unknown[]))) return;
  await applyEmbedded(drizzlePg(client as never) as unknown as MigratableOrm);
  await client.query(RECORD_PROVENANCE, [MIGRATOR, labkitVersion()]);
}
