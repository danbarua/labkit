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
import type { Command, EdgeCreated, EventSink, DomainEvent } from "../src/domain";
import type { DerivedSnapshot, StepProvenance } from "./derive";

/**
 * One entity's researcher-language state at a step, and whether this step
 * changed it — see `fragments/derive.ts`'s header for why this is a
 * different question from `created`/`edges`.
 */
export interface DerivedItem {
  kind: "enquiry" | "gate";
  handle: string;
  state: string;
  changed: boolean;
  from?: string;
}

/** One act, and what it did to the graph. */
export interface TraceStep {
  seq: number;
  /** When the act was recorded — not necessarily when `seq` places it in the stream; see `--date` backfill. */
  at: string;
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
  edges: EdgeCreated[];
  /** The command the caller issued, verbatim. */
  issued: Command;
  /** For display. See the file header — not a runnable command. */
  command: string;
  /** Which `fragments/index.ts` move produced this step, if any composition was tagged (`fragments/tagged.ts`). */
  fragment?: string;
  /** Every known enquiry and gate's state after this step, and which of them this step changed. */
  derived: DerivedItem[];
}

export interface Trace {
  name: string;
  /**
   * Which implementation, or which kind of record, produced this trace.
   *
   * `"labkit-ts"` and `"labkit-rust"` are two independent implementations of
   * the same domain (#114) and diverge on real questions — edge direction,
   * which node kinds an edge connects — that neither side has settled as
   * "correct". `"labkit-db"` (#124/#126) is a different axis entirely: not a
   * different implementation, but a real record built through the CLI or MCP
   * server over real time, read back from its durable `pgEventLog` rather
   * than run fresh in a temp directory. A composition is a rehearsal; this is
   * the thing being rehearsed for. The Explorer must not present one as the
   * other, for the same reason it tags the two implementations — a viewer
   * needs to know whether they're looking at a scripted arc or somebody's
   * actual research.
   */
  origin: "labkit-ts" | "labkit-rust" | "labkit-db";
  steps: TraceStep[];
  /**
   * Set only when a `labkit-db` trace's replay (`fragments/replay.ts`)
   * diverged from the record it was reproducing. Every step from the named
   * `seq` onward reports empty `derived` and no `fragment`, the same as a
   * trace with no provenance at all — this names where and why, rather than
   * leaving the gap to look like nobody tried.
   */
  derivedUnavailable?: string;
}

/**
 * A command line for a reader, assembled from the operation and the command.
 *
 * Deliberately loose: the flag names are the command's field names, which is
 * the shape of the act rather than a line to paste — the CLI spells some of
 * them differently.
 */
export function commandOf(e: DomainEvent): string {
  const d = e.command as Record<string, unknown>;
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
 *
 * `provenance` is optional so a caller with no derived-state tracking (a
 * fragment run directly against `./index` rather than `./tagged`) still gets
 * a trace — every step's `derived` is simply empty and `fragment` absent.
 */
export async function traceOf(
  name: string,
  events: EventSink,
  provenance?: ReadonlyMap<number, StepProvenance>,
): Promise<Trace> {
  const stream = [...(await events.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  let previous: DerivedSnapshot = { enquiries: [], gates: [] };
  return {
    name,
    origin: "labkit-ts",
    steps: stream.map((e) => {
      const seq = e.seq ?? 0;
      const snapshot = provenance?.get(seq)?.derived;
      const derived = snapshot ? diffDerived(previous, snapshot) : [];
      if (snapshot) previous = snapshot;
      return {
        seq,
        at: e.at,
        operation: e.operation,
        subject: e.subject,
        created: e.changes.flatMap((c) =>
          c.change === "NodeCreated" ? [{ handle: c.id, label: c.label as string }] : [],
        ),
        edges: e.changes.flatMap((c) => (c.change === "EdgeCreated" ? [c] : [])),
        issued: e.command,
        command: commandOf(e),
        fragment: provenance?.get(seq)?.fragment,
        derived,
      };
    }),
  };
}

/** State a gate or enquiry snapshot reads as, in the researcher's own vocabulary. */
function gateState(g: { state: string }): string {
  return g.state;
}
function enquiryState(q: { open: boolean; closure: string | null }): string {
  return q.closure ?? (q.open ? "open" : "closed");
}

function diffDerived(previous: DerivedSnapshot, next: DerivedSnapshot): DerivedItem[] {
  const items: DerivedItem[] = [];
  for (const gate of next.gates) {
    const before = previous.gates.find((g) => g.handle === gate.handle);
    const state = gateState(gate);
    const from = before ? gateState(before) : undefined;
    items.push({ kind: "gate", handle: gate.handle, state, changed: from !== state, from });
  }
  for (const enquiry of next.enquiries) {
    const before = previous.enquiries.find((q) => q.handle === enquiry.handle);
    const state = enquiryState(enquiry);
    const from = before ? enquiryState(before) : undefined;
    items.push({ kind: "enquiry", handle: enquiry.handle, state, changed: from !== state, from });
  }
  return items;
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
  edges: EdgeCreated[];
} {
  const nodes = new Map<string, { handle: string; label: string }>();
  const edges: EdgeCreated[] = [];
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
