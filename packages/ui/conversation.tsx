import type { RequestPermissionOutcome } from "@agentclientprotocol/sdk";
import {
  type Block,
  pendingPermissions,
  type Phase,
  permissionFor,
  phase,
  type TranscriptState,
} from "@labkit/view-model";
import { useEffect, useRef } from "react";
import { AssistantMessage, Compaction, Notice, PlanView, Thought, UserMessage } from "./blocks";
import { Composer } from "./composer";
import { fillPercent, formatCost } from "./format";
import { PermissionPrompt } from "./permission";
import { type RecordsConfig, RecordsContext } from "./records-context";
import { ToolCard } from "./tool";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  running: "Working",
  awaiting_permission: "Waiting for you",
};

export interface ConversationProps {
  readonly state: TranscriptState;
  /** Without this the conversation is read-only and has no composer. */
  readonly onSend?: (text: string) => void;
  readonly onCancel?: () => void;
  readonly onAnswer?: (requestId: string, outcome: RequestPermissionOutcome) => void;
  /** Leave unset to follow the system's light or dark setting. */
  readonly theme?: "light" | "dark";
  /** The records prose may name, so a handle in a message becomes a chip. */
  readonly records?: RecordsConfig;
}

function BlockView({ block, state }: { block: Block; state: TranscriptState }) {
  switch (block.kind) {
    case "user":
      return <UserMessage block={block} />;
    case "assistant":
      return <AssistantMessage block={block} />;
    case "thought":
      return <Thought block={block} />;
    case "tool": {
      const call = state.toolCalls[block.toolCallId];
      if (call === undefined) return null;
      const permission = permissionFor(state, block.toolCallId);
      return <ToolCard call={call} {...(permission ? { permission } : {})} />;
    }
    case "plan": {
      const plan = state.plans[block.planId];
      return plan === undefined ? null : <PlanView plan={plan} />;
    }
    case "notice":
      return <Notice block={block} />;
    case "compaction":
      return <Compaction block={block} />;
    default: {
      const unhandled: never = block;
      void unhandled;
      return null;
    }
  }
}

/** Keeps the newest content in view while the reader has not scrolled away from the end. */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the content changes
  useEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dependency]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  return { ref, onScroll };
}

export function Conversation({
  state,
  onSend,
  onCancel,
  onAnswer,
  theme,
  records,
}: ConversationProps) {
  const current = phase(state);
  const pending = pendingPermissions(state);
  const { ref, onScroll } = useStickToBottom(state);
  const usage = state.usage;

  return (
    <RecordsContext.Provider value={records}>
      <section className="lk-root" {...(theme ? { "data-theme": theme } : {})}>
        <header className="lk-header">
          <h2 className="lk-title">{state.title ?? "New session"}</h2>
          <span className={`lk-badge ${current}`}>{PHASE_LABEL[current]}</span>
          <div className="lk-header-end">
            {usage === undefined ? null : (
              <span className="lk-meter" title={`${usage.used} of ${usage.size} tokens`}>
                <span className="lk-meter-bar">
                  <span style={{ width: `${fillPercent(usage.used, usage.size)}%` }} />
                </span>
                {fillPercent(usage.used, usage.size)}%
                {usage.cost ? <span>{formatCost(usage.cost)}</span> : null}
              </span>
            )}
          </div>
        </header>

        <div className="lk-log" ref={ref} onScroll={onScroll} role="log" aria-live="polite">
          <div className="lk-blocks">
            {state.blocks.length === 0 ? <div className="lk-empty">Nothing here yet.</div> : null}
            {state.blocks.map((block, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks are appended, never reordered
              <BlockView key={i} block={block} state={state} />
            ))}
          </div>
        </div>

        {pending.length > 0 ? (
          <div className="lk-permissions">
            {pending.map((entry) => (
              <PermissionPrompt key={entry.requestId} entry={entry} onAnswer={onAnswer} />
            ))}
          </div>
        ) : null}

        {onSend ? <Composer running={state.running} onSend={onSend} onCancel={onCancel} /> : null}
      </section>
    </RecordsContext.Provider>
  );
}
