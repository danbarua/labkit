#!/usr/bin/env bun
/**
 * Applies core's migrations to the Postgres database `LABKIT_DB_URL` names. Safe to re-run.
 * The API never migrates, so this runs out of band, before it starts.
 */

import { runMigrationsOnPostgres } from "@labkit/core-db/migrate";
import { Client } from "pg";
import pkg from "../../../package.json" with { type: "json" };

const VERSION = pkg.version;

const url = process.env.LABKIT_DB_URL;
if (!url) {
  console.error("LABKIT_DB_URL must name the database to migrate.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS age");
  await runMigrationsOnPostgres(client);
  // Later statements in this session can name drizzle's tables without the schema.
  await client.query(`SET search_path = ag_catalog, "$user", public, drizzle`);
} finally {
  await client.end();
}

const { host, pathname } = new URL(url);
console.error(`migrated ${pathname.slice(1)} on ${host} with labkit ${VERSION}`);
