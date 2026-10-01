/**
 * `TenantGraph.collectionAsHal`: one page of the live nodes of a label, each the resource
 * `entityAsHal` gives at the same depth.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "@labkit/core-db/connect";
import { TenantGraph } from "@labkit/core-db/graph";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { ignoreLabkitDbUrl } from "../helpers/scratch-record";

ignoreLabkitDbUrl();

interface Page {
  offset: number;
  limit: number;
  count: number;
  _links: Record<string, { href: string }>;
  _embedded: Record<string, Array<{ id: string }>>;
}

let dir: string;
let scratch: Awaited<ReturnType<typeof connectScratch>>;
let graph: TenantGraph;
const claims: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "labkit-collection-"));
  scratch = await connectScratch(dir);
  const ctx = await resolveTenantContext(scratch.db, scratch.tx, "labkit");
  graph = new TenantGraph(ctx, scratch.db, scratch.tx);
  for (const name of ["the first claim", "the second claim", "the third claim"])
    claims.push((await graph.createNode("Claim", { name })).natural_id);
  const note = await graph.createNode("Note", { text: "about the first claim" });
  await graph.createEdge(note.natural_id, "CONCERNS", claims[0]!);
  const finding = await graph.createNode("Evidence", {
    statement: "a finding for the first claim",
  });
  await graph.createEdge(finding.natural_id, "SUPPORTS", claims[0]!);
}, 60_000);

afterAll(async () => {
  await scratch?.close();
  rmSync(dir, { recursive: true, force: true });
});

const page = async (offset: number, limit: number, depth: number): Promise<Page> =>
  (await graph.collectionAsHal("Claim", offset, limit, depth)) as Page;

test("pages the nodes of one label: limit narrows the page, offset advances it", async () => {
  const first = await page(0, 2, 0);
  expect(first._embedded.Claim!.map((n) => n.id)).toEqual(claims.slice(0, 2));
  expect(first.count).toBe(2);
  expect(first._links.next!.href).toBe("/collections/Claim?limit=2&offset=2");
  expect(first._links.prev).toBeUndefined();

  const second = await page(2, 2, 0);
  expect(second._embedded.Claim!.map((n) => n.id)).toEqual(claims.slice(2));
  expect(second._links.prev!.href).toBe("/collections/Claim?limit=2&offset=0");
  expect(second._links.next).toBeUndefined();
});

test("each item is what entityAsHal gives for that handle at the same depth", async () => {
  for (const depth of [0, 2]) {
    const items = (await page(0, 50, depth))._embedded.Claim!;
    expect(items.length).toBe(claims.length);
    for (const item of items)
      expect(item as unknown).toEqual(await graph.entityAsHal(item.id, depth));
  }
});
