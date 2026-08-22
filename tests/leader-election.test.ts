/**
 * PGlite is single-writer, so three concurrent `connectDb()` calls against one
 * directory must elect exactly one primary and route the other two through it.
 *
 * **This file asserted nothing until 2026-08-21.** It ran the race, printed
 * three roles and a tenant count, and discarded all of them — the only test
 * file in the repo with no `expect(` at all, under a name claiming to prove
 * election works, and cited in CLAUDE.md as proving it. Three processes each
 * self-electing primary on three separate databases would have passed. Found
 * by the PJ-027 sweep and now checkable: `bun run check:tests-assert`.
 *
 * The console lines are kept. They are the diagnostic when the live
 * pglite-socket concurrency bug (PJ-006) makes this flake, and the assertions
 * below say what the lines used to leave to a reader.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { connectDb, resolveTenantContext } from "../src/db";

const TEST_ROOT = join(import.meta.dir, "..", ".labkit-test-tmp");

beforeAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

interface Participant {
  label: string;
  role: "primary" | "secondary";
  tenantId: number;
  graphName: string;
  /** How many tenants this connection could see once everyone had written. */
  visible: number;
}

async function createOneTenant(label: string, delayMs: number): Promise<Participant> {
  if (delayMs > 0) await Bun.sleep(delayMs);

  const conn = await connectDb(TEST_ROOT);
  console.log(`[${label}] role=${conn.role}`);

  const ctx = await resolveTenantContext(conn.db, `election-test-${label}`);
  console.log(`[${label}] wrote tenant ${ctx.tenantId} (${ctx.graphName})`);

  // Give the other processes time to also write before we count everything.
  await Bun.sleep(500);

  const all = await conn.db.query<{ n: string }>(`select count(*) as n from tenants`);
  console.log(`[${label}] total tenants visible: ${all.rows[0]!.n}`);

  await conn.close();
  return {
    label,
    role: conn.role,
    tenantId: ctx.tenantId,
    graphName: ctx.graphName,
    visible: Number(all.rows[0]!.n),
  };
}

describe("leader election", () => {
  test("concurrent connectDb() calls elect one primary and share one database", async () => {
    const participants = await Promise.all([
      createOneTenant("1", 0),
      createOneTenant("2", 0),
      createOneTenant("3", 0),
    ]);

    // One primary, and exactly one. Two would mean two writers on a
    // single-writer engine; zero would mean nobody opened the file.
    expect(participants.filter((p) => p.role === "primary")).toHaveLength(1);
    expect(participants.filter((p) => p.role === "secondary")).toHaveLength(2);

    // One database, not three. This is the half the old version discarded: each
    // connection sees every tenant, including the two it did not write, which
    // three separate PGlite files could not produce.
    for (const p of participants) expect(p.visible).toBe(participants.length);

    // And they really are three distinct tenants, so "sees three" is not three
    // views of one row.
    expect(new Set(participants.map((p) => p.tenantId)).size).toBe(participants.length);
    expect(new Set(participants.map((p) => p.graphName)).size).toBe(participants.length);
  });
});
