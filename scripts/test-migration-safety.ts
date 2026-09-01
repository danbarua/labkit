#!/usr/bin/env bun
/**
 * Restores a snapshot, then proves a real migration run cannot lose rows off
 * a populated record. #129.
 *
 * `check:migrations` lints `drizzle/*.sql` for destructive DDL, but nothing
 * runs a migration against a database that has real data in it -- a
 * migration that is clean by lint and loses rows on a populated record is
 * the case nobody has watched for. This is that watcher: restore, count,
 * migrate forward, count again, refuse to differ.
 *
 * **The "before" count is taken without migrating**, from a raw connection
 * to the freshly-restored data directory -- `connectDb`'s own pglite backend
 * runs migrations as part of connecting (`src/db/backend.ts`'s
 * `pgliteBackend`), so the only way to see the record *before* that run is
 * to not go through it. It still calls `bootstrapSession` (`LOAD 'age'` plus
 * `search_path`) directly, which is session setup and not a migration --
 * without it AGE's own types aren't visible yet and every Cypher query fails
 * with `type "agtype" does not exist`. The "after" count goes through
 * `connectDb` normally, which is where migrations actually run forward. A
 * snapshot already at the current schema makes this comparison a no-op every
 * time it passes -- which is the state a healthy check sweep is in until a
 * migration ever manages to lose something. It stays worth having for the
 * migration that doesn't.
 *
 * Not a `check:` script: it needs a real snapshot file
 * (`scripts/snapshot-record.ts`) that `bun run check` cannot assume exists,
 * the same reason `test:pg` needs a container. Run it by hand when you add a
 * migration, pointed at whatever `~/labkit-snapshots/` holds.
 *
 * Usage:
 *   bun scripts/test-migration-safety.ts --snapshot <path.tar.gz> [--tenant labkit]
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { age, pgliteAssets } from "../src/db/extensions";
import { transactor } from "../src/db/transactor";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { connectDb } from "../src/db/connect";
import { pgEventLog } from "../src/domain/event-store";
import { NODE_LABELS, EDGE_LABELS } from "../src/db/domain";
import { scalar } from "../src/db/cypher";
import { bootstrapSession, type LabKitDB } from "../src/db/backend";

const args = process.argv.slice(2);
const value = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
};

const snapshotPath = value("--snapshot");
if (!snapshotPath) {
  console.error(
    "labkit: --snapshot <path.tar.gz> is required -- name the fixture, don't guess one",
  );
  process.exit(1);
}
const tenant = value("--tenant", "labkit") as string;

interface Counts {
  events: number;
  nodes: number;
  edges: number;
}

async function countGraph(graph: TenantGraph): Promise<{ nodes: number; edges: number }> {
  let nodes = 0;
  for (const label of NODE_LABELS) {
    const rows = await graph.query(`MATCH (n:${label}) RETURN count(n) AS total`, {
      total: scalar<number>(),
    });
    nodes += Number(rows[0]?.total ?? 0);
  }
  let edges = 0;
  for (const label of EDGE_LABELS) {
    const rows = await graph.query(`MATCH ()-[r:${label}]->() RETURN count(r) AS total`, {
      total: scalar<number>(),
    });
    edges += Number(rows[0]?.total ?? 0);
  }
  return { nodes, edges };
}

const scratchRoot = mkdtempSync(join(tmpdir(), "labkit-migration-safety-"));
try {
  const dataDir = join(scratchRoot, ".labkit", "pglite");
  mkdirSync(join(scratchRoot, ".labkit"));

  const file = Bun.file(snapshotPath);
  if (!(await file.exists())) {
    console.error(`labkit: ${snapshotPath} does not exist`);
    process.exit(1);
  }

  const restoring = new PGlite({
    dataDir,
    loadDataDir: file,
    extensions: { age },
    ...(await pgliteAssets()),
  });
  await restoring.waitReady;
  await restoring.close();

  // Before: a raw connection to the just-restored directory, deliberately
  // not through `connectDb` -- see this file's header on why that is the
  // only way to see the record before its own backend migrates it.
  const raw = new PGlite({ dataDir, extensions: { age }, ...(await pgliteAssets()) });
  await raw.waitReady;
  const rawDb: LabKitDB = {
    query: (sql, params, opts) => raw.query(sql, params as unknown[], opts),
  };
  // Session-level only -- LOAD 'age' and search_path, not a migration. What
  // this deliberately skips is `runMigrations`, so this connection sees the
  // record exactly as the snapshot restored it.
  await bootstrapSession(rawDb);
  const rawTx = transactor(rawDb);
  const before: Counts = await (async () => {
    const ctx = await resolveTenantContext(rawDb, rawTx, tenant);
    await scopeToTenant(rawDb, ctx);
    const graph = new TenantGraph(ctx, rawDb, rawTx);
    const events = await pgEventLog(rawDb, ctx.tenantId).all();
    const { nodes, edges } = await countGraph(graph);
    return { events: events.length, nodes, edges };
  })();
  await raw.close();

  // After: the real connection path, which is where migrations actually run.
  const connection = await connectDb(scratchRoot);
  const after: Counts = await (async () => {
    const ctx = await resolveTenantContext(connection.db, connection.tx, tenant);
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const events = await pgEventLog(connection.db, ctx.tenantId).all();
    const { nodes, edges } = await countGraph(graph);
    return { events: events.length, nodes, edges };
  })();
  await connection.close();

  console.log(`labkit: before ${JSON.stringify(before)}`);
  console.log(`labkit: after  ${JSON.stringify(after)}`);

  const lost = (Object.keys(before) as (keyof Counts)[]).filter((k) => before[k] !== after[k]);
  if (lost.length > 0) {
    console.error(
      `FAILED: migrating ${snapshotPath} forward changed ${lost.map((k) => `${k} ${before[k]} -> ${after[k]}`).join(", ")}`,
    );
    process.exit(1);
  }
  console.log(`OK: migrating ${snapshotPath} forward changed nothing (${JSON.stringify(after)})`);
} finally {
  rmSync(scratchRoot, { recursive: true, force: true });
}
