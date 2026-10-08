import type { PermissionOption, RequestPermissionOutcome } from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
import { MarkdownText } from "./markdown";
import { ValueView } from "./value";

const buttonClass = (kind: PermissionOption["kind"]): string => {
  if (kind === "allow_once") return "lk-btn primary";
  if (kind.startsWith("reject")) return "lk-btn danger";
  return "lk-btn";
};

/** The option of `kind` a request offers, if it offers one. */
const optionOfKind = (entry: PermissionEntry, kind: PermissionOption["kind"]) =>
  entry.request.options.find((option) => option.kind === kind);

/**
 * Several requests waiting at once, answered together: allow each once, or deny each. A choice is
 * offered only when every request has an option of that kind, and it answers each request with
 * that request's own option.
 */
export function PermissionBatch({
  entries,
  onAnswer,
}: {
  entries: readonly PermissionEntry[];
  onAnswer?: ((requestId: string, outcome: RequestPermissionOutcome) => void) | undefined;
}) {
  const answerAll = (kind: PermissionOption["kind"]) => {
    for (const entry of entries) {
      const option = optionOfKind(entry, kind);
      if (option) onAnswer?.(entry.requestId, { outcome: "selected", optionId: option.optionId });
    }
  };
  const offered = (kind: PermissionOption["kind"]) =>
    entries.every((entry) => optionOfKind(entry, kind) !== undefined);
  return (
    <section className="lk-permission-batch" aria-label="Answer every request">
      <span>{entries.length} requests are waiting</span>
      <span className="lk-actions">
        {offered("allow_once") ? (
          <button
            type="button"
            className="lk-btn primary"
            disabled={onAnswer === undefined}
            onClick={() => answerAll("allow_once")}
          >
            Allow all once
          </button>
        ) : null}
        {offered("reject_once") ? (
          <button
            type="button"
            className="lk-btn danger"
            disabled={onAnswer === undefined}
            onClick={() => answerAll("reject_once")}
          >
            Deny all
          </button>
        ) : null}
      </span>
    </section>
  );
}

/**
 * A request the agent's turn is waiting on. The person's choice is the only thing that lets the
 * turn go on, so every option the agent offered is a button and there is always a way to cancel.
 */
export function PermissionPrompt({
  entry,
  onAnswer,
}: {
  entry: PermissionEntry;
  onAnswer?: ((requestId: string, outcome: RequestPermissionOutcome) => void) | undefined;
}) {
  const { toolCall, options } = entry.request;
  const answer = (outcome: RequestPermissionOutcome) => onAnswer?.(entry.requestId, outcome);
  const why = (toolCall.content ?? []).flatMap((item) =>
    item.type === "content" && item.content.type === "text" ? [item.content.text] : [],
  );
  return (
    <section className="lk-permission" aria-label="Permission needed">
      <p className="lk-permission-title">{toolCall.title ?? "A tool wants to run"}</p>
      <p className="lk-permission-sub">
        {toolCall.name ? <span className="lk-mono">{toolCall.name} · </span> : null}
        it asks before it runs
      </p>
      {/* Where it acts, in full: the agent's own wording in its input may name only a file. */}
      {toolCall.locations && toolCall.locations.length > 0 ? (
        <ul className="lk-permission-paths" aria-label="Files it acts on">
          {toolCall.locations.map((location, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one path can appear at several lines
            <li key={i}>
              <code>
                {location.line == null ? location.path : `${location.path}:${location.line}`}
              </code>
            </li>
          ))}
        </ul>
      ) : null}
      {toolCall.rawInput === undefined ? null : <ValueView value={toolCall.rawInput} />}
      {/* Why the agent asks, sent as the call's text: for a command, each program that needs
          permission and what it does, as Markdown. The call's card draws its diffs. */}
      {why.length === 0 ? null : (
        <div className="lk-permission-why">
          {why.map((text, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a call's content has no ids
            <MarkdownText key={i} text={text} />
          ))}
        </div>
      )}
      <div className="lk-actions">
        {options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            className={buttonClass(option.kind)}
            disabled={onAnswer === undefined}
            onClick={() => answer({ outcome: "selected", optionId: option.optionId })}
          >
            {option.name}
          </button>
        ))}
        <button
          type="button"
          className="lk-btn"
          disabled={onAnswer === undefined}
          onClick={() => answer({ outcome: "cancelled" })}
        >
          Cancel turn
        </button>
      </div>
    </section>
  );
}
