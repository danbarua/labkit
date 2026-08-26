/**
 * PGlite is single-writer and file-backed, so the lockfile is the only thing
 * standing between two LabKit processes and a corrupt database.
 *
 * **This replaced `tests/leader-election.test.ts`**, which raced three
 * concurrent `connectDb()` calls against one directory to prove that exactly
 * one elected itself primary and served the other two over a socket. There is
 * no election and no socket any more: a process takes the lock, does its work,
 * and gives it back. The three claims worth keeping from that file are the
 * three below, and each is now reached deterministically rather than by racing
 * — that file was the suite's flakiest, and it was flaky because proving a
 * concurrency property by running a real race is how you get a test that
 * usually proves it.
 *
 * These open real `dataDir`s, so they are slow by the suite's standards. A cold
 * open is ~1s (measured 2026-08-26) and every test here pays at least one, hence
 * the explicit per-test timeouts: bun's 5000ms default is not generous enough
 * for a test whose subject is a database starting up.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pgliteBackend } from "../src/db/backend";
import { usingPostgres } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";

let root: string;

function backend(lockTimeoutMs?: number) {
  return pgliteBackend({
    dataDir: join(root, "pglite"),
    lockPath: join(root, "pglite.lock"),
    ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
  });
}

const lockPath = () => join(root, "pglite.lock");

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "labkit-lock."));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// Skipped under `LABKIT_DB_URL`: the subject here is the PGlite lockfile, and
// a real Postgres is its own arbiter and has none. Skipping is the honest
// answer — running these against a container would prove the lock works while
// testing a code path that deployment never takes.
describe.skipIf(usingPostgres())("the database lock", () => {
  test("is taken for the duration of the work and handed back afterwards", async () => {
    const first = await backend().connect();
    // Held: the file exists and names this process.
    expect(readFileSync(lockPath(), "utf8").trim()).toBe(String(process.pid));
    const a = await resolveTenantContext(first.db, "lock-a");
    await first.close();

    // Released: a second cycle gets in without waiting, and finds the first
    // one's write. One database, not two — the property the deleted election
    // test spent a three-way race to establish.
    const second = await backend().connect();
    const all = await second.db.query<{ slug: string }>(`select slug from tenants order by slug`);
    const b = await resolveTenantContext(second.db, "lock-b");
    await second.close();

    expect(all.rows.map((r) => r.slug)).toEqual(["lock-a"]);
    expect(b.tenantId).not.toBe(a.tenantId);
  }, 30_000);

  test("refuses to open a database another live process is holding", async () => {
    const holder = await backend().connect();
    try {
      // 200ms rather than the 10s default: the point is the refusal, and the
      // default deadline exists to clear a *cold* open (1067ms, measured),
      // which has already happened by now.
      const refusal = await backend(200)
        .connect()
        .then(
          (c) => {
            void c.close();
            return "it connected";
          },
          (err: Error) => err.message,
        );
      expect(refusal).toMatch(/timed out after 200ms waiting for the LabKit database lock/);
      expect(refusal).toContain("pglite.lock");
      expect(refusal).toContain(`held by pid ${process.pid}`);
    } finally {
      await holder.close();
    }
  }, 30_000);

  test("makes a waiter wait rather than fail, and lets it through on release", async () => {
    const holder = await backend().connect();

    // Started while the lock is held, with a deadline far shorter than the
    // 10s default so that "it waited" and "it never waited at all" cannot
    // both pass: 2s is long enough for the release below and short enough
    // that a blocked acquire would have to fail rather than hang.
    const waiter = backend(2_000).connect();
    await Bun.sleep(150);
    await holder.close();

    const second = await waiter;
    await second.close();
    // Nothing to assert beyond it resolving: an acquire that did not wait
    // would have thrown, and one that waited too long would have too.
    expect(second).toBeDefined();
  }, 30_000);

  test("reclaims a lock whose holder is gone", async () => {
    // A pid that cannot be running: `kill(pid, 0)` raises ESRCH, which is the
    // branch that distinguishes a crashed holder from a live one. Reached by
    // writing the file rather than by crashing a process, so the test is
    // about the branch and not about process control.
    const dead = 2 ** 22; // above every plausible pid_max on this platform
    expect(() => process.kill(dead, 0)).toThrow();
    writeFileSync(lockPath(), String(dead));

    const conn = await backend(500).connect();
    expect(readFileSync(lockPath(), "utf8").trim()).toBe(String(process.pid));
    await conn.close();
  }, 30_000);
});
