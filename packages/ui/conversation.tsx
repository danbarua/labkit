import type {
  AvailableCommand,
  CreateElicitationResponse,
  RequestPermissionOutcome,
} from "@agentclientprotocol/sdk";
import {
  type Block,
  cancelledPrompt,
  pendingPermissions,
  type Phase,
  permissionFor,
  phase,
  type TranscriptState,
} from "@labkit/view-model";
import { IconContext } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { afterPause, currentActivity, PAUSE_MS } from "./activity";
import type { AttachLimits } from "./attachments";
import {
  AssistantMessage,
  Compaction,
  Notice,
  PlanView,
  type MessageAction,
  Thought,
  UserMessage,
  moodOf,
  useLingering,
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
import { ElicitationForm, ElicitationReceipt } from "./elicitation";
import { type Drawn, drawnBlocks } from "./grouping";
import { LinksContext, type ResolveLink } from "./links";
import { ToolRun } from "./tool";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  running: "Working",
  awaiting_permission: "Waiting for you",
};

export interface ConversationProps {
  readonly state: TranscriptState;
  /**
   * Commands the host carries out itself rather than sending to the agent, such as starting a new
   * session. The composer offers them before the agent's own; the host sees them in `onSend`.
   */
  readonly hostCommands?: readonly AvailableCommand[];
  /** Without this the conversation is read-only and has no composer. */
  readonly onSend?: (text: string, files: readonly File[]) => void;
  /** The files the composer takes. Without this it takes none. */
  readonly attach?: AttachLimits;
  readonly onCancel?: () => void;
  readonly onAnswer?: (requestId: string, outcome: RequestPermissionOutcome) => void;
  /** Answers a question from the agent. Without it a question is shown and cannot be answered. */
  readonly onAnswerQuestion?: (requestId: string, response: CreateElicitationResponse) => void;
  /** Leave unset to follow the system's light or dark setting. */
  readonly theme?: "light" | "dark";
  /** Called when a configuration control changes. Without it the controls are shown read-only. */
  readonly onSetConfig?: (configId: string, value: string | boolean) => void;
  /** The records prose may name, so a handle in a message becomes a chip. */
  readonly records?: RecordsConfig;
  /**
   * Where this page can fetch a link the agent sent (`blob://…`). Without it only HTTP(S) links
   * are fetched; any other link is shown as text.
   */
  readonly resolveLink?: ResolveLink;
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
  onAnswerQuestion,
}: {
  block: Extract<Drawn, { kind: "block" }>["block"];
  state: TranscriptState;
  last?: boolean;
  onMessageAction?: ((action: MessageAction, block: Block) => void) | undefined;
  onAnswerQuestion?: ((requestId: string, response: CreateElicitationResponse) => void) | undefined;
}) {
  switch (block.kind) {
    case "user":
      return (
        <UserMessage
          block={block}
          last={last}
          streaming={last && state.running}
          onAction={onMessageAction}
        />
      );
    case "assistant":
      return (
        <AssistantMessage
          block={block}
          last={last}
          streaming={last && state.running}
          onAction={onMessageAction}
        />
      );
    case "thought":
      return <Thought block={block} streaming={last && state.running} />;
    case "plan": {
      const plan = state.plans[block.planId];
      return plan === undefined ? null : <PlanView plan={plan} />;
    }
    case "elicitation": {
      const entry = state.elicitations.find((e) => e.requestId === block.requestId);
      if (entry === undefined) return null;
      return entry.response === undefined ? (
        <ElicitationForm
          request={entry.request}
          completed={entry.completed ?? false}
          onRespond={
            onAnswerQuestion && ((response) => onAnswerQuestion(entry.requestId, response))
          }
        />
      ) : (
        <ElicitationReceipt
          request={entry.request}
          response={entry.response}
          completed={entry.completed ?? false}
        />
      );
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

/** Whether `value` has stayed the same for `ms` milliseconds. */
function useQuiet(value: unknown, ms: number): boolean {
  const [quiet, setQuiet] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts whenever the value changes
  useEffect(() => {
    setQuiet(false);
    const timer = setTimeout(() => setQuiet(true), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return quiet;
}

/**
 * Keeps the newest content in view while the reader has not scrolled away from the end: when the
 * content changes, and while it changes height without a change of content (a block opening or
 * closing).
 */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the content changes
  useEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dependency]);
  useEffect(() => {
    const el = ref.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    // The width the transcript keeps for its scrollbar, for the composer to keep the same and so
    // line up with it. It is zero where scrollbars float over the content.
    const keepGutter = () =>
      el
        .closest<HTMLElement>(".lk-root")
        ?.style.setProperty("--lk-log-gutter", `${el.offsetWidth - el.clientWidth}px`);
    keepGutter();
    const observer = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
      keepGutter();
    });
    observer.observe(content);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const el = ref.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  return { ref, onScroll };
}

export function Conversation({
  state,
  hostCommands = [],
  onSend,
  onCancel,
  onAnswer,
  onAnswerQuestion,
  theme,
  records,
  resolveLink,
  onSetConfig,
  mentions,
  onMessageAction,
  attach,
}: ConversationProps) {
  const current = phase(state);
  const pending = pendingPermissions(state);
  const { ref, onScroll } = useStickToBottom(state);
  const usage = state.usage;
  const activity = afterPause(currentActivity(state), useQuiet(state.blocks, PAUSE_MS));
  const drawn = drawnBlocks(state);
  const indicator = useLingering(activity);

  return (
    <RecordsContext.Provider value={records}>
      <LinksContext.Provider value={resolveLink}>
        <IconContext.Provider value={ICONS}>
          <section className="lk-root" {...(theme ? { "data-theme": theme } : {})}>
            <ToastProvider>
              <header className="lk-header">
                <h2 className="lk-title">{state.title ?? "New session"}</h2>
                {/* A turn that ended in an error was stopped, not finished: it needs the person. */}
                {activity?.kind === "failed" ? (
                  <span className="lk-badge stopped">Stopped</span>
                ) : (
                  <span className={`lk-badge ${current}`}>{PHASE_LABEL[current]}</span>
                )}
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
                        key={item.key}
                        block={item.block}
                        state={state}
                        last={item === drawn.at(-1)}
                        onMessageAction={onMessageAction}
                        onAnswerQuestion={onAnswerQuestion}
                      />
                    ) : (
                      <ToolRun
                        key={item.key}
                        calls={item.blocks.flatMap((block) => {
                          const call = state.toolCalls[block.toolCallId];
                          return call === undefined
                            ? []
                            : [{ call, permission: permissionFor(state, block.toolCallId) }];
                        })}
                      />
                    ),
                  )}
                  <WorkingIndicator {...indicator} loader={onSend === undefined} />
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
                  commands={[...hostCommands, ...state.commands]}
                  configOptions={state.configOptions ?? []}
                  onSend={onSend}
                  onCancel={onCancel}
                  onSetConfig={onSetConfig}
                  mentions={mentions}
                  attach={attach}
                  loader={moodOf(indicator)}
                  recall={cancelledPrompt(state)}
                />
              ) : state.configOptions && state.configOptions.length > 0 ? (
                <div className="lk-session-summary">
                  <SessionControls options={state.configOptions} />
                </div>
              ) : null}
            </ToastProvider>
          </section>
        </IconContext.Provider>
      </LinksContext.Provider>
    </RecordsContext.Provider>
  );
}
