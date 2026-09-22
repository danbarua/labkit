/**
 * `labkit dump` and `labkit restore` — the whole record as one SQL file, and back.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { connectDb, dataDirFor } from "@labkit/core-db/connect";
import { dumpPostgres, dumpSql, restoreInto, restorePostgres } from "@labkit/core-db/dump";
import type { Globals } from "../session";
import { writeOut } from "../stdout";

export function registerDump(program: Command): void {
  program
    .command("dump [file]")
    .helpGroup("Operating LabKit")
    .summary("write the whole record as SQL, to a file or to stdout")
    .description(
      "The record as one `.sql` file: what `restore` reads, on an embedded record or a real Postgres.",
    )
    .action(async (file: string | undefined) => {
      const globals = program.opts<Globals>();
      const target = file === undefined ? undefined : resolve(file);
      if (target !== undefined && existsSync(target)) throw new Error(`${target} already exists`);

      const url = process.env.LABKIT_DB_URL;
      let sql: string;
      if (url) {
        sql = await dumpPostgres(url);
      } else {
        const connection = await connectDb(globals.db);
        try {
          sql = await dumpSql(connection);
        } finally {
          await connection.close();
        }
      }

      if (target === undefined) {
        writeOut(sql);
        return;
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, sql);
      process.stderr.write(`labkit: wrote ${target} (${(sql.length / 1024).toFixed(0)}KB)\n`);
    });
}

export function registerRestore(program: Command): void {
  program
    .command("restore <file>")
    .helpGroup("Operating LabKit")
    .summary("read a dump into a new record")
    .description(
      "Reads a `dump` file (`-` for stdin) into a record that does not exist yet: a new " +
        "directory, or the empty database `LABKIT_DB_URL` names.",
    )
    .option("--into <dir>", "where to put it (default: where --db points, else this project)")
    .action(async (file: string, opts: { into?: string }) => {
      const globals = program.opts<Globals>();
      const sql = file === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(file), "utf8");

      const url = process.env.LABKIT_DB_URL;
      if (url) {
        await restorePostgres(url, sql);
        process.stderr.write(`labkit: restored ${file} into ${url.replace(/\/\/[^@]*@/, "//")}\n`);
        return;
      }

      const dataDir = dataDirFor(opts.into ?? globals.db);
      if (existsSync(dataDir) && readdirSync(dataDir).length > 0)
        throw new Error(`${dataDir} already holds a record`);
      mkdirSync(dataDir, { recursive: true });
      await restoreInto(dataDir, sql);
      process.stderr.write(`labkit: restored ${file} to ${dataDir}\n`);
      process.stderr.write(`labkit: read it with \`labkit --db ${dataDir}\`\n`);
    });
}
