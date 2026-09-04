/** The graph as a projection of the event stream. */

import type { TenantGraph } from "../db/graph";
import type { DomainEvent } from "./events";

/** Writes an event's changes into the graph, in the order the act made them. */
export async function applyDelta(graph: TenantGraph, event: DomainEvent): Promise<void> {
  for (const change of event.changes) {
    switch (change.change) {
      case "NodeCreated":
        await graph.createNode(change.label, change.props as never, change.id);
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
