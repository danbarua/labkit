/**
 * An ACP agent that plays scripted scenarios. It speaks the protocol and nothing else: a client
 * cannot tell it from a real agent except by what it says, so a client built against it has
 * only the protocol to depend on.
 */

import * as acp from "@agentclientprotocol/sdk";
import {
  type Answer,
  type PermissionRequest,
  type Scenario,
  SCENARIOS,
  play,
  promptResponse,
  type QuestionAnswer,
} from "@labkit/acp-scenarios";

export interface FakeAgentOptions {
  /** The scripts the agent can play. Defaults to the whole corpus. */
  readonly scenarios?: readonly Scenario[];
}

export interface Session {
  readonly cwd: string;
  /** Every notification sent for the session, so `session/load` can replay them. */
  readonly history: acp.SessionNotification[];
  turns: number;
  cancel?: AbortController;
}

const promptText = (blocks: readonly acp.ContentBlock[]): string =>
  blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

/**
 * Which scenario answers a prompt: `/scenario <id>` names one, a prompt equal to a scenario's own
 * prompt picks it, and any other prompt takes the next scenario in turn.
 */
export function pickScenario(scenarios: readonly Scenario[], text: string, turn: number): Scenario {
  const named = /^\/scenario\s+(\S+)/.exec(text.trim())?.[1];
  const found =
    scenarios.find((s) => s.id === named) ??
    scenarios.find((s) => s.prompt !== "" && s.prompt === text.trim());
  const fallback = scenarios[turn % scenarios.length];
  const scenario = found ?? fallback;
  if (scenario === undefined) throw new Error("the fake agent has no scenarios");
  return scenario;
}

/** Resolves as soon as the signal aborts, so a wait on the client can be given up. */
function whenAborted(signal: AbortSignal): Promise<"cancel"> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve("cancel");
    else signal.addEventListener("abort", () => resolve("cancel"), { once: true });
  });
}

/**
 * What outlives one connection: the scripts and the sessions made so far. A client that
 * reconnects and calls `session/load` finds its session here, as it would with a durable agent.
 */
export interface FakeWorld {
  readonly scenarios: readonly Scenario[];
  readonly sessions: Map<string, Session>;
  created: number;
}

export function createFakeWorld(options: FakeAgentOptions = {}): FakeWorld {
  return { scenarios: options.scenarios ?? SCENARIOS, sessions: new Map(), created: 0 };
}

export function createFakeAgent(world: FakeWorld = createFakeWorld()) {
  const { scenarios, sessions } = world;

  const known = (sessionId: string): Session => {
    const session = sessions.get(sessionId);
    if (session === undefined) throw new Error(`no session ${sessionId}`);
    return session;
  };

  return (
    acp
      .agent({ name: "labkit-fake-agent" })
      .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true, sessionCapabilities: { list: {} } },
      }))
      .onRequest(acp.methods.agent.authenticate, () => ({}))
      .onRequest(acp.methods.agent.session.new, (ctx) => {
        const sessionId = `fake-${++world.created}`;
        sessions.set(sessionId, { cwd: ctx.params.cwd, history: [], turns: 0 });
        return { sessionId };
      })
      // Every session in one page, in the order they were made; `cwd` narrows it to one directory.
      .onRequest(acp.methods.agent.session.list, (ctx) => ({
        sessions: [...sessions]
          .filter(([, session]) => ctx.params.cwd == null || session.cwd === ctx.params.cwd)
          .map(([sessionId, session]) => ({ sessionId, cwd: session.cwd })),
      }))
      .onRequest(acp.methods.agent.session.load, async (ctx) => {
        const session = known(ctx.params.sessionId);
        for (const notification of session.history) {
          await ctx.client.notify(acp.methods.client.session.update, notification);
        }
        return {};
      })
      .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
        const { sessionId, prompt } = ctx.params;
        const session = known(sessionId);
        const text = promptText(prompt);
        const scenario = pickScenario(scenarios, text, session.turns++);
        const cancel = new AbortController();
        session.cancel = cancel;

        // A real agent records what the person said, so a reopened session shows it.
        session.history.push({
          sessionId,
          update: { sessionUpdate: "user_message_chunk", content: { type: "text", text } },
        });

        const stopReason = await play(scenario, {
          update: async (update) => {
            const notification = { sessionId, update };
            session.history.push(notification);
            await ctx.client.notify(acp.methods.client.session.update, notification);
          },
          permission: async (request: PermissionRequest): Promise<Answer> => {
            const asked = ctx.client.request(acp.methods.client.session.requestPermission, {
              sessionId,
              ...request,
            });
            const settled = await Promise.race([asked, whenAborted(cancel.signal)]);
            if (settled === "cancel" || settled.outcome.outcome === "cancelled") return "cancel";
            return { optionId: settled.outcome.optionId };
          },
          question: async (request): Promise<QuestionAnswer> => {
            const asked = ctx.client.request(acp.methods.client.elicitation.create, {
              ...request,
              sessionId,
            } as acp.CreateElicitationRequest);
            const settled = await Promise.race([asked, whenAborted(cancel.signal)]);
            return settled === "cancel" ? { action: "cancel" } : settled;
          },
        });
        session.cancel = undefined;
        if (scenario.fails) throw new acp.RequestError(scenario.fails.code, scenario.fails.message);
        return promptResponse(scenario, stopReason ?? "end_turn");
      })
      .onNotification(acp.methods.agent.session.cancel, (ctx) => {
        sessions.get(ctx.params.sessionId)?.cancel?.abort();
      })
  );
}
