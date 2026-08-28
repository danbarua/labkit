#!/usr/bin/env bun
/**
 * Every composition still runs, and every edge it writes lands on a node it made.
 *
 * Compositions are the only thing that regenerates the LabKit Explorer's data,
 * and nothing else exercises them — the acceptance scenarios deliberately do
 * not share their fixtures, so a domain change that breaks a composition breaks
 * it silently and the picture simply stops being reproducible.
 *
 * **What it catches that `typecheck` cannot.** A composition can be perfectly
 * typed and refused at runtime. `S-10` was: it re-verified
 * `"the coefficient is 0.61"` against an analysis that concluded 0.63, and
 * `reverify` declined with *"analysis COMP_1 concluded nothing about … there
 * is nothing to re-verify"*. The signature was right and the move was not.
 *
 * The second assertion — no edge into a node the trace never created — can
 * only fire if LabKit connected something it did not make. It returns clean on
 * every real trace, which is exactly why it is stated: a check nobody can see
 * fail is one worth being explicit about, and `tests/fragments.test.ts` builds
 * a deliberately broken trace to prove this one looks.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { COMPOSITIONS } from "../fragments/compositions";
import { runComposition } from "../fragments/run";
import { danglingEndpoints, graphOf } from "../fragments/trace";

const home = mkdtempSync(join(tmpdir(), "labkit-compositions-"));
process.on("exit", () => rmSync(home, { recursive: true, force: true }));

let failed = 0;

for (const composition of COMPOSITIONS) {
  const dir = mkdtempSync(join(home, "run-"));
  let steps = 0;
  let nodes = 0;
  let edges = 0;
  try {
    const trace = await runComposition(composition, dir);
    const dangling = danglingEndpoints(trace);
    if (dangling.length > 0) {
      console.error(`FAILED: ${composition.ref} writes edges into ${dangling.join(", ")}`);
      failed++;
      continue;
    }
    const graph = graphOf(trace);
    steps = trace.steps.length;
    nodes = graph.nodes.length;
    edges = graph.edges.length;

    // A composition that records nothing is a composition nobody would notice
    // had broken. Every one of them is a research arc, so zero is wrong.
    if (steps === 0 || nodes === 0) {
      console.error(`FAILED: ${composition.ref} recorded ${steps} steps and ${nodes} nodes`);
      failed++;
      continue;
    }
  } catch (err) {
    console.error(`FAILED: ${composition.ref} — ${(err as Error).message}`);
    failed++;
    continue;
  }
  console.error(
    `  ${composition.ref.padEnd(5)} ${composition.name.padEnd(34)} ` +
      `${String(steps).padStart(2)} steps  ${String(nodes).padStart(2)} nodes  ` +
      `${String(edges).padStart(2)} edges`,
  );
}

if (failed > 0) {
  console.error(`FAILED: ${failed} of ${COMPOSITIONS.length} compositions.`);
  process.exit(1);
}
console.error(`OK: all ${COMPOSITIONS.length} compositions run and connect only what they create.`);
