/**
 * The tool surface, as prose, generated from the tools one server registers.
 */

import type { ToolDefinition, WriteToolDefinition } from "./tools";

/** The URI this document is served at. */
export const DOCS_URI = "labkit://docs/tools";

/** The tools one server registers, reads and writes apart. A read-only server has no writes. */
export interface Registered {
  readonly reads: readonly ToolDefinition[];
  readonly writes: readonly WriteToolDefinition[];
}

/**
 * The same document as a tool.
 */
export interface MetaToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** The text the tool returns. No surface, no arguments. */
  readonly handler: () => string;
}

/** The name the documentation tool is registered under. */
export const DOCS_TOOL_NAME = "docs";

/** The documentation tool, describing the tools in `registered`. */
export function docsTool(registered: Registered): MetaToolDefinition {
  return {
    name: DOCS_TOOL_NAME,
    title: "How to use this server",
    description:
      "What this server is for and what each of its tools does, in prose, for a person reading " +
      "it. Tool arguments are already in every caller's tool list, so this does not repeat them.",
    handler: () => renderToolDocs(registered),
  };
}

/** Tools about the server itself, not the record. Registered first, on every server. */
export function metaTools(registered: Registered): readonly MetaToolDefinition[] {
  return [docsTool(registered)];
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
  const writes =
    registered.writes.length === 0
      ? " This server does not change the record."
      : ` ${named(registered.writes)} change it.`;
  return (
    "LabKit is a research record: questions, the lines of enquiry pursuing them, what was " +
    "measured, what was concluded, and the conditions results are held to." +
    reads +
    writes +
    ` \`${DOCS_TOOL_NAME}\` describes each tool.`
  );
}

/** Either kind. The renderer only reads the declaration, never the handler. */
type AnyTool = ToolDefinition | WriteToolDefinition;

/**
 * The whole document, for the tools in `registered`.
 */
export function renderToolDocs({ reads, writes }: Registered): string {
  const all: AnyTool[] = [...reads, ...writes];
  const writeNames = new Set(writes.map((t) => t.name));
  const anchor = (t: AnyTool) => `#${t.name.replace(/_/g, "-")}`;
  const entry = (t: AnyTool) => `- [\`${t.name}\`](${anchor(t)}) — ${t.title}`;
  /**
   * The index, under the group each tool declares.
   */
  const index = (list: readonly AnyTool[]) => {
    const lines: string[] = [];
    let current: string | undefined;
    for (const t of list) {
      if (t.group !== current) {
        if (current !== undefined) lines.push("");
        lines.push(`**${t.group}**`, "");
        current = t.group;
      }
      lines.push(entry(t));
    }
    return lines;
  };

  const lines = [
    "# LabKit — the tools",
    "",
    "LabKit records why a piece of research was done and what rests on it:",
    "questions, the lines of enquiry pursuing them, what was measured, what was",
    "concluded, and what any of it is holding up.",
    "",
    ...(writes.length === 0
      ? []
      : ["## Recording work", "", "These change the record.", "", ...index(writes), ""]),
    "## Asking about the record",
    "",
    "These change nothing.",
    "",
    ...index(reads),
    "",
  ];

  for (const tool of all) {
    lines.push(
      "---",
      "",
      `## ${tool.name}`,
      "",
      `*${tool.title}* — ${writeNames.has(tool.name) ? "**changes the record**" : "read-only"}`,
      "",
      tool.description,
      "",
      "",
      "",
    );
  }
  return lines.join("\n");
}
