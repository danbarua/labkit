/**
 * The tool surface, as prose, generated from the tools.
 *
 * An agent that has just connected can list the tools and read their schemas,
 * but a JSON Schema per tool is a poor way to learn what a *record* is for.
 * This renders the same declarations as documentation: what each tool answers,
 * what it takes, and what comes back, field by field.
 *
 * **Rendered on every read, and stored nowhere.** There is no second copy to go
 * stale, so nothing has to hold two things equal.
 *
 * **Do not check a rendered copy in.** Its only failure mode is "someone
 * regenerated late", catching that costs a build that has to run on
 * documentation, and a generated file beside the code it describes invites a
 * genre of ceremony: parity docs for the other surface, tests asserting the two
 * agree, a gate over all of it.
 *
 * The types are rendered from **JSON Schema**, not from the Zod objects, for
 * the same reason `server.ts` ships the whole report rather than a chosen
 * subset: JSON Schema is what actually crosses the wire, so a reader is shown
 * the shape they will receive rather than the shape the server thinks in.
 */

import { z } from "zod";
import {
  SESSION_TOOLS,
  TOOLS,
  WRITE_TOOLS,
  type SessionToolDefinition,
  type ToolDefinition,
  type WriteToolDefinition,
} from "./tools";
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
  // A union of object branches is still "object" -- `object | object` said
  // nothing, and the branches are expanded underneath by `fieldsOf`.
  if (s.anyOf?.every((b) => b.properties)) return "object";
  if (s.anyOf) return s.anyOf.map(typeName).join(" | ");
  if (s.type === "null") return "null";
  if (s.type === "array") return `${s.items ? typeName(s.items) : "unknown"}[]`;
  if (s.type === "object") return "object";
  return Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "unknown");
}

/**
 * True when a schema has named fields worth expanding under their parent.
 *
 * A union of objects sharing one field set is **merged**, per field, rather
 * than rendered from whichever branch came first. `InputRef` is two branches
 * differing only in a `kind` literal, and taking branch one rendered
 * `kind?: "observations"` — the wrong literal, and marked optional because the
 * parent `anyOf` carries no `required`. A document whose whole job is being
 * reviewable cannot say that.
 *
 * Branches with differing field sets fall back to the first, which is what
 * this did for all unions before. No such case exists on this surface today.
 */
function fieldsOf(s: JsonSchema): Record<string, JsonSchema> | undefined {
  if (s.properties) return s.properties;
  if (s.type === "array" && s.items?.properties) return s.items.properties;
  const branches = s.anyOf?.filter((b) => b.properties) ?? [];
  const first = branches[0];
  if (!first?.properties) return undefined;
  const keys = Object.keys(first.properties);
  const alike = branches.every(
    (b) =>
      Object.keys(b.properties!).length === keys.length && keys.every((k) => k in b.properties!),
  );
  if (!alike) return first.properties;
  return Object.fromEntries(
    keys.map((k) => {
      const variants = branches.map((b) => b.properties![k]!);
      const distinct = [...new Map(variants.map((v) => [JSON.stringify(v), v])).values()];
      return [k, distinct.length === 1 ? distinct[0]! : { anyOf: distinct }];
    }),
  );
}

/** The `required` set that goes with {@link fieldsOf}'s answer. */
function requiredOf(s: JsonSchema): string[] {
  if (s.required) return s.required;
  if (s.items?.required) return s.items.required;
  const branches = s.anyOf?.filter((b) => b.properties) ?? [];
  if (branches.length === 0) return [];
  // Required in every branch, or the document would promise a field one branch
  // may omit.
  return (branches[0]!.required ?? []).filter((k) =>
    branches.every((b) => (b.required ?? []).includes(k)),
  );
}

/** One field per bullet, nested structure indented under it. */
function renderFields(s: JsonSchema, depth = 0): string[] {
  const fields = fieldsOf(s);
  if (!fields || depth > 3) return [];
  // An absent `required` means nothing is required, not that we cannot tell:
  // zod emits the array whenever any field is required. `known`'s only input
  // is optional, and without this it rendered as though it were mandatory.
  const required = new Set(requiredOf(s));
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
type AnyTool = ToolDefinition | WriteToolDefinition | SessionToolDefinition;

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
   *
   * Groups appear in the order the array does rather than in a list written
   * here: the array *is* the presentation order, and a second copy of it would
   * be a second thing to keep in step.
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
    "Generated from the server's own tool declarations on every read, so it",
    "cannot disagree with the tools. Served at `labkit://docs/tools`.",
    "",
    "LabKit records **why** a piece of research was done and what rests on it:",
    "questions, the lines of enquiry pursuing them, what was measured, what was",
    "concluded, and what any of it is holding up. Work through it rather than",
    "through notes, and the record can answer questions notes cannot.",
    "",
    "## Before you write",
    "",
    "The write tools refuse until you have said who you are. LabKit records what",
    "you tell it and verifies nothing — the point is that an entry nobody signed",
    "looks attributed and is not.",
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
      ...renderInput(tool),
      "",
      ...renderOutput(tool),
      "",
    );
  }
  return lines.join("\n");
}
