/**
 * `labkit mcp` — the MCP server, as a subcommand.
 */

import type { Command } from "commander";
import { main as serveMcp } from "../../mcp/server";
import type { Globals } from "../session";

/**
 * Registers `labkit mcp`.
 */
export function registerServe(program: Command): void {
  program
    .command("mcp")
    .helpGroup("Operating LabKit")
    .description("run the MCP server over stdio (for an agent, not a terminal)")
    .option(
      "--read-only",
      "expose only the tools that answer questions, never the ones that change the record",
    )
    .action(async (opts: { readOnly?: boolean }) => {
      // `optsWithGlobals` rather than `opts`: `--tenant` is declared on the
      // root, so `labkit --tenant x mcp` and `labkit mcp` must read the same
      // place. The default is applied there, so this is never undefined.
      const globals = program.opts<Globals>();
      await serveMcp(globals.tenant, { readOnly: opts.readOnly ?? false });
    });
}
