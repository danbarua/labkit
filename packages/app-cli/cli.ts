#!/usr/bin/env bun
/**
 * The composition root, and nothing else.
 */

import { buildProgram } from "./program";
import { logFailedRequest, type Adapter } from "@labkit/core-domain/request-log";
import { DomainRefusal } from "@labkit/core-domain";
import { runner } from "./session";
import { writeOut } from "./stdout";

/**
 * The innermost message, and the SQLSTATE if there is one.
 *
 * A drizzle failure reports `Failed query:` and the whole statement, with the database's own
 * reason two levels down in `cause`. Printing the outer message gives the reader the SQL they
 * already have and none of what went wrong.
 */
function reasonOf(error: Error): string {
  let deepest = error;
  for (let at: unknown = error.cause, depth = 0; at instanceof Error && depth < 8; depth++) {
    deepest = at;
    at = at.cause;
  }
  const code = (deepest as { code?: string }).code;
  return code ? `${deepest.message} [${code}]` : deepest.message;
}

/**
 * Parses and runs. Returns a process exit code rather than taking one, so a test can call it.
 */

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const program = buildProgram(
    runner(
      () => program.opts(),
      (line) => writeOut(`${line}\n`),
    ),
  );
  program.exitOverride();
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (e) {
    const error = e as Error & { exitCode?: number; code?: string };
    // Commander has already printed help or the argument error; it only needs
    // its exit code carrying out.
    if (typeof error.exitCode === "number") return error.exitCode;
    // parseCommand and DomainRefusal are expected refusals: one labkit line,
    // no request-failed JSON.
    if (
      error.name === "ValidationError" ||
      error instanceof DomainRefusal ||
      error.name === "DomainRefusal"
    ) {
      console.error(`labkit: ${error.message}`);
      return 1;
    }
    logFailedRequest({ adapter: "cli" satisfies Adapter, argv }, error);
    console.error(`labkit: ${reasonOf(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
