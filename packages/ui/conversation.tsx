import type { RequestPermissionOutcome } from "@agentclientprotocol/sdk";
import {
  type Block,
  pendingPermissions,
  type Phase,
  permissionFor,
  phase,
  type TranscriptState,
} from "@labkit/view-model";
import { IconContext } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { currentActivity } from "./activity";
import type { AttachLimits } from "./attachments";
import {
  AssistantMessage,
  Compaction,
  Notice,
  PlanView,
  type MessageAction,
  Thought,
  UserMessage,
  WorkingIndicator,
} from "./blocks";
import { Composer } from "./composer";
import { fillPercent, formatCost } from "./format";
import type { PickItem } from "./overlay/list";
import { ToastProvider } from "./overlay/toast";
import { PermissionBatch, PermissionPrompt } from "./permission";
import { type RecordsConfig, RecordsContext } from "./records-context";
import { SessionControls } from "./session-controls";
import { ICONS } from "./surface";
import { drawnBlocks } from "./grouping";
import { ToolCard, ToolGroup } from "./tool";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  running: "Working",
  awaiting_permission: "Waiting for you",
};

export interface ConversationProps {
  readonly state: TranscriptState;
  /** Without this the conversation is read-only and has no composer. */
  readonly onSend?: (text: string, files: readonly File[]) => void;
  /** The files the composer takes. Without this it takes none. */
  readonly attach?: AttachLimits;
  readonly onCancel?: () => void;
  readonly onAnswer?: (requestId: string, outcome: RequestPermissionOutcome) => void;
  /** Leave unset to follow the system's light or dark setting. */
  readonly theme?: "light" | "dark";
  /** Called when a configuration control changes. Without it the controls are shown read-only. */
  readonly onSetConfig?: (configId: string, value: string | boolean) => void;
  /** The records prose may name, so a handle in a message becomes a chip. */
  readonly records?: RecordsConfig;
  /** What the composer's `@` can name. Without it the composer has no `@`. */
  readonly mentions?: readonly PickItem[];
  /**
   * Edit, answer again or fork from a message. Without it a message offers only copying its text.
   */
  readonly onMessageAction?: (action: MessageAction, block: Block) => void;
}

function BlockView({
  block,
  state,
  last = false,
  onMessageAction,
}: {
  block: Block;
  state: TranscriptState;
  last?: boolean;
  onMessageAction?: ((action: MessageAction, block: Block) => void) | undefined;
}) {
  switch (block.kind) {
    case "user":
      return <UserMessage block={block} last={last} onAction={onMessageAction} />;
    case "assistant":
      return <AssistantMessage block={block} last={last} onAction={onMessageAction} />;
    case "thought":
      return <Thought block={block} streaming={last && state.running} />;
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
  onSetConfig,
  mentions,
  onMessageAction,
  attach,
}: ConversationProps) {
  const current = phase(state);
  const pending = pendingPermissions(state);
  const { ref, onScroll } = useStickToBottom(state);
  const usage = state.usage;
  const activity = currentActivity(state);
  const drawn = drawnBlocks(state);

  return (
    <RecordsContext.Provider value={records}>
      <IconContext.Provider value={ICONS}>
        <section className="lk-root" {...(theme ? { "data-theme": theme } : {})}>
          <ToastProvider>
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
                {state.blocks.length === 0 ? (
                  <div className="lk-empty">Nothing here yet.</div>
                ) : null}
                {drawn.map((item) =>
                  item.kind === "block" ? (
                    <BlockView
                      key={item.index}
                      block={item.block}
                      state={state}
                      last={item === drawn.at(-1)}
                      onMessageAction={onMessageAction}
                    />
                  ) : (
                    <ToolGroup
                      key={item.index}
                      calls={item.blocks.flatMap((block) => {
                        const call = state.toolCalls[block.toolCallId];
                        return call === undefined
                          ? []
                          : [{ call, permission: permissionFor(state, block.toolCallId) }];
                      })}
                    />
                  ),
                )}
                {activity === undefined ? null : <WorkingIndicator activity={activity} />}
              </div>
            </div>

            {pending.length > 0 ? (
              <div className="lk-permissions">
                {pending.length > 1 ? (
                  <PermissionBatch entries={pending} onAnswer={onAnswer} />
                ) : null}
                {pending.map((entry) => (
                  <PermissionPrompt key={entry.requestId} entry={entry} onAnswer={onAnswer} />
                ))}
              </div>
            ) : null}

            {onSend ? (
              <Composer
                running={state.running}
                commands={state.commands}
                configOptions={state.configOptions ?? []}
                onSend={onSend}
                onCancel={onCancel}
                onSetConfig={onSetConfig}
                mentions={mentions}
                attach={attach}
              />
            ) : state.configOptions && state.configOptions.length > 0 ? (
              <div className="lk-session-summary">
                <SessionControls options={state.configOptions} />
              </div>
            ) : null}
          </ToastProvider>
        </section>
      </IconContext.Provider>
    </RecordsContext.Provider>
  );
}
