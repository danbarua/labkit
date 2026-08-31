#!/usr/bin/env bun
/**
 * Serves the LabKit Explorer: every composition's trace, over HTTP, plus its
 * static frontend.
 *
 * **Generates into the running program, not into the tree.** There is no
 * committed `traces.json` — every trace is derived at boot by running each
 * `fragments/compositions.ts` entry through `runComposition`, the exact
 * pipeline `scripts/check-compositions.ts` already uses to prove a
 * composition is well formed. The picture cannot disagree with the domain
 * because it is rebuilt from it on every start.
 *
 * `scripts/`, not `src/`, for the same reason `spike-http-server.ts` is: it
 * composes exported pieces (`COMPOSITIONS`, `runComposition`, `worktreeName`)
 * and adds no domain code, so nothing under `src/` knows it exists and it
 * stays deletable on its own merits.
 *
 * Usage:
 *
 *   bun scripts/serve-explorer.ts [--port 8850] [--rust-traces <dir>]
 *
 * `LABKIT_PORT_EXPLORER` (see `bun run ports`) picks the port when `--port`
 * is not given, so two worktrees can run this at once without competing.
 *
 * `--rust-traces <dir>` (default `spikes/labkit-rust/traces`) additionally
 * serves every `*.ndjson` file there as a `Trace` from the Rust/Grafeo port
 * (labkit#119, #121) — a second, independently built model of the same
 * domain, not a reference implementation and a copy of it. See
 * `scripts/read-rust-traces.ts`'s header for why the two sometimes disagree
 * on real questions (edge direction, which node kinds an edge connects) and
 * why that's tagged rather than treated as one side being wrong. Missing or
 * empty is not an error: the Rust port is a spike this checkout may not have
 * built, and the TS traces are served regardless.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";

import { COMPOSITIONS } from "../fragments/compositions";
import { runComposition } from "../fragments/run";
import type { Trace } from "../fragments/trace";
import { worktreeName } from "../src/worktree";
import { readRustTraces } from "./read-rust-traces";

const args = process.argv.slice(2);
const value = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : (args[i + 1] as string);
};
const port = Number(value("--port", process.env.LABKIT_PORT_EXPLORER ?? "8850"));
const rustTracesDir = resolve(value("--rust-traces", join("spikes", "labkit-rust", "traces")));

const home = mkdtempSync(join(tmpdir(), "labkit-explorer-"));
process.on("exit", () => rmSync(home, { recursive: true, force: true }));

console.error(`building ${COMPOSITIONS.length} traces...`);
const traces: Trace[] = [];
for (const composition of COMPOSITIONS) {
  const dir = mkdtempSync(join(home, "run-"));
  traces.push(await runComposition(composition, dir));
}

const rustTraces = await readRustTraces(rustTracesDir);
traces.push(...rustTraces);

const totalSteps = traces.reduce((n, t) => n + t.steps.length, 0);
console.error(
  `OK: ${traces.length} traces (${rustTraces.length} from ${rustTracesDir}), ${totalSteps} steps total.`,
);

const staticRoot = resolve(import.meta.dir, "..", "explorer");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

Bun.serve({
  port,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, worktree: worktreeName(), traces: traces.length });
    }
    if (url.pathname === "/api/traces") {
      return Response.json(traces);
    }

    // Path traversal guard: the resolved file must stay under staticRoot.
    // Not defensive theatre against a hypothetical attacker this dev tool
    // doesn't have -- it's the same "don't trust a path built from request
    // input" rule CLAUDE.md applies everywhere else in this repo.
    const requested = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = resolve(staticRoot, `.${requested}`);
    if (filePath !== staticRoot && !filePath.startsWith(staticRoot + sep)) {
      return new Response("not found", { status: 404 });
    }
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file, {
      headers: { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" },
    });
  },
});

console.error(`LabKit Explorer on http://localhost:${port}  (${worktreeName() ?? "no worktree"})`);
