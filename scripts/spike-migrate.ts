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

const client = new Client({ connectionString: url });
await client.connect();
try {
  await runMigrationsOnPostgres(client);
  console.error(`spike-migrate: OK — ${url.replace(/:[^:@/]*@/, ":***@")}`);
} finally {
  await client.end();
}
