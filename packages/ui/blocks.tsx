import type { ContentBlock } from "@agentclientprotocol/sdk";
import { type Block, type Plan, textOf } from "@labkit/view-model";
import {
  ArrowClockwiseIcon,
  CheckIcon,
  CopyIcon,
  GitForkIcon,
  type Icon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { type Activity, activityLabel, activityMood } from "./activity";
import { MarkdownText } from "./markdown";
import { Loader, type LoaderMood } from "./loader";
import { ContentView } from "./tool";

type Kind<K extends Block["kind"]> = Extract<Block, { kind: K }>;

/** Text as markdown, and any other block as what it is. */
function Rich({ content }: { content: readonly ContentBlock[] }) {
  return (
    <>
      {content.map((block, i) =>
        block.type === "text" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a message's blocks have no ids
          <MarkdownText key={i} text={block.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a message's blocks have no ids
          <ContentView key={i} block={block} />
        ),
      )}
    </>
  );
}

/** What can be done to a message beyond copying it: the host decides whether each is offered. */
export type MessageAction = "edit" | "fork" | "regenerate";

const ACTIONS: Record<MessageAction, { label: string; Glyph: Icon }> = {
  edit: { label: "Edit and send again", Glyph: PencilSimpleIcon },
  regenerate: { label: "Answer again", Glyph: ArrowClockwiseIcon },
  fork: { label: "Fork the session from here", Glyph: GitForkIcon },
};

/**
 * The small row of buttons under a message: copy its text, and whichever of edit, answer again and
 * fork the host handles. It shows on hover or keyboard focus, and always under the last message.
 */
function MessageToolbar({
  block,
  actions,
  onAction,
}: {
  block: Kind<"user"> | Kind<"assistant">;
  actions: readonly MessageAction[];
  onAction?: ((action: MessageAction, block: Block) => void) | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(textOf(block.content)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="lk-message-toolbar">
      <button
        type="button"
        className="lk-icon-btn"
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
        onClick={copy}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </button>
      {onAction === undefined
        ? null
        : actions.map((action) => {
            const { label, Glyph } = ACTIONS[action];
            return (
              <button
                key={action}
                type="button"
                className="lk-icon-btn"
                aria-label={label}
                title={label}
                onClick={() => onAction(action, block)}
              >
                <Glyph aria-hidden="true" />
              </button>
            );
          })}
    </div>
  );
}

export function UserMessage({
  block,
  last = false,
  onAction,
}: {
  block: Kind<"user">;
  last?: boolean;
  onAction?: ((action: MessageAction, block: Block) => void) | undefined;
}) {
  return (
    <div className="lk-message user" data-last={last || undefined}>
      <div className="lk-user">{textOf(block.content)}</div>
      <MessageToolbar block={block} actions={["edit", "fork"]} onAction={onAction} />
    </div>
  );
}

export function AssistantMessage({
  block,
  last = false,
  onAction,
}: {
  block: Kind<"assistant">;
  last?: boolean;
  onAction?: ((action: MessageAction, block: Block) => void) | undefined;
}) {
  return (
    <div className="lk-message assistant" data-last={last || undefined}>
      <div className="lk-assistant">
        <Rich content={block.content} />
      </div>
      <MessageToolbar block={block} actions={["regenerate", "fork"]} onAction={onAction} />
    </div>
  );
}

/**
 * The agent's thinking. Open while it streams ("Thinking…"), folded once it is done ("Thought for
 * Ns", timed from when it started to arrive; "Thought" when it was loaded whole). Once the person
 * opens or closes it, it stays as they left it.
 */
export function Thought({
  block,
  streaming = false,
}: {
  block: Kind<"thought">;
  streaming?: boolean;
}) {
  const [chosen, setChosen] = useState<boolean | undefined>(undefined);
  const started = useRef(streaming ? Date.now() : undefined);
  const [took, setTook] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!streaming && started.current !== undefined && took === undefined)
      setTook(Date.now() - started.current);
  }, [streaming, took]);
  const open = chosen ?? streaming;
  return (
    <details
      className="lk-thought"
      data-streaming={streaming || undefined}
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) setChosen(event.currentTarget.open);
      }}
    >
      <summary>
        {streaming ? (
          <span className="lk-shimmer">Thinking…</span>
        ) : took === undefined ? (
          "Thought"
        ) : (
          `Thought for ${Math.max(1, Math.round(took / 1000))}s`
        )}
      </summary>
      <Rich content={block.content} />
    </details>
  );
}

