/**
 * The tool surface, as prose, generated from the tools.
 *
 * An agent that has just connected can list the tools and read their schemas,
 * but a JSON Schema per tool is a poor way to learn what a *record* is for.
 * This renders the same declarations as documentation: what each tool answers,
 * what it takes, and what comes back, field by field.
 *
 * **Generated, in both places it appears.** The resource renders on each read,
 * so it cannot fall behind `TOOLS`. The checked-in copy at `DOCS_FILE` can, and
 * is held to the generator by an assertion in `tests/mcp.test.ts` rather than by
 * a hook or a `check:*` script — the test already renders this document, so
 * freshness is one more assertion in a run that was happening anyway.
 *
 * The copy is checked in for one reason: it is the only place this domain's API
 * is reviewable as a single file, and its **diff** is the useful part — a
 * changed line means the API changed. That is the opposite of the dependency
 * graph, whose byte-stability existed to suppress noise and which was taken out
 * of self-maintenance on 2026-08-21 for putting a generated artefact in every
 * commit. The cost here is the same and is accepted rather than denied: a commit
 * touching `tools.ts` will also touch `docs/mcp-tools.md`.
 *
 * The types are rendered from **JSON Schema**, not from the Zod objects, for
 * the same reason `server.ts` ships the whole report rather than a chosen
 * subset: JSON Schema is what actually crosses the wire, so a reader is shown
 * the shape they will receive rather than the shape the server thinks in.
 */

import { z } from "zod";
import { TOOLS, WRITE_TOOLS, type ToolDefinition, type WriteToolDefinition } from "./tools";
import { historicalSurveySchema, knowledgeSurveySchema } from "./schemas";

/** The URI this document is served at. */
export const DOCS_URI = "labkit://docs/tools";

/**
 * Where the same document is checked in.
 *
 * Named here so the generator, the freshness assertion and the resource all
 * agree on one path rather than three string literals.
 */
export const DOCS_FILE = "docs/mcp-tools.md";

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
};

const toJson = (schema: z.ZodType): JsonSchema => z.toJSONSchema(schema) as JsonSchema;

/**
 * A type, as one line a person can read.
 *
 * Deliberately lossy where JSON Schema is verbose: a nullable enum renders as
 * `"a" | "b" | null` rather than as an `anyOf` of two branches. The full schema
 * is a `tools/list` away for anyone who needs it.
 */
function typeName(s: JsonSchema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.anyOf) return s.anyOf.map(typeName).join(" | ");
  if (s.type === "null") return "null";
  if (s.type === "array") return `${s.items ? typeName(s.items) : "unknown"}[]`;
  if (s.type === "object") return "object";
  return Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "unknown");
}

/** True when a schema has named fields worth expanding under their parent. */
function fieldsOf(s: JsonSchema): Record<string, JsonSchema> | undefined {
  if (s.properties) return s.properties;
  if (s.type === "array" && s.items?.properties) return s.items.properties;
  for (const branch of s.anyOf ?? []) if (branch.properties) return branch.properties;
  return undefined;
}

/** One field per bullet, nested structure indented under it. */
function renderFields(s: JsonSchema, depth = 0): string[] {
  const fields = fieldsOf(s);
  if (!fields || depth > 3) return [];
  // An absent `required` means nothing is required, not that we cannot tell:
  // zod emits the array whenever any field is required. `known`'s only input
  // is optional, and without this it rendered as though it were mandatory.
  const required = new Set(s.required ?? s.items?.required ?? []);
  const pad = "  ".repeat(depth);
  return Object.entries(fields).flatMap(([name, field]) => {
    const optional = required.has(name) ? "" : "?";
    const note = field.description ? ` — ${field.description}` : "";
    return [
      `${pad}- \`${name}${optional}\`: ${typeName(field)}${note}`,
      ...renderFields(field.type === "array" ? (field.items ?? field) : field, depth + 1),
    ];
  });
}

/** Either kind. The renderer only reads the declaration, never the handler. */
type AnyTool = ToolDefinition | WriteToolDefinition;

function renderInput(tool: AnyTool): string[] {
  const shape = z.object(tool.inputSchema);
  const json = toJson(shape);
  if (!json.properties || Object.keys(json.properties).length === 0) {
    return ["**Takes** nothing."];
  }
  return ["**Takes**", "", ...renderFields(json)];
}

function renderOutput(tool: AnyTool): string[] {
  if (tool.outputSchema) return ["**Returns**", "", ...renderFields(toJson(tool.outputSchema))];

  // `known` is the one tool the SDK cannot carry an output schema for -- it
  // returns one of two reports. Both are documented rather than neither; see
  // the comment on that tool in ./tools.ts.
  return [
    "**Returns** one of two shapes, depending on whether `at` was given.",
    "",
    "*Without `at` — what is known now:*",
    "",
    ...renderFields(toJson(knowledgeSurveySchema)),
    "",
    "*With `at` — what was known then:*",
    "",
    ...renderFields(toJson(historicalSurveySchema)),
  ];
}

/**
 * The whole document.
 *
 * Takes the tool list rather than reading the module's, so a test can render a
 * subset and a future server can serve a filtered surface without this needing
 * to know about it.
 */
export function renderToolDocs(
  reads: readonly ToolDefinition[] = TOOLS,
  writes: readonly WriteToolDefinition[] = WRITE_TOOLS,
): string {
  const all: AnyTool[] = [...reads, ...writes];
  const writeNames = new Set(writes.map((t) => t.name));
  const anchor = (t: AnyTool) => `#${t.name.replace(/_/g, "-")}`;
  const index = (list: readonly AnyTool[]) =>
    list.map((t) => `- [\`${t.name}\`](${anchor(t)}) — ${t.title}`);

  const lines = [
    "# LabKit — the tools",
    "",
    "Generated from the server's own tool declarations. Served live at",
    "`labkit://docs/tools`, and checked in at `docs/mcp-tools.md` — the two are",
    "held identical by a test, so neither can disagree with the tools.",
    "",
    "LabKit records **why** a piece of research was done and what rests on it:",
    "questions, the lines of enquiry pursuing them, what was measured, what was",
    "concluded, and what any of it is holding up. Work through it rather than",
    "through notes, and the record can answer questions notes cannot.",
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
      `*${tool.title}* — ${writeNames.has(tool.name) ? "**changes the record**" : "read-only"}`,
      "",
      tool.description,
      "",
      ...renderInput(tool),
      "",
      ...renderOutput(tool),
      "",
    );
  }
  return lines.join("\n");
}
