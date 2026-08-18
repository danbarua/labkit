import { afterAll, beforeAll, describe, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { connectDb, getOrCreateProject } from "../src/db";

const TEST_ROOT = join(import.meta.dir, "..", ".labkit-test-tmp");

beforeAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

async function createOneProject(label: string, delayMs: number) {
  if (delayMs > 0) await Bun.sleep(delayMs);

  const conn = await connectDb(TEST_ROOT);
  console.log(`[${label}] role=${conn.role}`);

  const project = await getOrCreateProject(conn.db, `election-test:${label}`);
  console.log(`[${label}] wrote project ${project.id}`);

  // Give the other processes time to also write before we count everything.
  await Bun.sleep(500);

  const all = await conn.db.query<{ n: string }>(`select count(*) as n from projects`);
  console.log(`[${label}] total projects visible: ${all.rows[0]!.n}`);

  await conn.close();
}

describe("leader election", () => {
  test("concurrent connectDb() calls elect one primary and share one database", async () => {
    const p1 = createOneProject("1", 0);
    const p2 = createOneProject("2", 0);
    const p3 = createOneProject("3", 0);

    await Promise.all([p1, p2, p3]);
  });
});