/** Seconds since `key` last changed, counting up once a second. */
function useElapsed(key: string): number {
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts when the activity changes
  useEffect(() => {
    setSince(Date.now());
    setNow(Date.now());
  }, [key]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** How long the indicator stays after the turn stops, while the loader shows it is done. */
const DONE_MS = 600;

/**
 * The activity to show: the current one, or for a moment after the turn stops the last one, with
 * `ending` set so the loader can show it is done.
 */
export function useLingering(activity: Activity | undefined): {
  shown: Activity | undefined;
  ending: boolean;
} {
  const [last, setLast] = useState(activity);
  useEffect(() => {
    if (activity !== undefined) {
      setLast(activity);
      return;
    }
    const timer = setTimeout(() => setLast(undefined), DONE_MS);
    return () => clearTimeout(timer);
  }, [activity]);
  return { shown: activity ?? last, ending: activity === undefined && last !== undefined };
}

/** The loader's mood for what is shown, or nothing when nothing is. */
export const moodOf = ({
  shown,
  ending,
}: ReturnType<typeof useLingering>): LoaderMood | undefined =>
  shown === undefined ? undefined : ending ? "done" : activityMood(shown);

/**
 * Under the transcript while a turn runs: what the agent is doing, and for how long, with the
 * loader before it. With `loader` false the loader is drawn elsewhere and the row is only the
 * words, so it is not drawn at all while there are none (the agent speaking, or done).
 */
export function WorkingIndicator({
  shown,
  ending,
  loader = true,
}: ReturnType<typeof useLingering> & { loader?: boolean }) {
  const label = shown === undefined || ending ? undefined : activityLabel(shown);
  const seconds = useElapsed(label ?? "");
  const mood = moodOf({ shown, ending });
  if (mood === undefined || (!loader && label === undefined)) return null;
  return (
    <div className="lk-working" role="status" aria-label={label ?? (ending ? "Done" : "Answering")}>
      {loader ? <Loader mood={mood} /> : null}
      {label === undefined ? null : (
        <>
          <span
            className={shown?.kind === "tool" ? "lk-working-label lk-mono" : "lk-working-label"}
          >
            <span className="lk-shimmer">{label}</span>
          </span>
          <span className="lk-working-time">{seconds}s</span>
        </>
      )}
    </div>
  );
}

export function PlanView({ plan }: { plan: Plan }) {
  return (
    <section className="lk-plan">
      <h3>Plan</h3>
      {plan.kind === "items" ? (
        <ol>
          {plan.entries.map((entry, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: plan entries have no ids
            <li key={i} className={entry.status}>
              <span>{entry.content}</span>
            </li>
          ))}
        </ol>
      ) : plan.kind === "markdown" ? (
        <MarkdownText text={plan.content} />
      ) : (
        <div className="lk-caption">{plan.uri}</div>
      )}
    </section>
  );
}

export function Notice({ block }: { block: Kind<"notice"> }) {
  return (
    <div
      className={`lk-notice ${block.severity}`}
      role={block.severity === "error" ? "alert" : "status"}
    >
      <div className="lk-notice-title">{block.title}</div>
      {block.description ? <div className="lk-notice-body">{block.description}</div> : null}
    </div>
  );
}

const COMPACTION_LABEL: Record<string, string> = {
  in_progress: "Compacting the conversation",
  completed: "Conversation compacted",
  failed: "Compaction failed",
  cancelled: "Compaction cancelled",
};

export function Compaction({ block }: { block: Kind<"compaction"> }) {
  return (
    <div className="lk-compaction">
      <div>{COMPACTION_LABEL[block.status] ?? `Compaction ${block.status}`}</div>
      {block.summary.length > 0 ? <Rich content={block.summary} /> : null}
      {block.error ? <div className="lk-notice-body">{block.error}</div> : null}
    </div>
  );
}
