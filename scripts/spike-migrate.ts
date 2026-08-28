#!/usr/bin/env bun
/**
 * Migrates the Postgres `LABKIT_DB_URL` points at, once, before any server starts.
 *
 * **A separate script because that is what the design says it is.**
 * `directPostgresBackend` deliberately does not migrate on connect (PJ-004,
 * argued at `src/db/backend.ts`): with N processes connecting concurrently and
 * nothing serialising them, migrating there would be a race. Against that
 * backend migrations are an out-of-band deploy step.
 *
 * The embedded backend does migrate on connect, because it holds an exclusive
 * lock and is one writer by construction — which is why nobody running LabKit
 * locally has ever had to think about this, and why the first thing an HTTP
 * server against a fresh container does is fail with
 * `relation "tenants" does not exist`. Found exactly that way on 2026-08-28,
 * three tool calls into the first run.
 *
 * Idempotent: drizzle skips what is already applied, so running it again is
 * free and re-running it in an entrypoint is fine.
 *
 *   LABKIT_DB_URL=postgres://postgres:agens@127.0.0.1:5432/labkit_spike \
 *     bun scripts/spike-migrate.ts
 */

import { Client } from "pg";
import { runMigrationsOnPostgres } from "../src/db/migrate";

const url = process.env.LABKIT_DB_URL;
if (!url) {
  console.error("spike-migrate: LABKIT_DB_URL is required.");
  process.exit(2);
}

/**
 * Creates the database if it is not there yet.
 *
 * **Here rather than in `docker/postgres/initdb/`, and that is the image's rule
 * holding rather than being worked around.** That image may add only what a
 * developer would otherwise type by hand and *nothing LabKit depends on* — the
 * line `tests/tenancy-isolation.test.ts` and `bun run test:pg` against the raw
 * upstream image exist to hold. The spike's server genuinely depends on this
 * database, so putting it there would make the image a dependency and quietly
 * retire that guarantee.
 *
 * A deploy step creating the database it is about to migrate is ordinary, and
 * this is the deploy step. `CREATE DATABASE` cannot run inside a transaction
 * and takes no parameter, so the name is interpolated — from a URL the operator
 * supplied to their own server, checked against the identifier shape first
 * because interpolating into SQL is the pattern the rest of this repo removed.
 */
async function ensureDatabase(target: string): Promise<void> {
  const name = new URL(target).pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`spike-migrate: refusing an unusual database name: ${name}`);
  }
  const admin = new Client({ connectionString: new URL("/postgres", target).toString() });
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE ${name}`);
      console.error(`spike-migrate: created database ${name}`);
    }
  } finally {
    await admin.end();
  }
}

await ensureDatabase(url);

const client = new Client({ connectionString: url });
await client.connect();
try {
  await runMigrationsOnPostgres(client);
  console.error(`spike-migrate: OK — ${url.replace(/:[^:@/]*@/, ":***@")}`);
} finally {
  await client.end();
}
