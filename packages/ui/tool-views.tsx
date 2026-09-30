import type { ToolCall } from "@agentclientprotocol/sdk";
import { FileIcon, FolderIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { decode } from "./value";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A path under the workspace, as the person reads it: without the workspace's own prefix. */
const shortPath = (path: string): string => path.replace(/^\/workspace\/?/, "") || ".";

/** `read_file`: the text it returned, numbered from the line it was asked to start at. */
function FileText({ call, output }: { call: ToolCall; output: unknown }) {
  if (!isRecord(output) || typeof output.path !== "string" || typeof output.text !== "string")
    return undefined;
  const input = decode(call.rawInput);
  const first = isRecord(input) && typeof input.line === "number" ? input.line : 1;
  const lines = output.text.replace(/\n$/, "").split("\n");
  return (
    <figure className="lk-file">
      <figcaption className="lk-caption">
        {shortPath(output.path)}
        {lines.length > 0 ? ` · lines ${first}–${first + lines.length - 1}` : ""}
      </figcaption>
      <pre className="lk-file-text">
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
          <code key={i} data-line={first + i}>
            {`${line}\n`}
          </code>
        ))}
      </pre>
    </figure>
  );
}

/** `list_dir`: what the directory holds, directories first. */
function Listing({ output }: { output: unknown }) {
  if (!isRecord(output) || !Array.isArray(output.entries)) return undefined;
  const entries = output.entries.filter(
    (e): e is { name: string; type: string } => isRecord(e) && typeof e.name === "string",
  );
  const sorted = [...entries].sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      a.name.localeCompare(b.name),
  );
  return (
    <figure className="lk-listing">
      <figcaption className="lk-caption">
        {typeof output.path === "string" ? shortPath(output.path) : ""} · {entries.length} entries
      </figcaption>
      <ul>
        {sorted.map((entry) => (
          <li key={entry.name} className={entry.type === "directory" ? "dir" : "file"}>
            {entry.type === "directory" ? (
              <FolderIcon aria-hidden="true" weight="fill" />
            ) : (
              <FileIcon aria-hidden="true" />
            )}
            {entry.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * `write_file`: what was written where, when the agent sent no diff. A diff says the same and
 * shows it, so the call is then drawn by its content.
 */
function Written({ call, output }: { call: ToolCall; output: unknown }) {
  if (call.content?.some((item) => item.type === "diff")) return undefined;
  if (!isRecord(output) || typeof output.path !== "string") return undefined;
  const bytes = typeof output.bytes === "number" ? `${output.bytes} bytes` : "the file";
  return (
    <p className="lk-written">
      Wrote {bytes} to <code>{shortPath(output.path)}</code>
    </p>
  );
}

/** `update_plan`: the plan it published, each entry marked with its status. */
function PlanEntries({ output }: { output: unknown }) {
  if (!isRecord(output) || !Array.isArray(output.entries)) return undefined;
  const entries = output.entries.filter(
    (e): e is { content: string; status?: string } => isRecord(e) && typeof e.content === "string",
  );
  return (
    <section className="lk-plan lk-plan-inline">
      <ol>
        {entries.map((entry, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: plan entries have no ids
          <li key={i} className={entry.status}>
            <span>{entry.content}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

type View = (props: { call: ToolCall; output: unknown }) => ReactNode;

/**
 * The views for particular tools, by name. A view returns nothing when the result is not the
 * shape it knows, and the result is then drawn by its shape, as for a tool with no view.
 */
const VIEWS: Record<string, View> = {
  read_file: FileText,
  list_dir: Listing,
  write_file: Written,
  update_plan: PlanEntries,
};

/**
 * The result of a completed call drawn by the view for its tool, or `undefined` when the tool has
 * no view or its result is not the shape the view knows.
 */
export function toolView(call: ToolCall): ReactNode | undefined {
  if (call.status !== "completed" || call.name == null) return undefined;
  const View = VIEWS[call.name];
  if (View === undefined) return undefined;
  const drawn = View({ call, output: decode(call.rawOutput) });
  return drawn ?? undefined;
}
