/**
 * Replays a real record's event history into a fresh scratch graph, so
 * `fragments/derive.ts`'s live enquiry/gate snapshots can be taken for a
 * `--db` trace — which `scripts/read-db-trace.ts` could not do on its own,
 * because there is no time travel in the tenant graph; a snapshot only
 * exists if something is running through the state that produced it.
 *
 * **Reproduce exactly, or refuse.** Natural ids are sequences minted in
 * `created` order, so a decoder that reconstructed the same call the
 * original made produces the same handles and the same `edges` — that
 * equality is checked after every step, not only at the end, because a
 * decoder that is subtly wrong (the wrong claim cited, an input dropped)
 * would otherwise draw a *plausible* wrong picture instead of an honest
 * empty one. The alternative — replaying `created`/`edges` structurally with
 * `createNode`/`createEdge` — cannot be checked this way and is wrong for a
 * sharper reason: the event log has no record of a property *mutation*
 * (`promote` sets `Claim.kind`, `graph.ts` sets `Artefact.invalidated`), so a
 * structural replay would silently diverge from the graph a query like
 * `gateStatus` actually sees.
 *
 * First divergence stops the replay. Every step up to it keeps its derived
 * snapshot; every step from it on reports empty, exactly as a trace with no
 * provenance at all does — plus `refusedAt`, naming where and why, so the
 * gap is visible rather than merely missing.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { labelForNaturalId } from "../src/db/domain";
import { vertexProps } from "../src/db/cypher";
import { WriteSurface, inMemoryEventLog, systemClock } from "../src/domain";
import type { DomainEvent, MintedEdge, Operation, RetiredOperation } from "../src/domain";
import { withProvenance, type StepProvenance } from "./derive";
import { currentFragment } from "./provenance";
import { DECODERS, type DecodeContext } from "./decode";

export interface ReplayRefusal {
  seq: number;
  operation: string;
  reason: string;
}

export interface ReplayResult {
  provenance: Map<number, StepProvenance>;
  refusedAt?: ReplayRefusal;
}

/**
 * Every created node's own properties, read once from the live record —
 * `nodeProp` in `decode.ts` needs it for a value nothing edges to (an
 * evidence unit's `statement`, a claim's `kind`, a task's `acceptance`).
 * One query per label rather than per node, since a handle's label is known
 * from its own prefix (`labelForNaturalId`) before any query runs.
 */
export async function fetchNodeProps(
  graph: TenantGraph,
  history: readonly DomainEvent[],
): Promise<Map<string, Record<string, unknown>>> {
  const byLabel = new Map<string, string[]>();
  for (const event of history) {
    for (const handle of event.created) {
      const label = labelForNaturalId(handle);
      const list = byLabel.get(label);
      if (list) list.push(handle);
      else byLabel.set(label, [handle]);
    }
  }
  const props = new Map<string, Record<string, unknown>>();
  for (const [label, ids] of byLabel) {
    const rows = await graph.query(
      `MATCH (n:${label}) WHERE n.natural_id IN $ids RETURN n`,
      { n: vertexProps<Record<string, unknown> & { natural_id: string }>() },
      { ids },
    );
    for (const row of rows) props.set(row.n.natural_id, row.n);
  }
  return props;
}

/** Which claim a piece of evidence supports or challenges, from every such edge in the whole history. */
function buildClaimIndex(history: readonly DomainEvent[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const event of history) {
    for (const edge of event.edges) {
      if (edge.label === "SUPPORTS" || edge.label === "CHALLENGES") index.set(edge.from, edge.to);
    }
  }
  return index;
}

async function consumesOf(graph: TenantGraph, analysis: string): Promise<string[]> {
  const rows = await graph.query(
    `MATCH (:Computation {natural_id: $id})-[:CONSUMES]->(a:Artefact) RETURN a`,
    { a: vertexProps<{ natural_id: string }>() },
    { id: analysis },
  );
  return rows.map((r) => r.a.natural_id);
}

function edgeKey(e: MintedEdge): string {
  return `${e.from}|${e.label}|${e.to}`;
}

/**
 * The operation a retired one replays as.
 *
 * A retired verb's decoder forwards to the verb that replaced it, so the
 * replayed event carries the *new* name while the recorded one carries the
 * old. Without this the check reads that as a divergence and refuses every
 * record written before the retirement — which is every snapshot taken before
 * it, and the whole population the replay exists to read.
 */
