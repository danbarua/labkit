/**
 * The tool surface, as prose, generated from the tools.
 *
 * An agent that has just connected can list the tools and read their schemas,
 * but a JSON Schema per tool is a poor way to learn what a *record* is for.
 * This renders the same declarations as documentation: what each tool answers,
 * what it takes, and what comes back, field by field.
 *
 * **Generated at read time, never stored.** There is no checked-in copy to fall
 * behind `TOOLS`, and no generator anyone has to remember to re-run. A tool
 * added, a field renamed, a description reworded — all of it appears here on
 * the next read, because there is nowhere else for it to come from. That is
 * CLAUDE.md's document rule applied to a document: this one cannot be wrong
 * next week, because it does not exist until it is asked for.
 *
 * The types are rendered from **JSON Schema**, not from the Zod objects, for
 * the same reason `server.ts` ships the whole report rather than a chosen
 * subset: JSON Schema is what actually crosses the wire, so a reader is shown
 * the shape they will receive rather than the shape the server thinks in.
 */

import { z } from "zod";
import { TOOLS, type ToolDefinition } from "./tools";
import { historicalSurveySchema, knowledgeSurveySchema } from "./schemas";

/** The URI this document is served at. */
export const DOCS_URI = "labkit://docs/tools";

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

function renderInput(tool: ToolDefinition): string[] {
  const shape = z.object(tool.inputSchema);
  const json = toJson(shape);
  if (!json.properties || Object.keys(json.properties).length === 0) {
    return ["**Takes** nothing."];
  }
  return ["**Takes**", "", ...renderFields(json)];
}

function renderOutput(tool: ToolDefinition): string[] {
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
export function renderToolDocs(tools: readonly ToolDefinition[] = TOOLS): string {
  const lines = [
    "# LabKit — the read tools",
    "",
    "Generated from the server's own tool declarations at the moment you asked",
    "for it. There is no stored copy, so this cannot disagree with the tools.",
    "",
    "Every tool here is **read-only**: none of them changes the record. They",
    "answer questions about a research programme — what it knows, why a",
    "conclusion holds, what rests on a result, and how a wording was arrived at.",
    "",
    "## Tools",
    "",
    ...tools.map((t) => `- [\`${t.name}\`](#${t.name.replace(/_/g, "-")}) — ${t.title}`),
    "",
  ];

  for (const tool of tools) {
    lines.push(
      "---",
      "",
      `## ${tool.name}`,
      "",
      `*${tool.title}*`,
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
