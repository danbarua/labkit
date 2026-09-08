/**
 * What a command is handed, and what happens around it.
 */

import { connectDb } from "../db/connect";
import { resolveTenantContext } from "../db/tenant";
import { scopeToTenant } from "../db/scoped";
import { TenantGraph } from "../db/graph";
import { ReadSurface, WriteSurface } from "../domain";
import { pgEventLog } from "../domain/event-store";
import { commandContext, gitContext, personContext } from "../attribution";
import type { Clock } from "../domain";
import { asJson, type Answer } from "./output";
import { isColorSupported } from "picocolors";
import { type Palette, palette } from "./palette";

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
    const connection = await connectDb(opts.db);
    try {
      const ctx = await resolveTenantContext(connection.db, connection.tx, opts.tenant ?? "labkit");
      // Everything above this line needs the superuser it connected as -- `LOAD
      // 'age'` and the graph DDL both. Everything below runs as `labkit_app`
      // with its tenant pinned, so a read that forgets to filter still cannot
      // see another tenant's events. See src/db/scoped.ts for what that is and
      // is not worth.
      await scopeToTenant(connection.db, ctx);
      const events = pgEventLog(connection.db, ctx.tenantId);
      const graph = new TenantGraph(ctx, connection.db, connection.tx);
      const clock: Clock | undefined = opts.date ? { now: () => opts.date! } : undefined;
      const answered = await work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(
            gitContext,
            personContext(opts.author),
            clock,
            opts.reconstructedFrom ?? process.env.LABKIT_RECONSTRUCTED_FROM,
          ),
          events,
        }),
      });
      write(opts.json ? asJson(answered.value) : answered.render(coloursFor(opts)));
    } finally {
      await connection.close();
    }
  };
}
