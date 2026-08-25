/**
 * The program, assembled.
 *
 * Separate from `./cli.ts` so a test can build the whole command surface and
 * inspect it — names, arguments, options, help — without a database, a process
 * or an exit code. That is the same property `src/mcp/tools.ts` has and says it
 * has: a tool there is data plus a handler, and nothing needs a server to
 * exist.
 *
 * Nothing here knows how to connect to anything. `run` arrives from the
 * composition root and is the only route to a surface.
 */

import { Command } from "commander";
import { registerReads } from "./commands/reads";
import { registerWrites } from "./commands/writes";
import type { Globals, Run } from "./session";

/**
 * The options every command shares.
 *
 * On the root rather than repeated per command, and read back with
 * `optsWithGlobals()` so `labkit --json known` and `labkit known --json` are
 * the same invocation. Order-sensitivity in an argument parser is the kind of
 * defect that looks like the user's mistake, and the monolithic CLI shipped one
 * of those once already.
 */
export function globalOptions(program: Command): Command {
  return program
    .option("--tenant <slug>", "which tenant to read or write", "labkit")
    .option("--db <dir>", "the directory holding .labkit/ (default: $LABKIT_HOME, else cwd)")
    .option("--author <name>", "who to attribute writes to (default: your username)")
    .option("--json", "emit the report as JSON instead of prose");
}

/** Reads the parsed global options back off the root, for {@link runner}. */
export function globalsOf(program: Command): () => Globals {
  return () => program.opts<Globals>();
}

/**
 * Every command, registered against one program.
 *
 * `exitOverride` is not set here: the composition root decides what a parse
 * failure does to the process, and a test that wants an exception rather than
 * an exit says so itself.
 */
export function buildProgram(run: Run): Command {
  const program = new Command("labkit")
    .description("a research record, from the command line")
    .showHelpAfterError();
  globalOptions(program);
  registerReads(program, run);
  registerWrites(program, run);
  return program;
}
