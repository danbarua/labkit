import type { ContentBlock } from "@agentclientprotocol/sdk";
import { type Block, type Plan, textOf } from "@labkit/view-model";
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

export function Thought({ block }: { block: Kind<"thought"> }) {
  return (
    <details className="lk-thought">
      <summary>Thinking</summary>
      <Rich content={block.content} />
    </details>
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
