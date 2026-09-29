import type { ContentBlock } from "@agentclientprotocol/sdk";
import { type Block, type Plan, textOf } from "@labkit/view-model";
import { useEffect, useRef, useState } from "react";
import { type Activity, activityLabel } from "./activity";
import { MarkdownText } from "./markdown";
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

export function UserMessage({ block }: { block: Kind<"user"> }) {
  return <div className="lk-user">{textOf(block.content)}</div>;
}

export function AssistantMessage({ block }: { block: Kind<"assistant"> }) {
  return (
    <div className="lk-assistant">
      <Rich content={block.content} />
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

/** Under the transcript while a turn runs: what the agent is doing, and for how long. */
export function WorkingIndicator({ activity }: { activity: Activity }) {
  const label = activityLabel(activity);
  const seconds = useElapsed(label);
  return (
    <div className="lk-working" role="status">
      <span className={activity.kind === "tool" ? "lk-working-label lk-mono" : "lk-working-label"}>
        <span className="lk-shimmer">{label}</span>
      </span>
      <span className="lk-working-time">{seconds}s</span>
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
