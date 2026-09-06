#!/usr/bin/env bun
/**
 * Serves the LabKit Explorer: the Bonsai record, over HTTP, plus its static
 * frontend.
 *
 * `scripts/`, not `src/`, for the same reason `spike-http-server.ts` is: it
 * composes exported pieces (`readDbTrace`, `worktreeName`) and adds no domain
 * code, so nothing under `src/` knows it exists and it stays deletable on its
 * own merits.
 *
 * Usage:
 *
 *   bun scripts/serve-explorer.ts [--port 8850] [--db <dir>]
 *
 * `LABKIT_PORT_EXPLORER` (see `bun run ports`) picks the port when `--port`
 * is not given, so two worktrees can run this at once without competing.
 *
 * `--db <dir>` defaults to `.labkit-bonsai/` (`bun run bonsai:record`
 * builds it) — a project root with a `.labkit/` written by the CLI, not a
 * scripted arc. Read via `scripts/read-db-trace.ts`, re-opened and re-read on
 * *every* `/api/traces` request rather than once at boot: this record can
 * still be growing, and a long-held connection would sit on the PGlite lock
 * and block every writer trying to touch it — see that file's header.
 * `<dir>/.labkit` must already exist; this refuses to mint a fresh record the
 * way `connectDb` normally would, because the whole point is reading
 * something real, and a silently-created empty database would render as a
 * trace with zero steps and look like a bug rather than an operator error.
 */

import { existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { worktreeName } from "../src/worktree";
import { readDbTrace } from "./read-db-trace";
import { staticFilePath } from "./static-path";

const args = process.argv.slice(2);
const value = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : (args[i + 1] as string);
};
const port = Number(value("--port", process.env.LABKIT_PORT_EXPLORER ?? "8850"));
const dbDir = resolve(value("--db", join(import.meta.dir, "..", ".labkit-bonsai")));

if (!existsSync(join(dbDir, ".labkit"))) {
  console.error(`labkit: --db ${dbDir} has no .labkit/ -- refusing to mint one for a viewer.`);
  console.error(`labkit: point --db at a project root a real "labkit" command has already run in,`);
  console.error(`labkit: or run "bun run bonsai:record" to build the default record.`);
  process.exit(1);
}

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
      return Response.json({ ok: true, worktree: worktreeName() });
    }
    if (url.pathname === "/api/traces") {
      // Re-read per request rather than cached at boot -- see this file's
      // header. A real record can grow between requests, and re-reading is
      // also what keeps the connection open only for the life of one request
      // rather than the life of the process.
      try {
        const trace = await readDbTrace(dbDir, basename(dbDir));
        if (trace.derivedUnavailable)
          console.error(`labkit: ${dbDir}: ${trace.derivedUnavailable}`);
        return Response.json([trace]);
      } catch (err) {
        console.error(`labkit: failed to read ${dbDir}: ${(err as Error).message}`);
        return Response.json([]);
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

console.error(`serving ${dbDir}`);
console.error(`LabKit Explorer on http://localhost:${port}  (${worktreeName() ?? "no worktree"})`);
