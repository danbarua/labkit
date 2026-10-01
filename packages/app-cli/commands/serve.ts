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
    .action(async () => {
      // `--tenant` and `--db` are declared on the root, so they are read from the root's options.
      const globals = program.opts<Globals>();
      await serveMcp({
        record: located(),
        tenant: globals.tenant ?? "labkit",
      });
    });
}
