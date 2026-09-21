/**
 * What a command is handed, and what happens around it.
 */

import { openRecord } from "@labkit/core-domain";
import type { ReadSurface, WriteSurface } from "@labkit/core-domain";
import { commandContext, gitContext, personContext } from "@labkit/core-domain/context";
import type { Clock } from "@labkit/core-domain";
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
  /** `--depth`: how many hops of neighbours an act's `--json` resource embeds. */
  depth?: number;
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
 * The handle an act minted, when the report is an act's rather than a read's.
 *
 * **Told apart by shape, which is the weak part.** A write's report carries `events` and a
 * read's does not — except `happened`, whose whole answer is events, and which is
 * distinguished only by the `more` it pages with. The runner sees one `work` callback for
 * every command and cannot ask whether it wrote; that is what wants fixing, not this.
 */
function mintedBy(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const report = value as { events?: unknown; more?: unknown };
  if ("more" in report) return undefined;
  const events = report.events;
  if (!Array.isArray(events) || events.length === 0) return undefined;
  const subject = (events[0] as { subject?: unknown }).subject;
  return typeof subject === "string" ? subject : undefined;
}

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
      // An act answers with the resource it minted, the same one `GET /workspace/…/Q_1`
      // serves, so a caller can follow its links without a second round trip.
      const minted = opts.json ? mintedBy(answered.value) : undefined;
      const resource =
        minted === undefined ? undefined : await record.graph.entityAsHal(minted, opts.depth ?? 1);
      write(
        opts.json
          ? asJson(resource ?? answered.value)
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
