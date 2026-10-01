/**
 * What a client is told in the `initialize` handshake, generated from the tools one server
 * registers. Each tool's own description and schema, in `tools/list`, are the documentation.
 */

import type { ToolDefinition, WriteToolDefinition } from "./tools";

/** The tools one server registers, reads and writes apart. */
export interface Registered {
  readonly reads: readonly ToolDefinition[];
  readonly writes: readonly WriteToolDefinition[];
}

/** `a`, `a and b`, `a, b and c` — tool names in backticks. */
function named(tools: readonly { name: string }[]): string {
  const names = tools.map((t) => `\`${t.name}\``);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * What every client is told in the `initialize` handshake, before `tools/list`: what the record
 * is, and the tools this server registers.
 */
export function instructionsFor(registered: Registered): string {
  const reads = registered.reads.length === 0 ? "" : ` ${named(registered.reads)} read it.`;
  const writes = registered.writes.length === 0 ? "" : ` ${named(registered.writes)} change it.`;
  return (
    "LabKit is a research record: questions, the lines of enquiry pursuing them, what was " +
    "measured, what was concluded, and the conditions results are held to." +
    reads +
    writes
  );
}
