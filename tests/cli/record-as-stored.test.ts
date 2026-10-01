/**
 * `get` and `list`: the record as stored, two hops deep unless told otherwise.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "@labkit/app-cli/program";
import type { Answer } from "@labkit/app-cli/output";
import type { Run, Surfaces } from "@labkit/app-cli/session";
import { PLAIN } from "@labkit/app-cli/palette";
import { connectScratch } from "@labkit/core-db/connect";
import { NODE_LABELS } from "@labkit/core-db/domain";
import { TenantGraph } from "@labkit/core-db/graph";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { ReadSurface, WriteSurface, inMemoryEventLog } from "@labkit/core-domain";
import { ignoreLabkitDbUrl } from "../helpers/scratch-record";

ignoreLabkitDbUrl();

let dir: string;
let scratch: Awaited<ReturnType<typeof connectScratch>>;
let surfaces: Surfaces;
let seeded: { claim: string; note: string; finding: string };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "labkit-as-stored-"));
  scratch = await connectScratch(dir);
  const ctx = await resolveTenantContext(scratch.db, scratch.tx, "labkit");
  const graph = new TenantGraph(ctx, scratch.db, scratch.tx);
  const events = inMemoryEventLog();
  surfaces = {
    read: new ReadSurface(graph, { events }),
    write: new WriteSurface(graph, { events }),
  };
  const claim = (await graph.createNode("Claim", { name: "the claim" })).natural_id;
  await graph.createNode("Claim", { name: "another claim" });
  const note = (await graph.createNode("Note", { text: "about the claim" })).natural_id;
  await graph.createEdge(note, "CONCERNS", claim);
  const finding = (await graph.createNode("Evidence", { statement: "a finding for it" }))
    .natural_id;
  await graph.createEdge(finding, "SUPPORTS", claim);
  seeded = { claim, note, finding };
}, 60_000);

afterAll(async () => {
  await scratch?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Runs one command and returns what it answered with, or undefined when it never ran. */
async function invoke(argv: string[]): Promise<Answer | undefined> {
  let captured: Answer | undefined;
  const run: Run = async (work) => {
    captured = await work(surfaces);
  };
  const program = buildProgram(run);
  program.exitOverride();
  await program.parseAsync(argv, { from: "user" });
  return captured;
}

interface Embedding {
  id: string;
  depth: number;
  _embedded?: Record<string, Embedding[]>;
}

/** Every handle embedded in a resource, at any hop, with the hop it was reached at. */
const embedded = (resource: unknown): Array<[string, number]> =>
  Object.values((resource as Embedding)._embedded ?? {})
    .flat()
    .flatMap((n) => [[n.id, n.depth] as [string, number], ...embedded(n)]);

test("get embeds two hops by default, and --depth narrows it", async () => {
  const byDefault = await invoke(["get", seeded.note]);
  expect(embedded(byDefault!.value)).toEqual([
    [seeded.claim, 1],
    [seeded.finding, 2],
  ]);
  expect(byDefault!.render(PLAIN)).toContain(`    evidence:supports        ${seeded.finding}`);

  const oneHop = await invoke(["--depth", "1", "get", seeded.note]);
  expect(embedded(oneHop!.value)).toEqual([[seeded.claim, 1]]);
});

test("list pages every node of a type, each as get gives it", async () => {
  const listed = await invoke(["list", "Claim", "--limit", "1"]);
  const page = listed!.value as { count: number; _embedded: { Claim: unknown[] } };
  expect(page.count).toBe(1);
  expect(page._embedded.Claim[0]).toEqual((await invoke(["get", seeded.claim]))!.value);

  const rendered = listed!.render(PLAIN);
  expect(rendered).toContain(seeded.claim);
  expect(rendered).toContain("More: --offset 1");
});

test("an unknown node type is refused before anything runs, naming every type", async () => {
  let refusal = "";
  const answered = await invoke(["list", "Clam"]).catch((err: Error) => {
    refusal = err.message;
    return undefined;
  });
  expect(answered).toBeUndefined();
  expect(refusal).toContain("no node type `Clam`");
  expect(NODE_LABELS.length).toBeGreaterThan(10);
  for (const label of NODE_LABELS) expect(refusal).toContain(label);
});
