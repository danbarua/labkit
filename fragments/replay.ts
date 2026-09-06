/**
 * Rebuilds a real record's derived state by projecting its event stream into a
 * fresh scratch graph, so `fragments/derive.ts`'s enquiry/gate snapshots can be
 * taken for a `--db` trace — which `scripts/read-db-trace.ts` cannot do on its
 * own, because there is no time travel in the tenant graph and a snapshot only
 * exists if something ran through the state that produced it.
 *
 * **It applies changes; it does not re-run verbs.** Each event carries the
 * complete delta it made (`GraphChange[]`), so replaying is
 * `graphProjector.apply(event)` — the same projector `WriteSurface` drives
 * live, pointed at a scratch graph instead. Ids come from the events, so the
 * scratch record is handle-for-handle the original.
 *
 * **This is why there is no divergence check any more.** The previous version
 * reissued each event's *command* through `WriteSurface`, which re-ran every
 * invariant and could reach a different record — so it compared the replayed
 * event against the original and refused on any difference, and needed a
 * decoder per verb (`fragments/decode.ts`, deleted with this) plus a rule for
 * retired verbs. You cannot diverge from applying a delta, and a verb added
 * tomorrow needs no replay support at all.
 *
 * What can still fail is the projection itself — a change naming an endpoint
 * that is not there — and that is what `refusedAt` reports. First failure
 * stops the replay; every step up to it keeps its snapshot, and every step
 * from it on reports empty, plus `refusedAt` naming where and why.
 */

import { graphProjector } from "../src/domain/projection";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { labelForNaturalId } from "../src/db/domain";
import { vertexProps } from "../src/db/cypher";
import { inMemoryEventLog } from "../src/domain";
import type { DomainEvent } from "../src/domain";
import { provenanceProjector, type DerivedSnapshot } from "./derive";

export interface ReplayRefusal {
  seq: number;
  operation: string;
  reason: string;
}

export interface ReplayResult {
  provenance: Map<number, DerivedSnapshot>;
  refusedAt?: ReplayRefusal;
}

/**
 * Replays `history` in `seq` order into a fresh temporary database.
 *
 * Hermetic: `dir` is created and removed here, never the caller's own project
 * directory, and `connectScratch` is what makes that true of the *database*
 * as well as of the path — `connectDb` would hand the whole replay to
 * `LABKIT_DB_URL` whenever it is set. The history is the whole input: each
 * event carries the command that produced it, so nothing has to be read back
 * off the live record and its connection need not stay open.
 */
export async function replayIntoScratch(history: readonly DomainEvent[]): Promise<ReplayResult> {
  const dir = mkdtempSync(join(tmpdir(), "labkit-replay-"));
  try {
    const connection = await connectScratch(dir);
    try {
      const tenantCtx = await resolveTenantContext(connection.db, connection.tx, "labkit");
      await scopeToTenant(connection.db, tenantCtx);
      const graph = new TenantGraph(tenantCtx, connection.db, connection.tx);
      const baseEvents = inMemoryEventLog();
      // The graph first, then the snapshot: the second reads what the first
      // wrote, so the list order is the dependency.
      const { projector, provenance } = provenanceProjector(graph, baseEvents);
      // No `WriteSurface` here: nothing issues a command. The two projectors
      // are driven directly, in the order they run live.

      for (const event of history) {
        try {
          await graph.inTransaction(async () => {
            const stamped = await baseEvents.record(event);
            await graphProjector(graph).apply(stamped);
            await projector.apply(stamped);
          });
        } catch (err) {
          return {
            provenance,
            refusedAt: {
              seq: event.seq ?? 0,
              operation: event.operation,
              reason: err instanceof Error ? err.message : String(err),
            },
          };
        }
      }
      return { provenance };
    } finally {
      await connection.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
