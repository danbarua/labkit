import type { ContentBlock, ToolCall, ToolCallContent } from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
import { diffLines, pretty, STATUS_LABEL } from "./format";

const dataUri = (mimeType: string, data: string): string => `data:${mimeType};base64,${data}`;

/** One content block a tool returned: text as it is, media as media, anything else by its name. */
export function ContentView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return <pre className="lk-pre">{block.text}</pre>;
    case "image":
      return (
        <figure style={{ margin: 0 }}>
          {block.data === "" ? null : (
            <img className="lk-img" alt="" src={dataUri(block.mimeType, block.data)} />
          )}
          {block.uri ? <figcaption className="lk-caption">{block.uri}</figcaption> : null}
        </figure>
      );
    case "audio":
      return (
        <audio controls src={dataUri(block.mimeType, block.data)}>
          <track kind="captions" />
        </audio>
      );
    case "resource_link":
      return (
        <div className="lk-caption">
          {block.title ?? block.name} {block.uri}
        </div>
      );
    case "resource": {
      const { resource } = block;
      return "text" in resource ? (
        <>
          <div className="lk-caption">{resource.uri}</div>
          <pre className="lk-pre">{resource.text}</pre>
        </>
      ) : (
        <div className="lk-caption">binary resource {resource.uri}</div>
      );
    }
    default: {
      const unhandled: never = block;
      void unhandled;
      return null;
    }
  }
}

function DiffView({
  path,
  before,
  after,
}: {
  path: string;
  before?: string | null;
  after: string;
}) {
  const lines = diffLines(before ?? "", after);
  const marker = { same: "  ", add: "+ ", remove: "- " } as const;
  return (
    <div className="lk-diff">
      <div className="lk-diff-path">{path}</div>
      {lines.map((line, i) => (
        // A diff has no stable ids: the same text can appear on many lines.
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
        <code key={i} className={`lk-diff-line ${line.kind}`}>
          {marker[line.kind] + line.text}
        </code>
      ))}
    </div>
  );
}

function ToolContentView({ item }: { item: ToolCallContent }) {
  switch (item.type) {
    case "content":
      return <ContentView block={item.content} />;
    case "diff":
      return <DiffView path={item.path} before={item.oldText} after={item.newText} />;
    case "terminal":
      return <div className="lk-caption">terminal {item.terminalId}</div>;
    default: {
      const unhandled: never = item;
      void unhandled;
      return null;
    }
  }
}

/** What the person decided about a call, in the words of the option they chose. */
function decisionOf(entry: PermissionEntry): { label: string; tone: string } {
  const { outcome } = entry;
  if (outcome === undefined) return { label: "Waiting for you", tone: "waiting" };
  if (outcome.outcome === "cancelled") return { label: "Cancelled", tone: "" };
  const option = entry.request.options.find((o) => o.optionId === outcome.optionId);
  const tone = option?.kind.startsWith("allow") ? "allow" : "reject";
  return { label: option?.name ?? outcome.optionId, tone };
}

export function ToolCard({ call, permission }: { call: ToolCall; permission?: PermissionEntry }) {
  const status = call.status ?? "pending";
  const locations = call.locations ?? [];
  const content = call.content ?? [];
  const decision = permission === undefined ? undefined : decisionOf(permission);
  const hasBody =
    locations.length > 0 ||
    content.length > 0 ||
    call.rawInput !== undefined ||
    call.rawOutput !== undefined;

  return (
    <article className="lk-tool" data-status={status}>
      <div className="lk-tool-head">
        <span className="lk-tool-title">{call.title}</span>
        {call.name ? <span className="lk-tool-name">{call.name}</span> : null}
        <span className="lk-tool-end">
          {call._meta?.["labkit.dev/reconstructed"] === true ? (
            <span
              className="lk-decision"
              title="Rebuilt from the saved result when the session was reopened"
            >
              restored
            </span>
          ) : null}
          {decision === undefined ? null : (
            <span className={`lk-decision ${decision.tone}`}>{decision.label}</span>
          )}
          <span className={`lk-status ${status}`}>{STATUS_LABEL[status]}</span>
        </span>
      </div>
      {hasBody ? (
        <div className="lk-tool-body">
          {locations.length > 0 ? (
            <div className="lk-locations">
              {locations.map((l) => (l.line == null ? l.path : `${l.path}:${l.line}`)).join(", ")}
            </div>
          ) : null}
          {content.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a tool's content has no ids
            <ToolContentView key={i} item={item} />
          ))}
          {call.rawInput !== undefined ? (
            <details className="lk-raw">
              <summary>Input</summary>
              <pre className="lk-pre">{pretty(call.rawInput)}</pre>
            </details>
          ) : null}
          {call.rawOutput !== undefined ? (
            <details className="lk-raw">
              <summary>Output</summary>
              <pre className="lk-pre">{pretty(call.rawOutput)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
