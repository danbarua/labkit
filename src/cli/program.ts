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
import pkg from "../../package.json" with { type: "json" };
import { worktreeName } from "../worktree";
import { isoInstant } from "./args";
import { registerReads } from "./commands/reads";
import { registerWrites } from "./commands/writes";
import { registerBackup } from "./commands/backup";
import { registerServe } from "./commands/serve";
import type { Run } from "./session";

const VERSION = pkg.version;

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
  return (
    program
      .option("--tenant <slug>", "which tenant to read or write", "labkit")
      .option(
        "--db <dir>",
        "the directory holding .labkit/ (default: $LABKIT_HOME, else the nearest .labkit/ at or above cwd)",
      )
      .option("--author <name>", "who to attribute writes to (default: your username)")
      .option("--json", "emit the report as JSON instead of prose")
      // Negatable, so the flag reads as `--no-ansi` and defaults on. It only
      // subtracts: colour is off already when stdout is not a terminal or
      // `NO_COLOR` is set, and `--json` is never coloured at all.
      .option("--no-ansi", "never colour the output")
      // Hidden from `--help` deliberately -- a `sudo` for the clock, not a
      // documented feature. It exists for backfilling real historical work
      // (bonsai-2026: a record whose events predate labkit's own existence),
      // not for stating "this is happening now" a different way, and a
      // caller reaching for it has to already know it is there.
      .addOption(
        program
          .createOption(
            "--date <iso>",
            "record every write in this command as having happened then",
          )
          .argParser(isoInstant)
          .hideHelp(),
      )
  );
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
    // The worktree is a diagnostic, not a version: two checkouts of one
    // repository run two stacks, and an answer that does not say which one
    // produced it is what made a green `/healthz` describe someone else's
    // server. Omitted when there is no git to ask -- a compiled binary on a
    // host without it has no checkout to name, and inventing one would be
    // exactly the meaningless-but-actionable value this is here to remove.
    .version(worktreeName() ? `${VERSION} (${worktreeName()})` : VERSION)
    .showHelpAfterError();
  globalOptions(program);
  registerReads(program, run);
  registerWrites(program, run);
  // Outside the two registries and without `run`: the server owns its own
  // connection lifecycle and prints no report. See ./commands/serve.ts.
  registerServe(program);
  registerBackup(program);
  return program;
}
