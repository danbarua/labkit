#!/usr/bin/env bun
/**
 * The composition root, and nothing else.
 *
 * Wiring lives here: which program, which runner, what a failure does to the
 * process. Everything with a decision in it lives elsewhere — `./program.ts`
 * assembles the commands, `./commands/` declares them, `./args.ts` turns text
 * into things the domain accepts, `./views/` turns reports into pages, and
 * `./session.ts` is the wrap that gives a command its surfaces.
 *
 * **This file and the old `src/cli.ts` are the only two places under `src/`
 * that may write to stdout**, which `scripts/check-stdout.sh` enforces —
 * stdout is the MCP protocol channel, and one stray `console.log` in a module
 * the server transitively imports interleaves a non-JSON line into the stream.
 * The views return strings; the printing happens here.
 *
 * **A thrown error is a message, not a stack.** Several verbs *refuse* on
 * purpose — closing on exploratory evidence, reinterpreting into wording that
 * changes nothing — and those refusals are the domain working. A researcher who
 * reads "cannot close on exploratory evidence" has been told what to do next;
 * the same sentence under twenty frames of `bun:internal` has not. Commander
 * handles the other half itself: an `InvalidArgumentError` out of `./args.ts`
 * is a caller's typo and prints as one.
 */

import { buildProgram } from "./program";
import { logFailedRequest, type Adapter } from "../request-log";
import { writeSync } from "node:fs";
import { runner } from "./session";

/**
 * Writes one report to stdout, whatever its size.
 *
 * **A single write does not necessarily write it all.** `runner` renders the
 * whole answer and hands it over in one call, and stdout is not always a file:
 * when it is a pipe — `labkit happened | less`, or `$(labkit …)` — the fd is
 * non-blocking, so one write moves what fits in the pipe buffer, returns that
 * count, and reports no error for the rest. Measured on a 1200-event record:
 * 109,386 bytes to a file, exactly 65,536 through a pipe, exit 0 either way.
 * A caller got a truncated report that looked complete.
 *
 * So the count is the answer, not a formality, and the loop is the fix.
 * `EAGAIN` means the pipe is full rather than broken — the reader has not
 * caught up — so it is retried rather than thrown.
 */
function writeOut(line: string): void {
  const out = Buffer.from(`${line}\n`, "utf8");
  let written = 0;
  while (written < out.length) {
    try {
      written += writeSync(1, out, written, out.length - written);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EAGAIN") throw err;
      // The pipe is full and the reader has not caught up -- `labkit happened
      // | less` sitting at the first page, waiting on a person. Retrying
      // straight away spins a core for as long as they read; a millisecond
      // costs nothing on a reader that is actually draining, since it is only
      // reached when a write was refused.
      Bun.sleepSync(1);
    }
  }
}

/**
 * Parses and runs. Returns a process exit code rather than taking one, so a
 * test can call it.
 *
 * `exitOverride` turns commander's own `process.exit` into a throw, which is
 * what lets `--help` and a bad flag reach the same handler as everything else.
 * Commander reports those with `exitCode` already set and its message already
 * printed, so they pass straight through.
 */

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const program = buildProgram(runner(() => program.opts(), writeOut));
  program.exitOverride();
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (e) {
    const error = e as Error & { exitCode?: number; code?: string };
    // Commander has already printed help or the argument error; it only needs
    // its exit code carrying out.
    if (typeof error.exitCode === "number") return error.exitCode;
    // The request as the user gave it, on stderr, beside the error. `argv` and
    // not the parsed options: a parse failure never produces options, and that
    // is the case this is most useful for — "unexpected input" is exactly what
    // you cannot reconstruct from a stack trace. See `src/request-log.ts`.
    logFailedRequest({ adapter: "cli" satisfies Adapter, argv }, error);
    console.error(`labkit: ${error.message}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
