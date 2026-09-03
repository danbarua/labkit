/**
 * `labkit backup` — the whole record, in one file, before something changes it.
 *
 * **It does not go through {@link Run}**, for the reason `./serve.ts` does not:
 * `runner()` opens a database, resolves a tenant, does one unit of work through
 * the domain verbs and prints a report. A backup reaches past the domain
 * entirely — it copies the cluster, every tenant in it, and answers nothing
 * about research. Handing it a surface and a printer would be handing it two
 * things it has no use for.
 *
 * **A gzip tarball, not SQL, and the extension says so.** `--path backup.sql`
 * suggests `pg_dump`, and PGlite has no `pg_dump`: what it has is
 * `dumpDataDir()`, which writes the data directory itself. The two are not
 * interchangeable — one is a stream of statements that replays into any
 * Postgres, the other is a cluster you restore by unpacking. Measured on the
 * real Bonsai record (2026-09-01, 335 events): the raw directory is 59MB, an
 * uncompressed dump 59.8MB, a gzip dump **9.3MB**, restoring cleanly through
 * PGlite's own `loadDataDir`. So this writes `.tar.gz` and refuses a path that
 * claims otherwise rather than producing a file whose name is a lie.
 *
 * **Through `connectDb`, never a raw `new PGlite({dataDir})`.** The data
 * directory is only safe to open under the lock `connectDb` takes; a second
 * unlocked open is the concurrent-writer case the lock exists to prevent, and
 * a `dataDir` missing its last path segment does not error — it silently
 * initialises a fresh empty cluster and backs *that* up. `connection.pglite`
 * reaches the dump through the connection already holding the lock.
 *
 * **It refuses to overwrite.** A backup names a moment; writing over one makes
 * the name a lie about which moment. The same reasoning
 * `scripts/snapshot-record.ts` runs on, and this is the user-facing half of it.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { connectDb } from "../../db/connect";
import type { Globals } from "../session";

/** What a dump of a PGlite data directory is, so a name cannot claim otherwise. */
const EXTENSION = ".tar.gz";

export function registerBackup(program: Command): void {
  program
    .command("backup")
    .helpGroup("Operating LabKit")
    .summary("copy the whole record to one file, before something changes it")
    .description(
      "Writes the record's data directory as a gzip tarball — every tenant, the event log " +
        "included. Restore by unpacking it over an empty `.labkit/pglite`. It is not a " +
        "`pg_dump`: PGlite has no such thing, and a `.sql` path is refused rather than " +
        "answered with a file that is not SQL. Refuses to overwrite, because a backup names " +
        "the moment it was taken.",
    )
    .requiredOption("--path <file>", `where to write it (must end ${EXTENSION})`)
    .action(async (opts: { path: string }) => {
      const globals = program.opts<Globals>();
      const target = resolve(opts.path);

      // **Throw, never `process.exitCode`.** `main()` returns 0 for any run
      // that parsed and did not throw, and `process.exit(await main())`
      // discards whatever `exitCode` was set to — so a refusal that sets it
      // prints its message and exits 0, which is a command reporting success
      // for work it declined to do. Found on this command's own first run.
      if (!target.endsWith(EXTENSION))
        throw new Error(
          `a backup is a gzip tarball of the data directory, not SQL — ` +
            `name it something ending ${EXTENSION}`,
        );
      if (existsSync(target))
        throw new Error(
          `${target} already exists — a backup names the moment it was taken, so this ` +
            `will not overwrite one. Choose another name.`,
        );
      mkdirSync(dirname(target), { recursive: true });

      const connection = await connectDb(globals.db);
      try {
        if (!connection.pglite)
          throw new Error(
            `this record is on a real Postgres (LABKIT_DB_URL), which has no dumpDataDir — ` +
              `use pg_dump against that server instead`,
          );
        const blob = await connection.pglite.dumpDataDir("gzip");
        await Bun.write(target, blob);
        // stderr, not stdout: a write command's stdout is what the next command
        // consumes, and this one has no handle to hand on.
        process.stderr.write(
          `labkit: wrote ${target} (${(blob.size / 1024 / 1024).toFixed(1)}MB)\n`,
        );
      } finally {
        await connection.close();
      }
    });
}
