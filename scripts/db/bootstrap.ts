#!/usr/bin/env bun
/**
 * Prepares an empty Postgres for LabKit: the application role and every migration, which
 * includes the AGE extension. Idempotent: a database already prepared is left as it is.
 *
 *   bun db:bootstrap postgresql://user:pass@host:port/database
 */

import { Client } from "pg";
import { APP_ROLE } from "@labkit/core-db/schema";
import { runMigrationsOnPostgres } from "@labkit/core-db/migrate";

const url = process.argv[2];
if (!url) {
  console.error("usage: bun db:bootstrap postgresql://user:pass@host:port/database");
  process.exit(2);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
  if (role.rowCount === 0) {
    await client.query(`CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER`);
    console.log(`role ${APP_ROLE}: created`);
  } else console.log(`role ${APP_ROLE}: present`);

  const before = await client
    .query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")
    .then((r) => r.rows[0].n as number)
    .catch(() => 0);
  await runMigrationsOnPostgres(client);
  const after = await client
    .query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")
    .then((r) => r.rows[0].n as number);
  console.log(`migrations: ${after} applied (${after - before} new)`);

  const age = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'age'");
  console.log(`age: ${age.rows[0]?.extversion ?? "missing"}`);
  const database = url.replace(/\/\/[^@]*@/, "//");
  console.log(`${database}: ready`);
} finally {
  await client.end();
}
