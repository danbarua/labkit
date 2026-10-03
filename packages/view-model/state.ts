import type {
  AvailableCommand,
  ContentBlock,
  Cost,
  CreateElicitationRequest,
  CreateElicitationResponse,
  PlanEntry,
  RequestPermissionOutcome,
  RequestPermissionRequest,
  SessionConfigOption,
  StopReason,
  ToolCall,
} from "@agentclientprotocol/sdk";

/** A permission request as the agent sends it, less the session the connection supplies. */
export type PermissionRequest = Omit<RequestPermissionRequest, "sessionId">;

/** A question the agent asks the person (`elicitation/create`), as the agent sends it. */
export type ElicitationRequest = CreateElicitationRequest;

/**
 * One item of a transcript, in the order it first appeared. Text-bearing blocks hold the content
 * blocks the agent streamed; a tool call or plan holds only the id of what it shows, so a later
 * update changes the card in place instead of adding another.
 */
export type Block =
  | { readonly kind: "user"; readonly id: string; readonly content: readonly ContentBlock[] }
  | { readonly kind: "assistant"; readonly id: string; readonly content: readonly ContentBlock[] }
  | { readonly kind: "thought"; readonly id: string; readonly content: readonly ContentBlock[] }
  | { readonly kind: "tool"; readonly toolCallId: string }
  | { readonly kind: "plan"; readonly planId: string }
  | { readonly kind: "elicitation"; readonly requestId: string }
  | {
      readonly kind: "notice";
      readonly id: string;
      readonly severity: string;
      readonly title: string;
      readonly description?: string;
    }
  | {
      readonly kind: "compaction";
      readonly compactionId: string;
      readonly status: string;
      readonly summary: readonly ContentBlock[];
      readonly error?: string;
    };

export type Plan =
  | { readonly kind: "items"; readonly entries: readonly PlanEntry[] }
  | { readonly kind: "file"; readonly uri: string }
  | { readonly kind: "markdown"; readonly content: string };

/** A permission request and, once the client has answered it, the outcome. */
export interface PermissionEntry {
  readonly requestId: string;
  readonly request: PermissionRequest;
  readonly outcome?: RequestPermissionOutcome;
}

/**
 * A question from the agent and, once the person has answered it, the answer. A URL-mode question
 * is `completed` once the agent says the interaction behind it has finished (`elicitation/complete`).
 */
export interface ElicitationEntry {
  readonly requestId: string;
  readonly request: ElicitationRequest;
  readonly response?: CreateElicitationResponse;
  readonly completed?: boolean;
}

export interface Usage {
  readonly used: number;
  readonly size: number;
  readonly cost?: Cost;
}

/** Everything a view of one session needs, derived from the updates the agent sent. */
export interface TranscriptState {
  readonly blocks: readonly Block[];
  readonly toolCalls: Readonly<Record<string, ToolCall>>;
  readonly plans: Readonly<Record<string, Plan>>;
  readonly permissions: readonly PermissionEntry[];
  readonly elicitations: readonly ElicitationEntry[];
  /** A prompt has been sent and the turn has not ended. */
  readonly running: boolean;
  readonly stopReason?: StopReason;
  readonly title?: string;
  readonly usage?: Usage;
  readonly commands: readonly AvailableCommand[];
  readonly modeId?: string;
  readonly configOptions?: readonly SessionConfigOption[];
}

export const initialState: TranscriptState = {
  blocks: [],
  toolCalls: {},
  plans: {},
  permissions: [],
  elicitations: [],
  running: false,
  commands: [],
};