const REPLAYS_AS: Record<RetiredOperation, Operation> = { promote: "is" };

/** `undefined` when the replayed step matches; otherwise a one-line reason naming what differed. */
function diverges(original: DomainEvent, replayed: DomainEvent): string | undefined {
  const expected =
    REPLAYS_AS[original.operation as RetiredOperation] ?? (original.operation as Operation);
  if (replayed.operation !== expected)
    return `operation "${replayed.operation}" (expected "${expected}")`;
  if (replayed.subject !== original.subject)
    return `subject "${replayed.subject}" (expected "${original.subject}")`;
  const wantCreated = [...original.created].sort();
  const gotCreated = [...replayed.created].sort();
  if (JSON.stringify(gotCreated) !== JSON.stringify(wantCreated))
    return `created ${JSON.stringify(gotCreated)} (expected ${JSON.stringify(wantCreated)})`;
  const wantEdges = original.edges.map(edgeKey).sort();
  const gotEdges = replayed.edges.map(edgeKey).sort();
  if (JSON.stringify(gotEdges) !== JSON.stringify(wantEdges))
    return `edges ${JSON.stringify(gotEdges)} (expected ${JSON.stringify(wantEdges)})`;
  return undefined;
}

/**
 * Replays `history` in `seq` order into a fresh temporary database, tagging
 * each step with `attribution.attribution_label` the way `fragments/tagged.ts`
 * tags a composition's own moves — so a real record's `fragment` is exactly
 * the probe script (or reviewer) attribution already on the event, verbatim.
 *
 * Hermetic: `dir` is created and removed here, never the caller's own project
 * directory, and `connectScratch` is what makes that true of the *database*
 * as well as of the path — `connectDb` would hand the whole replay to
 * `LABKIT_DB_URL` whenever it is set. `nodeProps` must come from the live record — see
 * {@link fetchNodeProps} — read and handed in before this opens anything,
 * so the live connection need not stay open for the replay's duration.
 */
export async function replayIntoScratch(
  history: readonly DomainEvent[],
  nodeProps: ReadonlyMap<string, Record<string, unknown>>,
): Promise<ReplayResult> {
  const claimIndex = buildClaimIndex(history);
  const dir = mkdtempSync(join(tmpdir(), "labkit-replay-"));
  try {
    const connection = await connectScratch(dir);
    try {
      const tenantCtx = await resolveTenantContext(connection.db, connection.tx, "labkit");
      await scopeToTenant(connection.db, tenantCtx);
      const graph = new TenantGraph(tenantCtx, connection.db, connection.tx);
      const baseEvents = inMemoryEventLog();
      const { events, provenance } = withProvenance(graph, baseEvents);
      const writes = new WriteSurface(graph, { clock: systemClock, events });

      const ctx: DecodeContext = {
        writes,
        nodeProp: (handle, key) => nodeProps.get(handle)?.[key],
        claimFor: (evidence) => claimIndex.get(evidence),
        consumesOf: (analysis) => consumesOf(graph, analysis),
      };

      for (const original of history) {
        const decoder = DECODERS[original.operation as Operation] as
          | ((c: DecodeContext, e: DomainEvent) => Promise<void>)
          | undefined;
        const previousFragment = currentFragment.name;
        currentFragment.name = original.attribution.attribution_label;
        try {
          if (!decoder) throw new Error(`no decoder for operation "${original.operation}"`);
          await decoder(ctx, original);
        } catch (err) {
          return {
            provenance,
            refusedAt: {
              seq: original.seq ?? 0,
              operation: original.operation,
              reason: err instanceof Error ? err.message : String(err),
            },
          };
        } finally {
          currentFragment.name = previousFragment;
        }

        const replayed = [...(await baseEvents.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).at(-1);
        const reason = replayed && diverges(original, replayed);
        if (reason) {
          // `withProvenance` already captured this step's snapshot, taken
          // against the scratch graph's now-diverged state — it does not
          // describe what the original record actually did here, so it must
          // not be served as though it does.
          provenance.delete(replayed!.seq as number);
          return {
            provenance,
            refusedAt: { seq: original.seq ?? 0, operation: original.operation, reason },
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
