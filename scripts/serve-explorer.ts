#!/usr/bin/env bun
/**
 * Serves the LabKit Explorer: the Bonsai record, over HTTP, plus its static
 * frontend.
 *
 * `scripts/`, not `src/`, for the same reason `spike-http-server.ts` is: it
 * composes exported pieces (`readDbHistory`, `worktreeName`) and adds no domain
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
 *
 * **The re-read is the cheap half and the replay is not**, so only the first
 * is done per request. Measured 2026-09-07 on the Bonsai record: 252ms to read
 * 405 events and 16,661ms to replay them, every request, for a `derived`
 * snapshot that is a pure function of the history just read. Keyed on the
 * history's own content rather than on its length or last `seq`: a rebuilt
 * record — `bun run bonsai:record`, the command a viewer is refreshed after —
 * reaches the same count and the same sequence numbers, which
 * `probe-bonsai-replay.sh` asserts on every build when it reports the streams
 * identical *"commit hashes aside"*. A key made of count and `seq` would
 * therefore serve the old graph for the new record, silently.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import { worktreeName } from "../src/worktree";
import { readDbHistory, traceFromHistory } from "./read-db-trace";
import type { Trace } from "../fragments/trace";
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

/**
 * Where a replayed trace is kept between runs of this server.
 *
 * The temporary directory rather than beside the record: the record's own
 * directory is asserted to hold nothing git can see (`bun run bonsai:record`),
 * and `.labkit/` belongs to the database. Nothing here is precious — the file
 * is a saved computation, and losing it costs one replay.
 */
const CACHE_DIR = join(tmpdir(), "labkit-explorer-traces");

/**
 * The replayed trace, and the history it was replayed from.
 *
 * The stored value is the promise rather than the trace, so two requests
 * arriving while a replay is in flight wait on the one replay instead of
 * starting a second — which is the case a page load hits, the browser having
 * asked before the boot warm-up finished.
 */
let replayed: { key: string; trace: Promise<Trace> } | undefined;

/** Reads a previously saved replay, or `undefined` if there is not a usable one. */
function savedTrace(key: string): Trace | undefined {
  try {
    return JSON.parse(readFileSync(join(CACHE_DIR, `${key}.json`), "utf8")) as Trace;
  } catch {
    // Absent, half-written, or from an older shape of `Trace`. All three mean
    // the same thing to a caller — replay it — and none is worth a message.
    return undefined;
  }
}

/**
 * Saves a replay under its history's key, via a rename so a killed server
 * leaves no half-written file for the next one to parse.
 */
function saveTrace(key: string, trace: Trace): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const target = join(CACHE_DIR, `${key}.json`);
    const staging = `${target}.${process.pid}.partial`;
    writeFileSync(staging, JSON.stringify(trace));
    renameSync(staging, target);
  } catch (err) {
    // A viewer that cannot write its cache still works; it is just slow again
    // next time, and saying so beats failing the request.
    console.error(`labkit: could not save the replay: ${(err as Error).message}`);
  }
}

/**
 * The record's trace, replaying only when this history has not been replayed
 * before — in this process or in an earlier one.
 *
 * The saved half is what makes this bearable on a slow machine: the replay is
 * 16s on an M-series laptop and **226s on a 2013 Intel MacBook Pro** (measured
 * 2026-09-07, same record, 405 events), so paying it once per server start is
 * still four minutes of a blank page every restart.
 */
async function currentTrace(): Promise<Trace> {
  const history = await readDbHistory(dbDir);
  const key = String(Bun.hash(JSON.stringify(history)));
  if (replayed?.key !== key) {
    const saved = savedTrace(key);
    const trace = saved
      ? Promise.resolve(saved)
      : traceFromHistory(basename(dbDir), history).then((t) => {
          saveTrace(key, t);
          return t;
        });
    // A failed replay must not be remembered as this history's answer, or
    // every later request is served the same failure without retrying.
    trace.catch(() => {
      if (replayed?.key === key) replayed = undefined;
    });
    replayed = { key, trace };
  }
  return replayed.trace;
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
        const trace = await currentTrace();
        if (trace.derivedUnavailable)
          console.error(`labkit: ${dbDir}: ${trace.derivedUnavailable}`);
        return Response.json([trace]);
      } catch (err) {
        console.error(`labkit: failed to read ${dbDir}: ${(err as Error).message}`);
        return new Response(`failed to read ${dbDir}: ${(err as Error).message}`, { status: 500 });
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

// Replay once now rather than on the first page load, and say how long it
// took: the wait is real either way, and a viewer left staring at an empty
// page for seventeen seconds cannot tell a slow replay from a broken one.
const started = Date.now();
console.error(`replaying the record for its derived snapshots (cache: ${CACHE_DIR})...`);
currentTrace().then(
  (trace) => console.error(`ready: ${trace.steps.length} steps in ${Date.now() - started}ms`),
  (err) => console.error(`labkit: replay failed: ${(err as Error).message}`),
);
