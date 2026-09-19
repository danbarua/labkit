/**
 * What a command is handed, and what happens around it.
 */

import { openRecord } from "../core-domain";
import type { ReadSurface, WriteSurface } from "../core-domain";
import { commandContext, gitContext, personContext } from "../core-domain/context";
import type { Clock } from "../core-domain";
import { asJson, type Answer } from "./output";
import { isColorSupported } from "picocolors";
import { type Palette, palette } from "./palette";
import { colourHandles, shortenInstants, wrap } from "./views/format";
import { colourVocabulary } from "./vocabulary";

/** The global options, after parsing. */
export interface Globals {
  tenant?: string;
  db?: string;
  author?: string;
  /**
   * `--reconstructed-from`, falling back to `$LABKIT_RECONSTRUCTED_FROM` — what an act was read
   * off, for work somebody else did. Not lateness: your own run written up afterwards was
   * performed and takes nothing here. A script transcribing a finished programme exports it
   * once; `labkit happened` shows it on every act, which is what makes a stale one visible.
   */
  reconstructedFrom?: string;
  json?: boolean;
  /** Commander's negatable `--no-ansi`: present and `false` when passed. */
  ansi?: boolean;
  /**
   * `--date`, hidden from `--help` — see {@link globalOptions}. An ISO
   * instant every write in this command is recorded as having happened at,
   * in place of the wall clock.
   */
  date?: string;
}

/**
 * Whether to colour, decided once and here.
 */
export function coloursFor(opts: Globals): Palette {
  return palette(opts.ansi !== false && isColorSupported);
}

/** Both halves, held separately so a command can only reach the one it was given. */
export interface Surfaces {
  read: ReadSurface;
  write: WriteSurface;
}

/**
 * Runs one command's work with surfaces, then prints its answer.
 */
export type Run = (work: (surfaces: Surfaces) => Promise<Answer>) => Promise<void>;

/**
 * The wrap: connect, resolve, build, run, print, close.
 */
export function runner(globals: () => Globals, write: (line: string) => void): Run {
  return async (work) => {
    const opts = globals();
    const clock: Clock | undefined = opts.date ? { now: () => opts.date! } : undefined;
    const record = await openRecord({
      ...(opts.db === undefined ? {} : { db: opts.db }),
      ...(opts.tenant === undefined ? {} : { tenant: opts.tenant }),
      context: commandContext(
        gitContext,
        personContext(opts.author),
        clock,
        opts.reconstructedFrom ?? process.env.LABKIT_RECONSTRUCTED_FROM,
      ),
    });
    try {
      const answered = await work({ read: record.read, write: record.write });
      // Wrapped here, not in each view: every report goes out through this
      // line, and a view that forgot was a 1,300-column line in `now`.
      const colours = coloursFor(opts);
      write(
        opts.json
          ? asJson(answered.value)
          : wrap(
              shortenInstants(
                colourVocabulary(colourHandles(answered.render(colours), colours.handle), colours),
                colours,
              ),
            ),
      );
    } finally {
      await record.close();
    }
  };
}
