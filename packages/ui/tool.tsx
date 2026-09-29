import type {
  ContentBlock,
  ToolCall,
  ToolCallContent,
  ToolCallStatus,
} from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
import {
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleNotchIcon,
  type Icon,
  ProhibitIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { diffLines, STATUS_LABEL } from "./format";
import { toolTally } from "./grouping";
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

/** Whether the call did not run because the person refused it. */
const wasRefused = (call: ToolCall, decision: { tone: string } | undefined): boolean =>
  decision?.tone === "reject" ||
  (typeof call.rawOutput === "object" &&
    call.rawOutput !== null &&
    (call.rawOutput as { refused?: unknown }).refused === true);

const STATUS_ICON: Record<string, Icon> = {
  pending: CircleDashedIcon,
  in_progress: CircleNotchIcon,
  completed: CheckCircleIcon,
  failed: XCircleIcon,
  refused: ProhibitIcon,
};

/** The call's status as a coloured icon, its word as the label a screen reader or a hover shows. */
function StatusIcon({ status, refused }: { status: ToolCallStatus; refused: boolean }) {
  const shown = refused ? "refused" : status;
  const label = refused ? "Refused" : STATUS_LABEL[status];
  const Glyph = STATUS_ICON[shown] ?? CircleDashedIcon;
  return (
    <span className={`lk-status ${shown}`} role="img" aria-label={label} title={label}>
      <Glyph aria-hidden="true" weight="fill" />
    </span>
  );
}

/**
 * Scrolls the transcript just far enough that an opened row's contents are in view, or its top if
 * the contents are taller than the view.
 */
function revealBody(row: HTMLElement): void {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
}

/** A result that is seen rather than read, so its card is not closed over it. */
const isShownNotRead = (item: ToolCallContent): boolean =>
  item.type === "diff" || (item.type === "content" && item.content.type === "image");

/**
 * One tool call as a row that opens: what ran and on what, then its status. Opened, it shows the
 * input and the result. A call starts open when there is something to look at rather than read:
 * a request waiting on the person, or a result that is an image or a diff.
 */
export function ToolCard({ call, permission }: { call: ToolCall; permission?: PermissionEntry }) {
  const status = call.status ?? "pending";
  const content = call.content ?? [];
  const decision = permission === undefined ? undefined : decisionOf(permission);
  const args = call.rawInput === undefined ? undefined : inlineArguments(call.rawInput);
  const preview = call.rawInput === undefined ? undefined : inputPreview(call.rawInput);
  const showOutput = call.rawOutput !== undefined && !outputRepeatsContent(content, call.rawOutput);
  const waiting = permission !== undefined && permission.outcome === undefined;
  const opensByDefault = waiting || content.some(isShownNotRead);

  return (
    <details
      className="lk-tool"
      data-status={status}
      open={opensByDefault}
      onToggle={(event) => {
        if (event.currentTarget.open) revealBody(event.currentTarget);
      }}
    >
      {/* The row names the tool and what it was given; the agent's title, which says the same
          at more length, is its hover text. */}
      <summary
        className="lk-tool-head"
        {...(call.name && call.title !== call.name ? { title: call.title } : {})}
      >
        <CaretRightIcon className="lk-tool-caret" aria-hidden="true" />
        <span className="lk-tool-name">{call.name ?? call.title}</span>
        {preview === undefined ? null : <span className="lk-tool-preview">{preview}</span>}
        <span className="lk-tool-end">
          {decision === undefined ? null : (
            <span className={`lk-decision ${decision.tone}`}>{decision.label}</span>
          )}
          <StatusIcon status={status} refused={wasRefused(call, decision)} />
        </span>
      </summary>
      <div className="lk-tool-body">
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

/**
 * A run of consecutive tool calls as one row: how many, which tools, and how they went. Opened, it
 * is the calls' own rows. It shows the spinner while any call is still going.
 */
export function ToolGroup({
  calls,
}: {
  calls: readonly { call: ToolCall; permission?: PermissionEntry | undefined }[];
}) {
  const outcomes = calls.map(({ call, permission }) => {
    const status = call.status ?? "pending";
    const refused = wasRefused(call, permission === undefined ? undefined : decisionOf(permission));
    return refused ? "refused" : status;
  });
  const count = (what: string) => outcomes.filter((o) => o === what).length;
  const running = count("in_progress") + count("pending");
  const failed = count("failed");
  const refused = count("refused");
  // The icon says how the run went as a whole; the tallies beside it name the calls that failed.
  const overall: ToolCallStatus =
    running > 0 ? "in_progress" : failed + refused === calls.length ? "failed" : "completed";
  return (
    <details
      className="lk-tool lk-tool-group"
      data-status={overall}
      onToggle={(event) => {
        if (event.currentTarget.open) revealBody(event.currentTarget);
      }}
    >
      <summary className="lk-tool-head">
        <CaretRightIcon className="lk-tool-caret" aria-hidden="true" />
        <span className="lk-tool-count">{calls.length} tool calls</span>
        <span className="lk-tool-preview">
          {toolTally(calls.map(({ call }) => call.name ?? call.title))}
        </span>
        <span className="lk-tool-end">
          {failed > 0 ? <span className="lk-tool-tally failed">{failed} failed</span> : null}
          {refused > 0 ? <span className="lk-tool-tally refused">{refused} refused</span> : null}
          <StatusIcon status={overall} refused={false} />
        </span>
      </summary>
      <div className="lk-tool-group-body">
        {calls.map(({ call, permission }) => (
          <ToolCard key={call.toolCallId} call={call} {...(permission ? { permission } : {})} />
        ))}
      </div>
    </details>
  );
}
