/**
 * Runs a composition against a real database and returns its trace.
 *
 * **Extracted so a builder and a check cannot fork it.** `scripts/build-traces.ts`
 * writes the traces out and `scripts/check-compositions.ts` asserts they are
 * well formed; both need identical setup — connect, resolve the tenant, step
 * down, build a surface — and two copies of that would drift, with the check
 * passing against a composition the builder can no longer run.
 *
 * Hermetic by construction: the caller supplies a directory and this opens a
 * record inside it. Nothing here reads or writes the project's own `.labkit/`.
 */

import { connectDb } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, inMemoryEventLog, systemClock } from "../src/domain";
import type { Composition } from "./compositions";
import { withProvenance } from "./derive";
import { traceOf, type Trace } from "./trace";

/**
 * One composition, one database.
 *
 * A database **per composition**, not per run: natural ids are sequences, so a
 * shared one would start the second trace at `Q_2` — readable, and a lie about
 * what that scenario built on its own.
 */
export async function runComposition(composition: Composition, dir: string): Promise<Trace> {
  const connection = await connectDb(dir);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const baseEvents = inMemoryEventLog();
    const { events, provenance } = withProvenance(graph, baseEvents);
    await composition.run(new WriteSurface(graph, { clock: systemClock, events }));
    return await traceOf(composition.name, baseEvents, provenance);
  } finally {
    await connection.close();
  }
}
