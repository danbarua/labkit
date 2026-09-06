/**
 * Per-step snapshots of what LabKit *says* about the research, not just what
 * the graph holds.
 *
 * A step's `created`/`edges` are the physical mutation an act made. That is a
 * different question from "did anything change about what a researcher would
 * say is true" — a gate can sit at `never-evaluated` through several
 * unrelated steps, and a step that writes eight edges can leave every
 * enquiry's closure untouched. This is this repo's own recurring defect class
 * (PJ-029: the graph is correct and a read projection is wrong), and the
 * Explorer's derived-state panel exists to make that class visible one step
 * at a time, reusing the same `ReadSurface` reports every other consumer
 * does — `enquiryStatus` and `gateStatus` — rather than a bespoke read.
 *
 * **Snapshotting has to happen live, during the run.** `ReadSurface` has no
 * way to ask "what would this query have answered three steps ago" — there is
 * no time travel in the tenant graph — so a wrapped event sink calls it
 * immediately after each event is durably recorded, while the graph is in
 * exactly the state that event left it.
 */

import { createdIn } from "../src/domain";
import { labelForNaturalId } from "../src/db/domain";
import type { TenantGraph } from "../src/db/graph";
import type { EventSink } from "../src/domain";
import type { Projector } from "../src/domain/projection";
import { ReadSurface, systemClock } from "../src/domain";
import { ref } from "../src/domain/report";

export interface EnquirySnapshot {
  handle: string;
  asks: string | null;
  open: boolean;
  closure: string | null;
}

export interface GateSnapshot {
  handle: string;
  state: string;
}

export interface DerivedSnapshot {
  enquiries: EnquirySnapshot[];
  gates: GateSnapshot[];
}

/**
 * A projector that captures a derived-state snapshot after every event,
 * keyed by the event's `seq`.
 *
 * A second consumer of the same event stream, which is the whole mechanism:
 * nothing that writes an event needs to know this exists.
 */
export function provenanceProjector(
  graph: TenantGraph,
  events: EventSink,
): { projector: Projector; provenance: Map<number, DerivedSnapshot> } {
  const reads = new ReadSurface(graph, { clock: systemClock, events });
  const provenance = new Map<number, DerivedSnapshot>();
  const enquiryHandles: string[] = [];
  const gateHandles: string[] = [];

  const projector: Projector = {
    // **Second, after the graph projector.** These reads ask the graph what
    // the act did, so a list that put this first would snapshot the record as
    // it stood before the act — every snapshot one step stale, and nothing
    // failing to say so.
    apply: async (stamped) => {
      for (const handle of createdIn(stamped)) {
        if (labelForNaturalId(handle) === "LineOfEnquiry") enquiryHandles.push(handle);
        if (labelForNaturalId(handle) === "Gate") gateHandles.push(handle);
      }
      const enquiries = await Promise.all(
        enquiryHandles.map(async (handle): Promise<EnquirySnapshot> => {
          const status = await reads.enquiryStatus(ref("enquiry", handle));
          return {
            handle,
            asks: status.question?.asks ?? null,
            open: status.question?.open ?? true,
            closure: status.question?.closure ?? null,
          };
        }),
      );
      const gates = await Promise.all(
        gateHandles.map(async (handle): Promise<GateSnapshot> => {
          const status = await reads.gateStatus(ref("gate", handle));
          return { handle, state: status.state };
        }),
      );
      provenance.set(stamped.seq as number, { enquiries, gates });
    },
  };

  return { projector, provenance };
}
