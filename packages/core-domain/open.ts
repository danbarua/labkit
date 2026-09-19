/**
 * Opening a record: connect, resolve the tenant, step down, build both surfaces.
 *
 * `ResearchSession` in `session.ts` takes a graph and is for tests, which
 * build one themselves. This is how an adapter gets a graph at all.
 */

import { connectDb } from "@labkit/core-db/connect";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { scopeToTenant } from "@labkit/core-db/scoped";
import { TenantGraph } from "@labkit/core-db/graph";
import type { CommandContext } from "./events";
import { pgEventLog } from "./event-store";
import { ReadSurface } from "./read";
import { WriteSurface } from "./write";

/** Which record, whose graph, and who is asking. */
export interface OpenOptions {
  /** Where the record is. Absent means this project's own. */
  db?: string;
  /** Whose graph. Absent means `labkit`. */
  tenant?: string;
  /** Who is acting and when. Adapters differ: a CLI observes git, an agent claims a session. */
  context: CommandContext;
}

/** Both surfaces over one graph, and the connection they hold. */
export interface OpenRecord {
  read: ReadSurface;
  write: WriteSurface;
  graph: TenantGraph;
  close(): Promise<void>;
}

/**
 * The order, once.
 *
 * Everything up to `scopeToTenant` needs the superuser the connection was made
 * as. After it the session is `labkit_app` with its tenant pinned — see
 * `packages/core-db/scoped.ts`.
 */
export async function openRecord(options: OpenOptions): Promise<OpenRecord> {
  const connection = await connectDb(options.db);
  try {
    const ctx = await resolveTenantContext(
      connection.db,
      connection.tx,
      options.tenant ?? "labkit",
    );
    await scopeToTenant(connection.db, ctx);
    // One event log on the same connection as the graph: `emit` runs inside
    // each verb's transaction, so an event and the writes it describes commit
    // together. A second connection would end that silently.
    const events = pgEventLog(connection.db, ctx.tenantId);
    // One graph for both surfaces, so `inTransaction`'s re-entrancy is shared.
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    return {
      graph,
      read: new ReadSurface(graph, { events }),
      write: new WriteSurface(graph, { ...options.context, events }),
      close: () => connection.close(),
    };
  } catch (err) {
    // The connection holds a lock. A failure between opening it and handing it
    // back leaves nobody to close it.
    await connection.close();
    throw err;
  }
}
