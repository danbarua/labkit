/**
 * The graph as a projection of the event stream, and the seam that makes it one consumer rather
 * than the privileged one.
 */

import { NODE_TYPES } from "@labkit/core-db/domain";
import type {
  EdgeLabel,
  EdgeProps,
  GraphChange,
  NodeCreated,
  NodeLabel,
  NodePropsByLabel,
} from "@labkit/core-db/domain";
import type { TenantGraph } from "@labkit/core-db/graph";
import { placeholderFor, type DomainEvent, type Staged } from "./events";

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

/** One command's changes, accumulated in the order the command made them. */
export class UnitOfWork {
  readonly changes: GraphChange[] = [];

  /**
   * Stages a new record under a placeholder and hands it back. One act creates at most one
   * record of a label, so the placeholder names it unambiguously for the rest of the act.
   */
  node<L extends NodeLabel>(label: L, props: NodePropsByLabel[L]): Staged {
    const id = placeholderFor(label);
    this.changes.push(nodeCreated(id, label, { ...props }));
    return id;
  }

  edge(from: string, label: EdgeLabel, to: string, props?: EdgeProps): void {
    this.changes.push({ change: "EdgeCreated", from, label, to, ...(props ? { props } : {}) });
  }

  // `before` is left empty here and filled by `snapshotPriorValues` at the seam.
  // A unit of work stages what an act decided and never reads the graph; the
  // prior values are read once, in one place, just before the delta is recorded.
  set(id: string, props: Record<string, unknown>): void {
    this.changes.push({ change: "NodePropsChanged", id, before: {}, after: props });
  }

  /** The same, for a relationship: an edge is addressed by its triple, not an id. */
  setEdge(from: string, label: EdgeLabel, to: string, props: EdgeProps): void {
    this.changes.push({ change: "EdgePropsChanged", from, label, to, before: {}, after: props });
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

/**
 * Fills each property change's `before` from the graph.
 *
 * Called once, between the act staging its delta and the event being recorded,
 * which is the only instant at which the graph still holds the old values: no
 * projector has run. Every verb that sets a property gets this without knowing
 * it exists.
 */
export async function snapshotPriorValues(
  graph: TenantGraph,
  changes: readonly GraphChange[],
): Promise<GraphChange[]> {
  const out: GraphChange[] = [];
  for (const change of changes) {
    if (change.change === "NodePropsChanged") {
      const held = await graph.nodePropertiesOf(change.id, Object.keys(change.after));
      out.push({ ...change, before: held });
    } else if (change.change === "EdgePropsChanged") {
      const held = await graph.edgePropertiesOf(
        change.from,
        change.label,
        change.to,
        Object.keys(change.after),
      );
      out.push({ ...change, before: held });
    } else out.push(change);
  }
  return out;
}

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
      case "NodePropsChanged":
        for (const [key, value] of Object.entries(change.after))
          await graph.setNodeProperty(change.id, key, value);
        break;
      case "EdgePropsChanged":
        await graph.setEdgeProperties(change.from, change.label, change.to, change.after);
        break;
    }
  }
}
