/**
 * The graph as a projection of the event stream, and the seam that makes it
 * one consumer rather than the privileged one.
 *
 * `GraphChange` is a write-ahead record for a graph store — a node created, an
 * edge created, properties changed — so anything fed the same stream in the
 * same order builds the same state. {@link graphProjector} is what does that
 * for AGE; a second store would be a second {@link Projector} and no change to
 * a verb.
 */

import type {
  EdgeLabel,
  EdgeProps,
  GraphChange,
  NodeCreated,
  NodeLabel,
  NodePropsByLabel,
} from "../db/domain";
import type { TenantGraph } from "../db/graph";
import type { DomainEvent } from "./events";

/**
 * One `NodeCreated`, for one label.
 *
 * A function rather than an object literal at the push: the change type is
 * distributed over the labels, and only here — where `L` is still the single
 * label the caller named — do the label and its property shape line up.
 */
function nodeCreated<L extends NodeLabel>(
  id: string,
  label: L,
  props: NodePropsByLabel[L],
): Extract<NodeCreated, { label: L }> {
  return { change: "NodeCreated", id, label, props } as Extract<NodeCreated, { label: L }>;
}

/**
 * Where a new record's id comes from.
 *
 * The one thing staging needs from a store, named so that it is the *only*
 * thing: a `UnitOfWork` used to hold a whole `TenantGraph` to reach
 * `reserveId`, which put the graph on the command side of the pipeline for a
 * counter's worth of reason. A counter is a valid implementation, which is
 * what makes the staging half testable with no database at all.
 */
export interface IdSource {
  reserve(label: NodeLabel): Promise<string>;
}

/** The natural-id sequences, which are the record's own id source. */
export const naturalIds = (graph: TenantGraph): IdSource => ({
  reserve: (label) => graph.reserveId(label),
});

/** One command's changes, accumulated in the order the command made them. */
export class UnitOfWork {
  readonly changes: GraphChange[] = [];

  constructor(private readonly ids: IdSource) {}

  /** Reserves an id and records the node under it. */
  async node<L extends NodeLabel>(label: L, props: NodePropsByLabel[L]): Promise<string> {
    const id = await this.ids.reserve(label);
    this.changes.push(nodeCreated(id, label, { ...props }));
    return id;
  }

  edge(from: string, label: EdgeLabel, to: string, props?: EdgeProps): void {
    this.changes.push({ change: "EdgeCreated", from, label, to, ...(props ? { props } : {}) });
  }

  set(id: string, props: Record<string, unknown>): void {
    this.changes.push({ change: "PropsChanged", id, props });
  }

  delta(): GraphChange[] {
    return this.changes;
  }
}

/**
 * Something that builds state from the stream.
 *
 * **Runs inside the act's transaction**, on the same connection, so a
 * projection failure rolls the act back with it. That is deliberate and is the
 * whole of what this seam currently promises: an out-of-process consumer reads
 * the committed log on its own terms, and is not one of these.
 *
 * Order is the caller's list order and is load-bearing — a projector that
 * *reads* the graph must come after the one that *writes* it.
 */
export interface Projector {
  apply(event: DomainEvent): Promise<void>;
}

/** The AGE graph, as one consumer of the stream. */
export const graphProjector = (graph: TenantGraph): Projector => ({
  apply: (event) => applyDelta(graph, event),
});

/** Writes an event's changes into the graph, in the order the act made them. */
export async function applyDelta(graph: TenantGraph, event: DomainEvent): Promise<void> {
  for (const change of event.changes) {
    switch (change.change) {
      case "NodeCreated":
        await graph.createNode(change.label, change.props, change.id);
        break;
      case "EdgeCreated":
        await graph.createEdge(change.from, change.label, change.to, change.props);
        break;
      case "PropsChanged":
        for (const [key, value] of Object.entries(change.props))
          await graph.setNodeProperty(change.id, key, value);
        break;
    }
  }
}
