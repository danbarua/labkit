import type { PermissionOption, RequestPermissionOutcome } from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
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
  return (
    <section className="lk-permission" aria-label="Permission needed">
      <p className="lk-permission-title">{toolCall.title ?? "A tool wants to run"}</p>
      <p className="lk-permission-sub">
        {toolCall.name ? <span className="lk-mono">{toolCall.name} · </span> : null}
        it asks before it runs
      </p>
      {toolCall.rawInput === undefined ? null : <ValueView value={toolCall.rawInput} />}
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
