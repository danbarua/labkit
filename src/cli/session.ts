/**
 * What a command is handed, and what happens around it.
 *
 * A command declares arguments and answers with a report and a view. It never
 * opens a connection, never resolves a tenant, never prints, and never sees
 * `--json`. Everything in that sentence is this file's job, and keeping it out
 * of eighteen command bodies is most of the reason the monolithic `src/cli.ts`
 * had a switch statement five hundred lines long.
 *
 * This is the pipeline the user asked for and it is a function, not a
 * framework feature: `withSurfaces` wraps every invocation with the connection,
 * the tenant, the durable event sink and the attribution — the same wrap
 * `src/mcp/server.ts` performs per tool call, expressed once.
 */

import { connectDb } from "../db/connect";
import { resolveTenantContext } from "../db/tenant";
import { TenantGraph } from "../db/graph";
import { ReadSurface, WriteSurface } from "../domain";
import { pgEventLog } from "../domain/event-store";
import { commandContext, gitContext, personContext } from "../attribution";
import { asJson, type Answer } from "./output";
import { isColorSupported } from "picocolors";
import { type Palette, palette } from "./palette";

/** The global options, after parsing. */
export interface Globals {
  tenant?: string;
  db?: string;
  author?: string;
  json?: boolean;
  /** Commander's negatable `--no-ansi`: present and `false` when passed. */
  ansi?: boolean;
}

/**
 * Whether to colour, decided once and here.
 *
 * `picocolors.isColorSupported` is reused rather than reimplemented — it is
 * what handles `NO_COLOR`, `FORCE_COLOR`, a dumb terminal and a pipe, and it
 * was measured to get all of those right under Bun where two alternatives did
 * not. `--no-ansi` only ever turns it *off*: a caller who has piped the output
 * and asks for colour anyway has `FORCE_COLOR`, which picocolors already reads.
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
 *
 * Injected into the command modules rather than imported by them, so a test can
 * hand them surfaces over a scenario graph without a database, a tenant or a
 * process to exit.
 */
export type Run = (work: (surfaces: Surfaces) => Promise<Answer>) => Promise<void>;

/**
 * The wrap: connect, resolve, build, run, print, close.
 *
 * **Both surfaces get the same event sink, and it is passed in rather than
 * defaulted.** `SessionCore` falls back to `inMemoryEventLog()`, which in a
 * process that exits after one command is an array nothing ever wrote to. On
 * the read side `happened` then reports that nothing has ever happened against
 * a full database; on the write side a verb commits its graph changes durably
 * while the event describing them dies at exit — durable state with no record
 * of the act that caused it. Both are confidently wrong rather than empty.
 *
 * **Attribution is real here, not the mocks the MCP server runs on.** A person
 * at a terminal has a name and the tree they are standing in has a HEAD.
 * `--author` overrides the username, because a script driving LabKit is not the
 * account it runs under.
 *
 * One `TenantGraph` for both halves, so `inTransaction`'s re-entrancy depth is
 * shared — the composition `src/domain/session.ts` specifies for an adapter
 * holding both.
 */
export function runner(globals: () => Globals, write: (line: string) => void): Run {
  return async (work) => {
    const opts = globals();
    const connection = await connectDb(opts.db);
    try {
      const ctx = await resolveTenantContext(connection.db, opts.tenant ?? "labkit");
      const events = pgEventLog(connection.db, ctx.tenantId);
      const graph = new TenantGraph(ctx, connection.db, connection.tx);
      const answered = await work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(gitContext, personContext(opts.author)),
          events,
        }),
      });
      write(opts.json ? asJson(answered.value) : answered.render(coloursFor(opts)));
    } finally {
      await connection.close();
    }
  };
}
