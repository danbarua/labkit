/**
 * `labkit_get_collection_as_hal`, called directly. No HTTP handler reads it yet -- the CLI is
 * next -- so this exercises the function itself: relative URLs, `offset`/`limit`/`depth` bounds,
 * and the label check against what the tenant's own graph carries.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: HAL bodies are read loosely; each test asserts only the part of the shape it is about

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createFixture, type Fixture } from "./support/fixture";

let fixture: Fixture;

beforeAll(async () => {
  fixture = await createFixture();
}, 60_000);

afterAll(async () => {
  await fixture?.close();
});

async function collection(
  tenantId: number,
  label: string,
  offset: number,
  limit: number,
  depth: number,
) {
  const session = await fixture.connections.connect();
  try {
    const r = await session.query<{ hal: any }>(
      "SELECT public.labkit_get_collection_as_hal($1,$2,$3,$4,$5) AS hal",
      [tenantId, label, offset, limit, depth],
    );
    return r.rows[0]!.hal;
  } finally {
    session.release();
  }
}

async function collectionError(
  tenantId: number,
  label: string,
  offset: number,
  limit: number,
  depth: number,
): Promise<string> {
  try {
    await collection(tenantId, label, offset, limit, depth);
    throw new Error("expected labkit_get_collection_as_hal to raise");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("labkit_get_collection_as_hal", () => {
  test("pages the live nodes of a label, retracted ones excluded", async () => {
    const hal = await collection(1, "Question", 0, 50, 0);
    expect(hal._embedded.Question.map((n: any) => n.id).sort()).toEqual(["Q_1", "Q_2"]);
    expect(hal.count).toBe(2);
    expect(hal._links.self.href).toBe("/collections/Question?offset=0&limit=50");
    expect(hal._links.next).toBeUndefined();
    expect(hal._links.prev).toBeUndefined();
  });

  test("paginates: limit narrows the page, offset advances it, next/prev name both", async () => {
    const page1 = await collection(1, "Question", 0, 1, 0);
    expect(page1._embedded.Question.map((n: any) => n.id)).toEqual(["Q_1"]);
    expect(page1._links.next.href).toBe("/collections/Question?offset=1&limit=1");
    expect(page1._links.prev).toBeUndefined();

    const page2 = await collection(1, "Question", 1, 1, 0);
    expect(page2._embedded.Question.map((n: any) => n.id)).toEqual(["Q_2"]);
    expect(page2._links.prev.href).toBe("/collections/Question?offset=0&limit=1");
    expect(page2._links.next).toBeUndefined();
  });

  test("each item is what the single-entity view returns at the same depth", async () => {
    const depth0 = await collection(1, "LineOfEnquiry", 0, 50, 0);
    expect(depth0._embedded.LineOfEnquiry[0]._embedded).toBeUndefined();

    const depth1 = await collection(1, "LineOfEnquiry", 0, 50, 1);
    const loe = depth1._embedded.LineOfEnquiry[0];
    // The same edge property PR #489 proved on the single-entity view survives per item here.
    expect(loe._links["evidenceunit:addresses"]).toEqual([
      { href: "/graph/EU_1", dir: "in", type: "EvidenceUnit", props: { weight: 1 } },
    ]);
  });

  test("a label the graph does not carry is rejected against the graph itself, not a fixed list", async () => {
    const err = await collectionError(1, "NotARealLabel", 0, 50, 0);
    expect(err).toContain("no label NotARealLabel in graph");
  });

  test("an unknown tenant is rejected before any graph is touched", async () => {
    const err = await collectionError(999_999, "Question", 0, 50, 0);
    expect(err).toBe("no tenant 999999");
  });

  test("rejects a negative offset", async () => {
    expect(await collectionError(1, "Question", -1, 50, 0)).toMatch(/must be/);
  });

  test("rejects a limit outside 1..200", async () => {
    expect(await collectionError(1, "Question", 0, 0, 0)).toMatch(/must be/);
    expect(await collectionError(1, "Question", 0, 201, 0)).toMatch(/must be/);
  });

  test("rejects a depth outside 0..6", async () => {
    expect(await collectionError(1, "Question", 0, 50, 7)).toMatch(/must be/);
  });
});
