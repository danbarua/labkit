/**
 * Whether LabKit colours what it writes to a terminal, for the CLI and the record daemon alike.
 */

import { createColors } from "picocolors";

/**
 * Whether to colour a stream. `--no-ansi` (`ansi: false`), a non-empty `NO_COLOR` and
 * `FORCE_COLOR=0` (or `false`) turn it off; any other `FORCE_COLOR` or `CI` turns it on;
 * otherwise it is on for a terminal whose `TERM` is not `dumb`.
 */
export function colourWanted(
  opts: { ansi?: boolean },
  isTTY: boolean | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (opts.ansi === false) return false;
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
  if (env.CI) return true;
  return Boolean(isTTY) && env.TERM !== "dumb";
}

/**
 * One line to stderr, red when {@link colourWanted} says so.
 *
 * `console.error` is not used: Bun colours it red whenever `FORCE_COLOR` is set, whatever
 * `NO_COLOR` and `--no-ansi` say.
 */
export function stderrLine(text: string, opts: { ansi?: boolean } = {}): void {
  const colours = createColors(colourWanted(opts, process.stderr.isTTY));
  process.stderr.write(`${colours.red(text)}\n`);
}
