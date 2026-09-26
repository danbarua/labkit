/**
 * The record's daemon serves one PGlite session to every client, so each client's tenant and role
 * must be its own however their exchanges interleave.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import { openPglite } from "@labkit/core-db/backend";
import { runMigrations } from "@labkit/core-db/migrate";
import { APP_ROLE } from "@labkit/core-db/schema";
import { TENANT_SETTING } from "@labkit/core-db/scoped";
import { hostPGlite, type WireHost } from "@labkit/core-db/wire-host";

let dir: string;
let db: PGlite;
let host: WireHost;
let socketDir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "labkit-daemon-"));
  db = await openPglite(join(dir, "pglite"));
  await runMigrations(db);
  socketDir = mkdtempSync(join("/tmp", "lkd-"));
  host = await hostPGlite(db, join(socketDir, ".s.PGSQL.5432"));
});

afterAll(async () => {
  await host.close();
  await db.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(socketDir, { recursive: true, force: true });
});

/** A client set up the way every LabKit session sets itself up, scoped to `tenant`. */
async function scoped(tenant: string): Promise<Client> {
  const client = new Client({
    host: socketDir,
    port: 5432,
    user: "postgres",
    database: "postgres",
  });
  client.on("error", () => {});
  await client.connect();
  await client.query(`LOAD 'age'`);
  await client.query(`SET search_path = ag_catalog, "$user", public`);
  await client.query(`SELECT set_config($1, $2, false)`, [TENANT_SETTING, tenant]);
  await client.query(`SET ROLE ${APP_ROLE}`);
  return client;
}

test("two tenants interleaved each see only their own tenant and role", async () => {
  const seen: string[] = [];
  const run = async (tenant: string) => {
    const client = await scoped(tenant);
    for (let i = 0; i < 60; i++) {
      const inTransaction = i % 3 === 0;
      if (inTransaction) await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT current_user AS who, current_setting($1, true) AS tenant WHERE $2::int >= 0`,
        [TENANT_SETTING, i],
      );
      seen.push(`${tenant}:${rows[0].who}:${rows[0].tenant}`);
      if (inTransaction) await client.query("COMMIT");
    }
    await client.end();
  };
  await Promise.all([run("4"), run("6")]);
  expect(seen.length).toBe(120);
  expect(seen.filter((s) => s !== `4:${APP_ROLE}:4` && s !== `6:${APP_ROLE}:6`)).toEqual([]);
});

test("a client that connects after another has scoped itself starts unscoped", async () => {
  const first = await scoped("4");
  // `LOAD` is refused to the unprivileged role, so this fails if the session kept the first
  // client's role.
  const second = await scoped("6");
  const { rows } = await second.query(`SELECT current_setting($1, true) AS tenant`, [
    TENANT_SETTING,
  ]);
  expect(rows[0].tenant).toBe("6");
  await first.end();
  await second.end();
});
