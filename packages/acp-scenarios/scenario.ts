/**
 * A scripted agent turn, as data: the updates an agent sends, and where it stops to ask the
 * client for permission. One corpus feeds the view model's tests, the fake agent that serves it
 * over the protocol, and the gallery that draws it.
 */

import type {
  CreateElicitationRequest,
  CreateElicitationResponse,
  RequestPermissionOutcome,
  RequestPermissionRequest,
  SessionUpdate,
  StopReason,
} from "@agentclientprotocol/sdk";

/** A permission request as the agent sends it, less the session the connection supplies. */
export type PermissionRequest = Omit<RequestPermissionRequest, "sessionId">;

/** What follows a permission answer: more steps, and how the turn ends if this path ends it. */
export interface Branch {
  readonly steps: readonly Step[];
  readonly stopReason?: StopReason;
}

export type Step =
  | { readonly kind: "update"; readonly update: SessionUpdate }
  /**
   * The agent asks the person something (`elicitation/create`) and waits for the answer; what
   * follows in the list comes after it. The fake agent sends it under the live session's id.
   */
  | { readonly kind: "question"; readonly request: CreateElicitationRequest }
  | {
      readonly kind: "permission";
      readonly request: PermissionRequest;
      /** By option id. An answer with no entry here is a scenario error. */
      readonly branches: Readonly<Record<string, Branch>>;
      /** The client cancelled the prompt while the request was open. */
      readonly cancelled: Branch;
    };

export interface Scenario {
  readonly id: string;
  readonly title: string;
  /** What the person typed for the turn the scenario answers. */
  readonly prompt: string;
  readonly steps: readonly Step[];
  /** How the turn ends when no branch says otherwise. */
  readonly stopReason: StopReason;
  /**
   * The turn ends in a JSON-RPC error instead, after its steps: what a client sees when the
   * agent's provider or server fails mid-turn.
   */
  readonly fails?: { readonly code: number; readonly message: string };
  /**
   * Why the turn stopped short, as labkit's agent reports it for a refusal or a token limit: the
   * message of the failure it puts in the prompt response's `_meta`.
   */
  readonly stopDetail?: string;
}

/** A scenario's answer to the prompt that started it, once it has stopped. */
export const promptResponse = (scenario: Scenario, stopReason: StopReason) => ({
  stopReason,
  ...(scenario.stopDetail === undefined
    ? {}
    : { _meta: { "labkit.dev/failure": { message: scenario.stopDetail } } }),
});

/** The answer given to an open permission request. `hold` leaves it open. */
export type Answer = { readonly optionId: string } | "hold" | "cancel";

/** The answer given to a question from the agent. `hold` leaves it open. */
export type QuestionAnswer = CreateElicitationResponse | "hold";

/** What the client does when the agent asks: fixed by a fixture, or by a person. */
export interface PlaySink {
  update(update: SessionUpdate): void | Promise<void>;
  permission(request: PermissionRequest): Answer | Promise<Answer>;
  question(request: CreateElicitationRequest): QuestionAnswer | Promise<QuestionAnswer>;
}

type Ended = { readonly held: true } | { readonly held: false; readonly stopReason?: StopReason };

/**
 * Plays a scenario into a sink, in order, waiting for each permission answer. A permission step
 * ends its step list: what follows the answer is in its branches. Resolves to how the turn ended,
 * or `undefined` when a request was held open and the turn is still running.
 */
export async function play(scenario: Scenario, sink: PlaySink): Promise<StopReason | undefined> {
  const run = async (steps: readonly Step[]): Promise<Ended> => {
    for (const step of steps) {
      if (step.kind === "update") {
        await sink.update(step.update);
        continue;
      }
      if (step.kind === "question") {
        if ((await sink.question(step.request)) === "hold") return { held: true };
        continue;
      }
      const answer = await sink.permission(step.request);
      if (answer === "hold") return { held: true };
      const branch = answer === "cancel" ? step.cancelled : step.branches[answer.optionId];
      if (branch === undefined) {
        const known = Object.keys(step.branches).join(", ");
        const chosen = typeof answer === "string" ? answer : answer.optionId;
        throw new Error(`scenario ${scenario.id}: no branch for option ${chosen}; it has ${known}`);
      }
      const ended = await run(branch.steps);
      if (ended.held) return ended;
      return { held: false, stopReason: branch.stopReason ?? ended.stopReason };
    }
    return { held: false };
  };
  const ended = await run(scenario.steps);
  return ended.held ? undefined : (ended.stopReason ?? scenario.stopReason);
}

export interface Played {
  readonly updates: readonly SessionUpdate[];
  /** The requests the agent made, with the outcome each got; none for a held one. */
  readonly permissions: readonly {
    readonly request: PermissionRequest;
    readonly outcome?: RequestPermissionOutcome;
  }[];
  readonly stopReason: StopReason | undefined;
}

/** A scenario played to the end (or to a held request) with a fixed way of answering. */
export async function collect(
  scenario: Scenario,
  decide: (request: PermissionRequest) => Answer,
  answerQuestion: (request: CreateElicitationRequest) => QuestionAnswer = () => "hold",
): Promise<Played> {
  const updates: SessionUpdate[] = [];
  const permissions: { request: PermissionRequest; outcome?: RequestPermissionOutcome }[] = [];
  const stopReason = await play(scenario, {
    update: (update) => {
      updates.push(update);
    },
    permission: (request) => {
      const answer = decide(request);
      if (answer === "hold") permissions.push({ request });
      else if (answer === "cancel")
        permissions.push({ request, outcome: { outcome: "cancelled" } });
      else
        permissions.push({
          request,
          outcome: { outcome: "selected", optionId: answer.optionId },
        });
      return answer;
    },
    question: answerQuestion,
  });
  return { updates, permissions, stopReason };
}
