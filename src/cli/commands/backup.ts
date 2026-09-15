/**
 * `labkit backup` — the whole record, in one file, before something changes it.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { connectDb, dataDirFor } from "../../db/connect";
import type { Globals } from "../session";

/** What a dump of a PGlite data directory is, so a name cannot claim otherwise. */
const EXTENSION = ".tar.gz";

export function registerBackup(program: Command): void {
  program
    .command("backup")
    .helpGroup("Operating LabKit")
    .summary("copy the whole record to one file, before something changes it")
    .description("Writes the record's data directory as a gzip tarball. `restore` reads it back.")
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
        throw new Error(`a backup is a gzip tarball. Name it something ending ${EXTENSION}.`);
      if (existsSync(target)) throw new Error(`${target} already exists`);
      mkdirSync(dirname(target), { recursive: true });

      const connection = await connectDb(globals.db);
      try {
        if (!connection.pglite)
          throw new Error(`this record is on a real Postgres (LABKIT_DB_URL). Use pg_dump.`);
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

export function registerRestore(program: Command): void {
  program
    .command("restore")
    .helpGroup("Operating LabKit")
    .summary("read a backup back into a record")
    .description(
      "Unpacks a `backup` tarball into a record directory, which must not already hold one.",
    )
    .requiredOption("--path <file>", `the backup to read (${EXTENSION})`)
    .option("--into <dir>", "where to put it (default: where --db points, else this project)")
    .action(async (opts: { path: string; into?: string }) => {
      const globals = program.opts<Globals>();
      const source = resolve(opts.path);
      if (!existsSync(source)) throw new Error(`no backup at ${source}`);

      const dataDir = dataDirFor(opts.into ?? globals.db);
      if (existsSync(dataDir) && readdirSync(dataDir).length > 0)
        throw new Error(`${dataDir} already holds a record`);
      mkdirSync(dataDir, { recursive: true });

      const tar = Bun.spawnSync(["tar", "xzf", source, "-C", dataDir]);
      if (tar.exitCode !== 0)
        throw new Error(`could not unpack ${source}: ${new TextDecoder().decode(tar.stderr)}`);
      if (!existsSync(join(dataDir, "PG_VERSION")))
        throw new Error(`${source} unpacked, but ${dataDir} is not a database directory`);

      process.stderr.write(`labkit: restored ${source} to ${dataDir}\n`);
      process.stderr.write(`labkit: read it with \`labkit --db ${dataDir}\`\n`);
    });
}
