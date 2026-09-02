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
 *   bun scripts/serve-explorer.ts [--port 8850] [--rust-traces <dir>] [--db <dir>]
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
 *
 * `--db <dir>` (labkit#124/#126) additionally serves a **real record** —
 * `<dir>` is a project root with a `.labkit/` written by the CLI or the MCP
 * server, not a composition. Read via `scripts/read-db-trace.ts`, re-opened
 * and re-read on *every* `/api/traces` request rather than once at boot:
 * unlike a composition or an NDJSON file, this record can still be growing
 * (a researcher's live project), and a long-held connection would sit on the
 * PGlite lock and block every writer trying to touch it — see that file's
 * header. `<dir>/.labkit` must already exist; this refuses to mint a fresh
 * record the way `connectDb` normally would, because the whole point is
 * reading something real, and a silently-created empty database would render
 * as a trace with zero steps and look like a bug rather than an operator
 * error.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import { COMPOSITIONS } from "../fragments/compositions";
import { runComposition } from "../fragments/run";
import type { Trace } from "../fragments/trace";
import { worktreeName } from "../src/worktree";
import { readDbTrace } from "./read-db-trace";
import { readRustTraces } from "./read-rust-traces";
import { staticFilePath } from "./static-path";

const args = process.argv.slice(2);
const value = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : (args[i + 1] as string);
};
const port = Number(value("--port", process.env.LABKIT_PORT_EXPLORER ?? "8850"));
const rustTracesDir = resolve(value("--rust-traces", join("spikes", "labkit-rust", "traces")));
const dbDir = args.includes("--db") ? resolve(value("--db", "")) : undefined;

if (dbDir && !existsSync(join(dbDir, ".labkit"))) {
  console.error(`labkit: --db ${dbDir} has no .labkit/ -- refusing to mint one for a viewer.`);
  console.error(`labkit: point --db at a project root a real "labkit" command has already run in.`);
  process.exit(1);
}

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
  `OK: ${traces.length} traces (${rustTraces.length} from ${rustTracesDir}), ${totalSteps} steps total.` +
    (dbDir ? ` Reading a live record from ${dbDir} per request.` : ""),
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
      return Response.json({
        ok: true,
        worktree: worktreeName(),
        traces: traces.length + (dbDir ? 1 : 0),
      });
    }
    if (url.pathname === "/api/traces") {
      // The DB trace is re-read here, per request, rather than cached
      // alongside `traces` above -- see this file's header for --db. Every
      // other trace here is fixed at boot (a composition or an NDJSON file
      // doesn't change under the server); a real record can, and re-reading
      // is also what keeps the connection open only for the life of one
      // request rather than the life of the process.
      if (!dbDir) return Response.json(traces);
      try {
        const dbTrace = await readDbTrace(dbDir, basename(dbDir));
        if (dbTrace.derivedUnavailable)
          console.error(`labkit: --db ${dbDir}: ${dbTrace.derivedUnavailable}`);
        return Response.json([...traces, dbTrace]);
      } catch (err) {
        console.error(`labkit: failed to read --db ${dbDir}: ${(err as Error).message}`);
        return Response.json(traces);
      }
    }

    // A path built from request input is not trusted to stay under
    // staticRoot -- see `staticFilePath` for what actually keeps it there.
    const filePath = staticFilePath(staticRoot, url.pathname);
    if (filePath === undefined) return new Response("not found", { status: 404 });
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file, {
      headers: { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" },
    });
  },
});

console.error(`LabKit Explorer on http://localhost:${port}  (${worktreeName() ?? "no worktree"})`);
