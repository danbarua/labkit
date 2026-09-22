import { writeSync } from "node:fs";

/**
 * Writes one report to stdout, whatever its size.
 *
 * Stdout to a pipe is non-blocking: a single write moves what fits in the pipe buffer, reports
 * that count, and the process exits before the rest drains. This loops until every byte is out.
 */
export function writeOut(text: string): void {
  const out = Buffer.from(text, "utf8");
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
