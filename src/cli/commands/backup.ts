/**
 * `labkit backup` — the whole record, in one file, before something changes it.
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
