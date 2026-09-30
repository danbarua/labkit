/**
 * `labkit mcp` — the MCP server, as a subcommand.
 */

import type { Command } from "commander";
import type { RecordLocation } from "@labkit/core-db/connect";
import { main as serveMcp } from "@labkit/app-mcp/server";
import type { Globals } from "../session";

/**
 * Registers `labkit mcp`, serving the record every other command opens.
 */
export function registerServe(program: Command, located: () => RecordLocation): void {
  program
    .command("mcp")
    .helpGroup("Operating LabKit")
    .description("run the MCP server over stdio (for an agent, not a terminal)")
    .option(
      "--read-only",
      "expose only the tools that answer questions, never the ones that change the record",
    )
    .action(async (opts: { readOnly?: boolean }) => {
      // `--tenant` and `--db` are declared on the root, so they are read from the root's options.
      const globals = program.opts<Globals>();
      await serveMcp({
        record: located(),
        tenant: globals.tenant ?? "labkit",
        readOnly: opts.readOnly ?? false,
      });
    });
}
