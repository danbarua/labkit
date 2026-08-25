// scripts/probe-pglite-concurrency.ts
//
// Regression check for a confirmed, open upstream bug in pglite-socket's
// QueryQueueManager (electric-sql/pglite#1046): two connections issuing
// concurrent queries, where at least one errors (e.g. a unique-constraint
// violation), can permanently corrupt the connection(s) involved — a
// wire-protocol desync, or silently wrong rows. We reproduced this
// independently (2026-08-18) before finding it already tracked upstream;
// see .claude/skills/postgres-age/SKILL.md's "Upstream filing" for the
// full writeup. It's why tests/helpers/db.ts opens a fresh `pg.Client` per
// test instead of sharing one for a whole file — corruption is confirmed
// to stay contained to the connection that hit it, so a fresh connection
// per test contains the blast radius even though the underlying bug isn't
// fixed.
//
// **It is a probe, not a check, and the name says so.** It lived under
// `check:` until 2026-08-25 and had to be excluded by name from `bun run check`
// with a paragraph explaining why — a namespace where green means fine, holding
// one script where green means the bug is still there. Renaming it deleted the
// exclusion list rather than documenting it.
//
// Exit code semantics are inverted from a normal lint check:
//   exit 0 = the bug still reproduces. This is the EXPECTED, current
//            state — the workaround in tests/helpers/db.ts is still
//            necessary, nothing to do.
//   exit 1 = the bug did NOT reproduce. That's the interesting result:
//            @electric-sql/pglite-socket may have been fixed. Check the
//            installed version against electric-sql/pglite#1046, and if
//            it's genuinely fixed, tests/helpers/db.ts's per-connection
//            design (and this script's own docs) can be relaxed.
//
// Run manually / periodically, especially after bumping
// @electric-sql/pglite-socket — not wired into `bun test` or CI, since a
// passing (bug-fixed) run would otherwise look like a failure.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Client } from "pg";

const ITERATIONS = 40;

/**
 * The corruption this checks for doesn't always surface as a rejected
 * query promise — a desynced connection emits an unhandled `'error'`
 * event on the `Client` itself (e.g. "unexpected parseComplete message
 * from backend"), which Node/Bun would otherwise treat as an uncaught
 * exception. Tracking it via a flag on the client, checked between
 * iterations, is what makes that failure mode observable instead of
 * crashing this script.
 */
function watchForCorruption(c: Client): { corrupted(): boolean } {
  let corrupted = false;
  c.on("error", () => {
    corrupted = true;
  });
  return { corrupted: () => corrupted };
}

async function openClient(host: string, port: number): Promise<Client> {
  const c = new Client({ host, port, database: "postgres", user: "postgres" });
  await c.connect();
  return c;
}

async function insertOrIgnore(c: Client, v: string): Promise<void> {
  try {
    await c.query(`INSERT INTO t (v) VALUES ($1)`, [v]);
  } catch {
    // expected: unique-constraint violation from the losing side of the race
  }
}

async function main(): Promise<void> {
  const rawDb = new PGlite();
  const server = new PGLiteSocketServer({ db: rawDb, port: 0, host: "127.0.0.1", maxConnections: 8 });
  await server.start();
  const [host, portStr] = server.getServerConn().split(":") as [string, string];
  const port = Number(portStr);

  const setup = await openClient(host, port);
  await setup.query(`CREATE TABLE t (v text UNIQUE)`);
  await setup.end();

  const clientA = await openClient(host, port);
  const clientB = await openClient(host, port);
  const watchA = watchForCorruption(clientA);
  const watchB = watchForCorruption(clientB);

  let reproducedAt = -1;
  for (let i = 0; i < ITERATIONS && reproducedAt === -1; i++) {
    const v = `dup${i}`;
    try {
      await Promise.all([insertOrIgnore(clientA, v), insertOrIgnore(clientB, v)]);
    } catch {
      reproducedAt = i;
    }
    if (watchA.corrupted() || watchB.corrupted()) reproducedAt = i;
  }

  // The bug can also manifest as silently wrong/empty rows rather than a
  // thrown error (Defect A: a bind against the wrong connection's
  // statement) — confirm the connection is still genuinely healthy, not
  // just quiet.
  if (reproducedAt === -1) {
    try {
      const check = await clientA.query<{ count: string }>(`SELECT count(*) FROM t`);
      if (!check.rows[0]) reproducedAt = ITERATIONS;
    } catch {
      reproducedAt = ITERATIONS;
    }
  }

  await Promise.allSettled([clientA.end(), clientB.end()]);
  await server.stop();
  await rawDb.close();

  if (reproducedAt !== -1) {
    console.log(
      `✅ probe-pglite-concurrency: bug still reproduces (iteration ${reproducedAt}/${ITERATIONS}) — matches ` +
        `electric-sql/pglite#1046. tests/helpers/db.ts's per-test-connection design is still necessary.`,
    );
    process.exit(0);
  }

  console.log(
    `⚠️  probe-pglite-concurrency: bug did NOT reproduce across ${ITERATIONS} iterations.\n` +
      `   This might mean @electric-sql/pglite-socket has fixed electric-sql/pglite#1046 — check the installed\n` +
      `   version against that issue. Could also just be this run got lucky; re-run a few times before\n` +
      `   concluding it's fixed. If it really is fixed, tests/helpers/db.ts's per-connection workaround and\n` +
      `   the postgres-age skill's "Upstream filing" note are both safe to revisit.`,
  );
  process.exit(1);
}

main().catch((err) => {
  // An exception escaping everything above IS the corruption this script
  // looks for, just in a shape neither the try/catch nor the 'error'
  // listener caught — still a reproduction, not a script bug.
  console.log(
    `✅ probe-pglite-concurrency: bug still reproduces (uncaught: ${(err as Error).message}) — matches ` +
      `electric-sql/pglite#1046. tests/helpers/db.ts's per-test-connection design is still necessary.`,
  );
  process.exit(0);
});
