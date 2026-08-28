/**
 * An event stream, as the steps a picture can be drawn from.
 *
 * **This is the whole point of the fragment library.** The LabKit Explorer
 * mockup hand-wrote two things per step: the command, and the nodes and edges
 * that command produced. The second half is a second implementation of the
 * domain, kept in a text file, and it was wrong in ways nobody could see —
 * it named eight edges where `recordAnalysis` writes eight, but they were
 * guessed rather than observed.
 *
 * A trace is derived instead: run a composition, read the sink, and every node
 * and edge is what LabKit actually did. A step in a trace cannot disagree with
 * the code, because there is nothing in it that was typed by hand.
 *
 * ## What it does not do
 *
 * It does not reconstruct the CLI. {@link commandOf} renders a plausible
 * command line for display and is **not** a claim that the string would run —
 * the CLI's own argument mapping lives in `src/cli/args.ts` and this does not
 * consult it. Anything asserting on a command string should drive the CLI, as
 * `scripts/smoke-cli.sh` does.
 */

import { labelForNaturalId } from "../src/db/domain";
import type { EventSink, DomainEvent, MintedEdge } from "../src/domain";

/** One act, and what it did to the graph. */
export interface TraceStep {
  seq: number;
  operation: string;
  /** What the act was *about* — often not what it created. */
  subject: string;
  /**
   * Every node the act minted, with its label resolved from the handle prefix.
   *
   * Resolved through `labelForNaturalId` rather than a prefix table copied in
   * here: `Q_` means `Question` in exactly one place, and a second copy is a
   * second thing to go stale.
   */
  created: { handle: string; label: string }[];
  edges: MintedEdge[];
  detail: Record<string, unknown>;
  /** For display. See the file header — not a runnable command. */
  command: string;
}

export interface Trace {
  name: string;
  steps: TraceStep[];
}

/**
 * A command line for a reader, assembled from the operation and its detail.
 *
 * Deliberately loose. `detail` is hand-written per verb and carries what a
 * later query would need, not what the CLI takes — so this shows the shape of
 * the act rather than a line to paste. Verbs whose detail is thin render as
 * just the verb, which is honest.
 */
export function commandOf(e: DomainEvent): string {
  const d = e.detail ?? {};
  const quote = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));
  const args = Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} ${quote(v)}`);
  return `labkit ${e.operation}${args.length ? ` ${args.join(" ")}` : ""}`;
}

/**
 * Reads a sink into a trace.
 *
 * Ordered by `seq`, which every sink assigns since `f4db3a0` — before that the
 * in-memory one left it undefined and this would have had only array order to
 * go on.
 */
export async function traceOf(name: string, events: EventSink): Promise<Trace> {
  const stream = [...(await events.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return {
    name,
    steps: stream.map((e) => ({
      seq: e.seq ?? 0,
      operation: e.operation,
      subject: e.subject,
      created: (e.created ?? []).map((handle) => ({
        handle,
        label: labelForNaturalId(handle),
      })),
      edges: [...(e.edges ?? [])],
      detail: e.detail ?? {},
      command: commandOf(e),
    })),
  };
}

/**
 * Every node and edge a trace brought into existence, folded across its steps.
 *
 * The graph as it stands at the end. A step-by-step renderer does not need
 * this — it accumulates as it goes — but a check that a trace is well formed
 * does, and so does anything asking "what did this scenario build".
 */
export function graphOf(trace: Trace): {
  nodes: { handle: string; label: string }[];
  edges: MintedEdge[];
} {
  const nodes = new Map<string, { handle: string; label: string }>();
  const edges: MintedEdge[] = [];
  for (const step of trace.steps) {
    for (const n of step.created) nodes.set(n.handle, n);
    edges.push(...step.edges);
  }
  return { nodes: [...nodes.values()], edges };
}

/**
 * Every edge endpoint names a node the trace created.
 *
 * **The check the hand-written mockup could not have.** Its data was two lists
 * a person kept in step, and an edge to a node nobody created drew a line into
 * nothing. Here the two come from one run, so this can only fail if LabKit
 * itself connected something it did not make — which is worth knowing.
 */
export function danglingEndpoints(trace: Trace): string[] {
  const { nodes, edges } = graphOf(trace);
  const known = new Set(nodes.map((n) => n.handle));
  const bad = new Set<string>();
  for (const e of edges) {
    if (!known.has(e.from)) bad.add(e.from);
    if (!known.has(e.to)) bad.add(e.to);
  }
  return [...bad].sort();
}
