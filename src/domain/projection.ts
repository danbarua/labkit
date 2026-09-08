/**
 * The graph as a projection of the event stream, and the seam that makes it one consumer rather
 * than the privileged one.
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
