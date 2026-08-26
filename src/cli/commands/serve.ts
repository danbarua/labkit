/**
 * `labkit mcp` — the MCP server, as a subcommand.
 *
 * **One binary.** `src/mcp/server.ts` is a program in its own right and was
 * compiled separately for a while; two 77MB executables shipped together came
 * to ~154MB, which is most of a plugin's weight for two copies of the same
 * runtime. The server already exported `main(tenant)`, so this is a call site
 * rather than a refactor.
 *
 * **It does not go through {@link Run}, and that is the whole reason it lives
 * here rather than in `./reads.ts` or `./writes.ts`.** `runner()` opens a
 * database, resolves a tenant, runs one unit of work, prints a report and
 * closes — the shape of a command that answers and exits. The server owns a
 * different lifecycle: it acquires and releases per *tool call*, for as long as
 * an agent's session lasts, and prints nothing a person reads. Handing it a
 * printer and a connection would be handing it the wrong two things.
 *
 * Of the global options only `--tenant` reaches it. `--json` and `--no-ansi`
 * describe how a report is rendered for a human, and nothing here renders a
 * report; `--db` is deliberately absent too — see below.
 */

import type { Command } from "commander";
import { main as serveMcp } from "../../mcp/server";
import type { Globals } from "../session";

/**
 * Registers `labkit mcp`.
 *
 * Takes the program rather than a `Run`, unlike every other command module.
 * `tests/cli/coverage.test.ts` tolerates that by design — it asserts every
 * domain verb has a command, never that every command has a verb, and names
 * `doctor` and `completions` as the same shape.
 *
 * **`--db` is not wired, and that is deliberate rather than an oversight.** The
 * server reads `LABKIT_HOME` (or falls back to the working directory) at
 * `connectDb()`, once per tool call. A `--db` flag would be a second way to say
 * the same thing, set at launch, in a process whose whole configuration is an
 * MCP client's `env` block — and the README's job is hard enough with one
 * lever. Use `LABKIT_HOME`.
 */
export function registerServe(program: Command): void {
  program
    .command("mcp")
    .description("run the MCP server over stdio (for an agent, not a terminal)")
    .action(async () => {
      // `optsWithGlobals` rather than `opts`: `--tenant` is declared on the
      // root, so `labkit --tenant x mcp` and `labkit mcp` must read the same
      // place. The default is applied there, so this is never undefined.
      const globals = program.opts<Globals>();
      await serveMcp(globals.tenant);
    });
}
