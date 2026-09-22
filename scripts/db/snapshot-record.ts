#!/usr/bin/env bun
/**
 * Dumps a real LabKit record to one `.sql` file, dated and named for the schema commit that
 * wrote it. `labkit restore` reads it back, into PGlite or a real Postgres.
 *
 * Goes through `connectDb`, which holds the lock: a second open of the same directory is the
 * concurrent-writer case the lock prevents. Never updated in place: a snapshot is dated for
 * the day it was taken. The schema commit is this checkout's `HEAD`.
 *
 * Usage:
 *   bun scripts/db/snapshot-record.ts --db <project-root> [--name <slug>] [--out-dir <dir>]
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { connectDb } from "@labkit/core-db/connect.ts";
import { dumpSql } from "@labkit/core-db/dump.ts";

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
const outPath = join(outDir, `${slug}-${date}-${schemaCommit}.sql`);

if (existsSync(outPath)) {
  console.error(
    `labkit: ${outPath} already exists -- a snapshot is never updated in place; pass --name to distinguish it`,
  );
  process.exit(1);
}

const connection = await connectDb(resolvedDbDir);
try {
  const sql = await dumpSql(connection);
  writeFileSync(outPath, sql);
  console.log(`labkit: wrote ${outPath} (${(sql.length / 1024).toFixed(0)}KB)`);
} finally {
  await connection.close();
}
