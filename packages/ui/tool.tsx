import type { ContentBlock, ToolCall, ToolCallContent } from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
import { CaretRightIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { diffLines, STATUS_LABEL } from "./format";
import { ArgumentsLine, inlineArguments, inputPreview, sameValue, ValueView } from "./value";

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
      // A tool's text is often its result serialised: drawn by shape, not as an escaped string.
      return item.content.type === "text" ? (
        <ValueView value={item.content.text} />
      ) : (
        <ContentView block={item.content} />
      );
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

/**
 * Whether `rawOutput` says only what the drawn content already says. Tools commonly report one
 * result twice, as a text block and as the raw output; drawing both repeats it.
 */
function outputRepeatsContent(content: readonly ToolCallContent[], rawOutput: unknown): boolean {
  if (content.length !== 1) return false;
  const [only] = content;
  return only?.type === "content" && only.content.type === "text"
    ? sameValue(only.content.text, rawOutput)
    : false;
}

/** A result that is seen rather than read, so its card is not closed over it. */
const isShownNotRead = (item: ToolCallContent): boolean =>
  item.type === "diff" || (item.type === "content" && item.content.type === "image");

const RESTORED = "Rebuilt from the saved result when the session was reopened";

/** Marks a call rebuilt from a saved session, with the reason on hover. */
function RestoredMark() {
  return (
    <span className="lk-restored" role="img" aria-label={RESTORED} title={RESTORED}>
      <ClockCounterClockwiseIcon aria-hidden="true" />
    </span>
  );
}

/**
 * One tool call as a row that opens: what ran and on what, then its status. Opened, it shows the
 * input and the result. A call starts open when there is something to look at rather than read:
 * a request waiting on the person, or a result that is an image or a diff.
 */
export function ToolCard({ call, permission }: { call: ToolCall; permission?: PermissionEntry }) {
  const status = call.status ?? "pending";
  const locations = call.locations ?? [];
  const content = call.content ?? [];
  const decision = permission === undefined ? undefined : decisionOf(permission);
  const args = call.rawInput === undefined ? undefined : inlineArguments(call.rawInput);
  const preview = call.rawInput === undefined ? undefined : inputPreview(call.rawInput);
  const showOutput = call.rawOutput !== undefined && !outputRepeatsContent(content, call.rawOutput);
  const waiting = permission !== undefined && permission.outcome === undefined;
  const opensByDefault = waiting || content.some(isShownNotRead);

  return (
    <details className="lk-tool" data-status={status} open={opensByDefault}>
      <summary className="lk-tool-head">
        <CaretRightIcon className="lk-tool-caret" aria-hidden="true" />
        <span className="lk-tool-title">{call.title}</span>
        {call.name && call.name !== call.title ? (
          <span className="lk-tool-name">{call.name}</span>
        ) : null}
        {preview === undefined ? null : <span className="lk-tool-preview">{preview}</span>}
        <span className="lk-tool-end">
          {call._meta?.["labkit.dev/reconstructed"] === true ? <RestoredMark /> : null}
          {decision === undefined ? null : (
            <span className={`lk-decision ${decision.tone}`}>{decision.label}</span>
          )}
          <span className={`lk-status ${status}`}>{STATUS_LABEL[status]}</span>
        </span>
      </summary>
      <div className="lk-tool-body">
        {locations.length > 0 ? (
          <div className="lk-locations">
            {locations.map((l) => (l.line == null ? l.path : `${l.path}:${l.line}`)).join(", ")}
          </div>
        ) : null}
        {call.rawInput === undefined ? null : (
          <section className="lk-tool-section">
            <h4>Input</h4>
            {args === undefined ? (
              <ValueView value={call.rawInput} />
            ) : (
              <ArgumentsLine args={args} />
            )}
          </section>
        )}
        {content.length === 0 ? null : (
          <section className="lk-tool-section">
            <h4>Result</h4>
            {content.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a tool's content has no ids
              <ToolContentView key={i} item={item} />
            ))}
          </section>
        )}
        {showOutput ? (
          <details className="lk-raw">
            <summary>Raw output</summary>
            <ValueView value={call.rawOutput} />
          </details>
        ) : null}
      </div>
    </details>
  );
}
