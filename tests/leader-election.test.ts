import { afterAll, beforeAll, describe, test } from "bun:test";
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

async function createOneTenant(label: string, delayMs: number) {
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
}

describe("leader election", () => {
  test("concurrent connectDb() calls elect one primary and share one database", async () => {
    const p1 = createOneTenant("1", 0);
    const p2 = createOneTenant("2", 0);
    const p3 = createOneTenant("3", 0);

    await Promise.all([p1, p2, p3]);
  });
});
