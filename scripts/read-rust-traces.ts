#!/usr/bin/env bun
/**
 * Reads NDJSON traces from the Rust/Grafeo port (labkit#119, #121) into the
 * same `Trace` shape the Explorer renders for the TS domain.
 *
 * **Two independent models of one domain, not a reference and a copy.**
 * `fragments/run.ts` derives a `Trace` by running the real TS domain;
 * `spikes/labkit-rust/src/main.rs`'s `LABKIT_TRACE_OUT` derives one by
 * running the Rust/Grafeo port. Comparing the two surfaced real disagreements
 * — which node kinds `GOVERNS`/`IMPLEMENTS` connect, which direction
 * `PURSUES` (Rust) vs `MOTIVATES` (TS) runs — that neither side has a reason
 * to call the mistake. `Trace.origin` tags which model produced a given
 * trace so the Explorer never presents one as a correction of the other.
 *
 * One NDJSON file is one `Trace`. `seq` isn't in the file — NDJSON append
 * order already gives it for free (`spikes/labkit-rust/src/main.rs` writes
 * one line per command, in dispatch order) — so it's assigned here as
 * 1-based line position.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type { MintedEdge } from "../src/domain";
import type { Trace, TraceStep } from "../fragments/trace";

interface RustTraceLine {
  operation: string;
  subject: string;
  created: { handle: string; label: string }[];
  edges: MintedEdge[];
  detail: Record<string, unknown>;
  command: string;
  fragment?: string | null;
}

function parseNdjson(name: string, text: string): Trace {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const steps: TraceStep[] = lines.map((line, i) => {
    const parsed = JSON.parse(line) as RustTraceLine;
    return {
      seq: i + 1,
      operation: parsed.operation,
      subject: parsed.subject,
      created: parsed.created,
      edges: parsed.edges,
      detail: parsed.detail,
      command: parsed.command,
      fragment: parsed.fragment ?? undefined,
      // No analogue on this side yet: emit_trace() doesn't compute
      // enquiry/gate state, named as deferred in spikes/labkit-rust/README.md.
      derived: [],
    };
  });
  const fragment = steps.find((s) => s.fragment)?.fragment;
  return { name: fragment ?? name, origin: "labkit-rust", steps };
}

/**
 * Every `*.ndjson` file in `dir`, one `Trace` each.
 *
 * Missing directory is not an error — the Rust port is a spike a checkout
 * may not have built, and the Explorer serves the TS traces regardless.
 */
export async function readRustTraces(dir: string): Promise<Trace[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files = entries.filter((f) => extname(f) === ".ndjson").sort();
  const traces: Trace[] = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    traces.push(parseNdjson(basename(file, ".ndjson"), text));
  }
  return traces;
}
