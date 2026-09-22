/**
 * The whole record as one SQL file, and a record from one.
 *
 * SQL is the portable form: what an embedded PGlite writes, a real Postgres reads, and the
 * other way round. A PGlite data directory is a 32-bit WASM cluster image and opens nowhere
 * else.
 */

import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import { Client } from "pg";
import { type LabKitDBConnection, openPglite } from "./backend";
import { APP_ROLE } from "./schema";

/**
 * AGE's `graphid` type has no text input: its input function always throws, so a `pg_dump`
 * of a graph cannot be read back by anything. Its one constructor is `_graphid(label, entry)`,
 * the two halves of the 64-bit value. Every graph table inherits `_ag_label_vertex` (`id`) or
 * `_ag_label_edge` (`id`, `start_id`, `end_id`), so those are the leading columns of each row.
 */
function restorable(dump: string): string {
  // `pg_dump` brackets its output in `\restrict` / `\unrestrict`, which only psql reads.
  const sql = dump.replace(/^\\(?:un)?restrict\b.*\r?\n?/gm, "");
  const arity = new Map<string, number>();
  for (const m of sql.matchAll(
    /^CREATE TABLE (\S+) \([\s\S]*?\)\nINHERITS \(\S+\._ag_label_(vertex|edge)\);/gm,
  ))
    arity.set(m[1]!, m[2] === "vertex" ? 1 : 3);
  const graphid = (literal: string): string => {
    const n = BigInt(literal);
    return `ag_catalog._graphid(${n >> 48n}, ${n & 0xffffffffffffn})`;
  };
  const rows = sql.replace(
    /^INSERT INTO (\S+) VALUES \(((?:'\d+', ){0,2}'\d+')/gm,
    (line, table, ids) => {
      const count = arity.get(table);
      if (count === undefined) return line;
      const rewritten = (ids as string)
        .split(", ")
        .slice(0, count)
        .map((q) => graphid(q.slice(1, -1)));
      const rest = (ids as string).split(", ").slice(count);
      return `INSERT INTO ${table} VALUES (${[...rewritten, ...rest].join(", ")}`;
    },
  );

  // A graph's id in `ag_graph` is its schema's OID, and `ag_label.graph` repeats it. The
  // dump carries the old cluster's number, so both are re-read from the schema's name.
  const schemaOf = new Map<string, string>();
  for (const m of rows.matchAll(
    /^INSERT INTO ag_catalog\.ag_graph VALUES \((\d+), '[^']*', '([^']*)'\);/gm,
  ))
    schemaOf.set(m[1]!, m[2]!);
  const byName = (oid: string): string => {
    const schema = schemaOf.get(oid);
    return schema === undefined ? oid : `'${schema}'::regnamespace::oid`;
  };
  return rows
    .replace(
      /^(INSERT INTO ag_catalog\.ag_graph VALUES \()(\d+)/gm,
      (_, head, oid) => `${head}${byName(oid)}`,
    )
    .replace(
      /^(INSERT INTO ag_catalog\.ag_label VALUES \('[^']*', )(\d+)/gm,
      (_, head, oid) => `${head}${byName(oid)}`,
    );
}

/**
 * `pg_dump` of the record behind an open connection, with rows as `INSERT` statements.
 */
export async function dumpSql(connection: LabKitDBConnection): Promise<string> {
  if (connection.pglite) return restorable(await (await pgDump({ pg: connection.pglite })).text());
  throw new Error("dumpSql: this connection is not PGlite; dump a real Postgres with pg_dump");
}

/**
 * `pg_dump` of a real Postgres, through the binary on `PATH`.
 */
export async function dumpPostgres(connectionString: string): Promise<string> {
  const proc = Bun.spawn(["pg_dump", "--inserts", "--no-owner", connectionString], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`pg_dump exited ${code}: ${err.trim()}`);
  return restorable(out);
}

/**
 * The role a dump's policies and grants name, which `pg_dump` never creates.
 */
const ENSURE_APP_ROLE = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
    CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER;
  END IF;
END $$`;

/**
 * A new PGlite record at `dataDir` holding what `sql` describes. The directory must not
 * already hold a cluster: the dump creates every schema and table, migrations included.
 */
export async function restoreInto(dataDir: string, sql: string): Promise<void> {
  const db = await openPglite(dataDir);
  try {
    await db.exec(ENSURE_APP_ROLE);
    await db.exec(sql);
  } finally {
    await db.close();
  }
}

/**
 * The same, into an empty database on a real Postgres.
 */
export async function restorePostgres(connectionString: string, sql: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(ENSURE_APP_ROLE);
    await client.query(sql);
  } finally {
    await client.end();
  }
}
