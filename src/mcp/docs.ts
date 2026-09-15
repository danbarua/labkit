/**
 * The tool surface, as prose, generated from the tools.
 */

import {
  SESSION_TOOLS,
  TOOLS,
  WRITE_TOOLS,
  type SessionToolDefinition,
  type ToolDefinition,
  type WriteToolDefinition,
} from "./tools";

/** The URI this document is served at. */
export const DOCS_URI = "labkit://docs/tools";

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

export const DOCS_TOOL: MetaToolDefinition = {
  name: "docs",
  title: "How to use this server",
  description:
    "What this server is for and what each tool does, in prose, for a person reading it. " +
    "Tool arguments are already in every caller's tool list, so this does not repeat them.",
  handler: () => renderToolDocs(),
};

/** Tools about the server itself, not the record. Registered first, on every server. */
export const META_TOOLS: readonly MetaToolDefinition[] = [DOCS_TOOL];

/**
 * What every client is told in the `initialize` handshake — before `tools/list`,
 * before any call, whether or not it implements resources. A paragraph, not the
 * page: enough to know what this is and where the rest is.
 */
export const INSTRUCTIONS =
  "LabKit is a research record: questions, the lines of enquiry pursuing them, what was " +
  "measured, what was concluded, the conditions results are held to, and what any of it is " +
  "holding up. Call `now` to see what stands. Every write tool refuses until " +
  "`register_session` has said who you are.";

/** Either kind. The renderer only reads the declaration, never the handler. */
type AnyTool = ToolDefinition | WriteToolDefinition | SessionToolDefinition;

/**
 * The whole document.
 */
export function renderToolDocs(
  reads: readonly ToolDefinition[] = TOOLS,
  writes: readonly WriteToolDefinition[] = WRITE_TOOLS,
  sessions: readonly SessionToolDefinition[] = SESSION_TOOLS,
): string {
  // Sessions first in the body, because the answer to "which do I call first"
  // should not be found by scrolling. They are listed under their own heading
  // rather than folded into the writes: a reader deciding what a tool costs
  // wants "changes the record" to mean the graph, and this one changes only who
  // the next write is signed by.
  const all: AnyTool[] = [...sessions, ...reads, ...writes];
  const writeNames = new Set(writes.map((t) => t.name));
  const sessionNames = new Set(sessions.map((t) => t.name));
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
    "## Before you write",
    "",
    "`register_session` first. The write tools refuse until it has run.",
    "",
    ...index(sessions),
    "",
    "## Recording work",
    "",
    "These change the record.",
    "",
    ...index(writes),
    "",
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
      `*${tool.title}* — ${
        sessionNames.has(tool.name)
          ? "**changes nothing in the record, and is what lets you change it**"
          : writeNames.has(tool.name)
            ? "**changes the record**"
            : "read-only"
      }`,
      "",
      tool.description,
      "",
      "",
      "",
    );
  }
  return lines.join("\n");
}
