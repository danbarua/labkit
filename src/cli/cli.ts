#!/usr/bin/env bun
/**
 * The composition root, and nothing else.
 */

import { buildProgram } from "./program";
import { logFailedRequest, type Adapter } from "../request-log";
import { writeSync } from "node:fs";
import { runner } from "./session";

/**
 * Writes one report to stdout, whatever its size.
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
 * Parses and runs. Returns a process exit code rather than taking one, so a test can call it.
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
