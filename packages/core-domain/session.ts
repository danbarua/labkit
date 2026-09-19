/**
 * `ResearchSession` — tests-only convenience that holds both surfaces.
 *
 * CLI and MCP take `ReadSurface` / `WriteSurface` directly. Callers here use
 * `session.writes.pose` and `session.reads.whySupported`.
 */

import type { TenantGraph } from "@labkit/core-db/graph";
import type { EventSink } from "./events";
import { ReadSurface } from "./read";
import { WriteSurface } from "./write";
import type { ResearchSessionOptions } from "./core";

export type { ResearchSessionOptions } from "./core";
export { SessionCore } from "./core";
export { ReadSurface } from "./read";
export { WriteSurface } from "./write";

export class ResearchSession {
  readonly reads: ReadSurface;
  readonly writes: WriteSurface;
  readonly events: EventSink;

  constructor(graph: TenantGraph, options: ResearchSessionOptions = {}) {
    // One options object, so both halves share a clock and an event sink; and
    // one `TenantGraph`, so `inTransaction`'s re-entrancy depth is shared.
    this.writes = new WriteSurface(graph, options);
    this.reads = new ReadSurface(graph, {
      ...options,
      events: this.writes.events,
    });
    this.events = this.writes.events;
  }
}
