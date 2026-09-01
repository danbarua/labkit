#!/usr/bin/env bun
/**
 * Dumps a real LabKit record's PGlite data directory to a single gzip
 * tarball, dated and named for the schema commit that wrote it.
 *
 * **A gzip dump, not a directory copy.** Measured against the real Bonsai
 * record (2026-09-01, 335 events): the raw `.labkit/pglite` directory is
 * 59MB, an uncompressed `dumpDataDir("none")` tarball is 59.8MB (no better),
 * and a `dumpDataDir("gzip")` tarball is 9.3MB — about 84% smaller than the
 * directory it came from, and it restores cleanly via `PGlite`'s own
 * `loadDataDir` (round-tripped and read back through `connectDb` in the same
 * measurement, event count unchanged). `~/labkit-snapshots/` already holds a
 * dozen dated directory copies at 59-100MB apiece; a `.tar.gz` is what makes
 * that directory worth keeping around.
 *
 * **Goes through `connectDb`, not a raw `new PGlite({dataDir})`.** The data
 * directory is only ever safe to open through the lock `connectDb` takes —
 * a second, unlocked open of the same directory is the concurrent-writer
 * corruption case the lock exists to prevent, and a `dataDir` argument
 * missing its final path segment doesn't error, it silently initialises a
 * fresh empty cluster there. `connection.pglite` (`src/db/backend.ts`)
 * reaches PGlite's dump capability through the same connection that already
 * holds the lock, rather than opening the directory a second way.
 *
 * **Never updated in place.** A snapshot is a dated record of what the
 * schema produced on that day, from that commit — the same reasoning
 * `docs/project-journal/` and `docs/session-log/` are exempt from "state
 * belongs in one place" for. Overwriting one would make the name a lie about
 * when it was taken.
 *
 * **The schema commit is this checkout's current `HEAD`**, not necessarily
 * `main`'s — accurate when run from the same checkout that built the record,
 * which is the normal case, but a feature branch mid-migration-change would
 * name itself rather than the commit the record will actually ship against.
 *
 * Usage:
 *   bun scripts/snapshot-record.ts --db <project-root> [--name <slug>] [--out-dir <dir>]
 */

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { connectDb } from "../src/db/connect";

const args = process.argv.slice(2);
const value = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
};

const dbDir = value("--db");
if (!dbDir) {
  console.error(
    "labkit: --db <project-root> is required -- name the record to snapshot, don't guess one",
  );
  process.exit(1);
}
const resolvedDbDir = resolve(dbDir);
if (!existsSync(join(resolvedDbDir, ".labkit"))) {
  console.error(
    `labkit: ${resolvedDbDir} has no .labkit/ -- point --db at a project a real "labkit" command has run in`,
  );
  process.exit(1);
}

const outDir = resolve(
  value("--out-dir", join(process.env.HOME ?? ".", "labkit-snapshots")) as string,
);
mkdirSync(outDir, { recursive: true });

const slug = value("--name", "record") as string;
const date = new Date().toISOString().slice(0, 10);
const schemaCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).trim();
const outPath = join(outDir, `${slug}-${date}-${schemaCommit}.tar.gz`);

if (existsSync(outPath)) {
  console.error(
    `labkit: ${outPath} already exists -- a snapshot is never updated in place; pass --name to distinguish it`,
  );
  process.exit(1);
}

const connection = await connectDb(resolvedDbDir);
try {
  if (!connection.pglite) {
    console.error(
      "labkit: this record is on a real Postgres (LABKIT_DB_URL), which has no dumpDataDir -- use pg_dump instead",
    );
    process.exit(1);
  }
  const blob = await connection.pglite.dumpDataDir("gzip");
  await Bun.write(outPath, blob);
  console.log(`labkit: wrote ${outPath} (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
} finally {
  await connection.close();
}
