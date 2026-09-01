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

import { labelForNaturalId } from "../src/db/domain";
import type { TenantGraph } from "../src/db/graph";
import type { EventFilter, EventSink } from "../src/domain";
import { ReadSurface, systemClock } from "../src/domain";
import { ref } from "../src/domain/report";
import { currentFragment } from "./provenance";

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

export interface StepProvenance {
  fragment: string | undefined;
  derived: DerivedSnapshot;
}

/**
 * Wraps an event sink so every `record` also captures which fragment was
 * running and a derived-state snapshot, keyed by the event's `seq`.
 *
 * The wrapper is the whole mechanism: neither the surface nor a fragment
 * needs to know this exists, so nothing here can go stale from a fragment
 * forgetting to report itself.
 */
export function withProvenance(
  graph: TenantGraph,
  base: EventSink,
): { events: EventSink; provenance: Map<number, StepProvenance> } {
  const reads = new ReadSurface(graph, { clock: systemClock, events: base });
  const provenance = new Map<number, StepProvenance>();
  const enquiryHandles: string[] = [];
  const gateHandles: string[] = [];

  const events: EventSink = {
    record: async (event) => {
      const stamped = await base.record(event);
      for (const handle of stamped.created) {
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
      provenance.set(stamped.seq as number, {
        fragment: currentFragment.name,
        derived: { enquiries, gates },
      });
      return stamped;
    },
    all: () => base.all(),
    select: (filter: EventFilter) => base.select(filter),
  };

  return { events, provenance };
}
