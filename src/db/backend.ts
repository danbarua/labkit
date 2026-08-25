import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { age } from "@electric-sql/pglite-age";
import { Client } from "pg";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { bootstrapSession, type LabKitDB } from "./client";
import { runMigrations } from "./migrate";

export interface LabKitDBConnection {
  db: LabKitDB;
  role: "primary" | "secondary";
  close(): Promise<void>;
}

/**
 * Where the data lives and how a process gets access to it, decoupled from
 * "run migrations once" (src/db/migrate.ts) and from "how does LabKit talk
 * to the graph once connected" (src/db/graph.ts). `connect.ts` picks one of
 * these based on how LabKit is configured to run.
 */
export interface DbBackend {
  connect(): Promise<LabKitDBConnection>;
}

async function openPglite(dataDir: string): Promise<PGlite> {
  return new PGlite({ dataDir, extensions: { vector, age } });
}

async function tryClient(host: string, port: number): Promise<Client> {
  const client = new Client({
    host,
    port,
    database: "postgres",
    user: "postgres",
  });
  await client.connect();
  return client;
}

async function waitForClient(host: string, port: number, timeoutMs = 10_000): Promise<Client> {
  const start = Date.now();
  for (;;) {
    try {
      return await tryClient(host, port);
    } catch (_err) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timed out waiting for ledger primary to start listening on ${host}:${port}`,
        );
      }
      await Bun.sleep(25);
    }
  }
}

/**
 * PID lockfile, exactly Postgres's own `postmaster.pid` mechanism: atomic
 * exclusive-create (`wx`) is the mutex — no check-then-act race, unlike
 * `existsSync` followed by a separate open. If the lock file already
 * exists, read the PID inside and check whether that process is still
 * alive; if not, it's a stale lock from a crash and gets reclaimed.
 */
function acquirePrimaryLock(lockPath: string): boolean {
  try {
    const fd = openSync(lockPath, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;
    try {
      const pid = Number(readFileSync(lockPath, "utf8").trim());
      process.kill(pid, 0); // throws if not running; no throw = alive
      return false;
    } catch (checkErr: any) {
      if (checkErr.code === "ESRCH") {
        // Holder is dead — stale lock, reclaim it.
        unlinkSync(lockPath);
        return acquirePrimaryLock(lockPath);
      }
      // EPERM or anything else ambiguous: don't steal the lock.
      return false;
    }
  }
}

function releasePrimaryLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // already gone — fine
  }
}

/**
 * Postmaster/client election over an embedded, single-writer PGlite file,
 * "just like Postgres itself": the first process to win the PID-lockfile
 * race becomes primary — it owns the real PGlite instance and serves it
 * over pglite-socket (real Postgres wire protocol). Every other process
 * connects as a plain `pg` client instead, either immediately (primary
 * already listening) or after a short poll (primary still starting up).
 *
 * Migration invariant: only the election winner ever reaches
 * `runMigrations()`, and it does so before starting the socket server —
 * losers only ever connect to an already-migrated primary and never call
 * it, so there is no concurrent-writer race on the migration ledger to
 * reason about under this strategy.
 *
 * Election is a PGlite-specific concern (PGlite is single-writer/
 * single-process) — `directPostgresBackend` below has no election at all,
 * because a real Postgres server is already the single source of truth
 * every process can connect to directly.
 */
export function pgliteLeaderElectionBackend(opts: {
  dataDir: string;
  lockPath: string;
  port: number;
  host: string;
}): DbBackend {
  const { dataDir, lockPath, port, host } = opts;

  return {
    async connect(): Promise<LabKitDBConnection> {
      const lockDir = dirname(lockPath);
      if (!existsSync(lockDir)) mkdirSync(lockDir, { recursive: true });

      // Fast path: someone's already primary and listening.
      try {
        const client = await tryClient(host, port);
        await bootstrapSession(client);
        return { db: client, role: "secondary", close: () => client.end() };
      } catch {
        // fall through to the election
      }

      if (!acquirePrimaryLock(lockPath)) {
        // Someone else holds the lock (mid-startup or already primary) —
        // never open PGlite ourselves; wait for them to be reachable instead.
        const client = await waitForClient(host, port);
        await bootstrapSession(client);
        return { db: client, role: "secondary", close: () => client.end() };
      }

      try {
        const rawDb = await openPglite(dataDir);
        await runMigrations(rawDb);
        await bootstrapSession(rawDb);

        // maxConnections defaults to 1 (no concurrency) in this library — we
        // need at least 2 (the primary's own selfClient, plus every secondary).
        const server = new PGLiteSocketServer({
          db: rawDb,
          port,
          host,
          maxConnections: 16,
        });
        await server.start();
        const selfClient = await tryClient(host, port);
        await bootstrapSession(selfClient);
        return {
          db: selfClient,
          role: "primary",
          close: async () => {
            await selfClient.end();
            await server.stop();
            await rawDb.close();
            releasePrimaryLock(lockPath);
          },
        };
      } catch (err) {
        releasePrimaryLock(lockPath);
        throw err;
      }
    },
  };
}

/**
 * Connects directly to a real (local or cloud) Postgres — no leader
 * election, since Postgres itself is already the single writer every
 * process can reach concurrently. `role` is kept for interface uniformity
 * with the PGlite strategy but is meaningless here: every process is
 * symmetric.
 *
 * Migrations are deliberately NOT run by this backend (decided 2026-08-17,
 * see docs/project-journal/002_schema_dot_ts.md) — with no election, N
 * processes connecting concurrently would race `runMigrations()` with no
 * guard. For now that's out of scope: migrations against this backend are
 * an out-of-band `bun run db:migrate`-style deploy step, run once before any
 * LabKit process starts. A `pg_advisory_lock`-guarded in-process migration
 * would be the alternative if that stops being good enough.
 */
export function directPostgresBackend(opts: { connectionString: string }): DbBackend {
  return {
    async connect(): Promise<LabKitDBConnection> {
      const client = await tryClientAt(opts.connectionString);
      await bootstrapSession(client);
      return { db: client, role: "primary", close: () => client.end() };
    },
  };
}

async function tryClientAt(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}
