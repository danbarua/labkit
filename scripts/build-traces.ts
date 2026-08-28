#!/usr/bin/env bun
/**
 * Runs every composition against a real database and writes its trace.
 *
 * This is the "commands in → graph mutations out" half made concrete: the
 * compositions say what a researcher did, LabKit says what that made, and the
 * output is a file a picture can be drawn from without anyone hand-drawing a
 * graph. The LabKit Explorer mockup hand-wrote its nodes and edges; this is
 * what replaces that.
 *
 * **Hermetic.** A temporary directory per run, removed on exit, so it shares
 * no lock and no data with a working record — the same property
 * `scripts/smoke-cli.sh` has and for the same reason. Nothing here reads or
 * writes the project's own `.labkit/`.
 *
 *   bun scripts/build-traces.ts [--out <dir>]
 *
 * Writes `<name>.json` per composition, and prints one line each. Default
 * output is stdout only — a file is written where `--out` says and nowhere
 * else, because a script that leaves files behind by default is how a
 * repository accumulates them.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { connectDb } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, inMemoryEventLog, systemClock } from "../src/domain";
import { COMPOSITIONS } from "../fragments/compositions";
import { danglingEndpoints, graphOf, traceOf, type Trace } from "../fragments/trace";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
const outDir = at === -1 ? undefined : args[at + 1];

const home = mkdtempSync(join(tmpdir(), "labkit-traces-"));
process.on("exit", () => rmSync(home, { recursive: true, force: true }));

const traces: Trace[] = [];

for (const composition of COMPOSITIONS) {
  // A fresh database per composition. Natural ids are sequences, so sharing one
  // would make the second trace start at `Q_2` — readable, and a lie about what
  // that scenario built on its own.
  const dir = mkdtempSync(join(home, "run-"));
  const connection = await connectDb(dir);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const events = inMemoryEventLog();
    const w = new WriteSurface(graph, { clock: systemClock, events });

    await composition.run(w);

    const trace = await traceOf(composition.name, events);
    const dangling = danglingEndpoints(trace);
    if (dangling.length > 0) {
      // Only reachable if LabKit connected something it did not create, which
      // the hand-written mockup could do freely and this cannot.
      console.error(`FAILED: ${composition.ref} has edges into ${dangling.join(", ")}`);
      process.exit(1);
    }
    traces.push(trace);

    const { nodes, edges } = graphOf(trace);
    console.error(
      `  ${composition.ref.padEnd(5)} ${composition.name.padEnd(36)} ` +
        `${String(trace.steps.length).padStart(2)} steps  ` +
        `${String(nodes.length).padStart(2)} nodes  ${String(edges.length).padStart(2)} edges`,
    );
  } finally {
    await connection.close();
  }
}

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const trace of traces) {
    const file = join(outDir, `${trace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
    writeFileSync(file, `${JSON.stringify(trace, null, 2)}\n`);
    console.error(`  wrote ${file}`);
  }
} else {
  // The CLI is the only thing under `src/` allowed to write to stdout; this is
  // a script, and a caller piping it to `jq` is the point.
  process.stdout.write(`${JSON.stringify(traces, null, 2)}\n`);
}
