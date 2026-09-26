/**
 * The fake agent, spoken to over the wire: the SDK's own HTTP client stream into the SDK's own
 * server transport. What a client sees here is what it will see from a real agent behind the same
 * transport, so each test compares it with the corpus the fake plays.
 */

import { describe, expect, test } from "bun:test";
import * as acp from "@agentclientprotocol/sdk";
import { createHttpStream } from "@agentclientprotocol/sdk/experimental/http-client";
import type { AcpServer } from "@agentclientprotocol/sdk/experimental/server";
import {
  type Answer,
  collect,
  permissionRequired,
  SCENARIOS,
  type Scenario,
  toolFails,
  toolSucceeds,
} from "@labkit/acp-scenarios";
import { initialState, replay, type ViewEvent } from "@labkit/view-model";
import { createFakeAcpServer, pickScenario } from "../index";

type Permission = (request: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>;

interface Client {
  readonly agent: acp.ClientContext;
  readonly updates: acp.SessionNotification[];
  /** Resolves once the agent's notifications for a finished turn have all arrived. */
  arrived(count: number): Promise<void>;
}

/** A `fetch` that delivers to the server in this process, so no port is opened. */
function fetchInto(server: AcpServer): typeof fetch {
  const deliver = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    server.handleRequest(
      input instanceof Request ? new Request(input, init) : new Request(String(input), init),
    );
  return Object.assign(deliver, { preconnect: () => {} });
}

/** A real ACP client over Streamable HTTP, with its transport wired straight to `server`. */
async function withClient<T>(
  server: AcpServer,
  permission: Permission,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const updates: acp.SessionNotification[] = [];
  const stream = createHttpStream("http://fake.test/acp", { fetch: fetchInto(server) });
  try {
    return await acp
      .client({ name: "wire-test" })
      .onRequest(acp.methods.client.session.requestPermission, (ctx) => permission(ctx.params))
      .onNotification(acp.methods.client.session.update, (ctx) => {
        updates.push(ctx.params);
      })
      .connectWith(stream, async (agent) => {
        await agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });
        return run({
          agent,
          updates,
          arrived: async (count) => {
            const deadline = Date.now() + 3000;
            while (updates.length < count && Date.now() < deadline) await Bun.sleep(5);
          },
        });
      });
  } finally {
    await stream.writable.close();
  }
}

const newSession = async (client: Client): Promise<string> =>
  (await client.agent.request(acp.methods.agent.session.new, { cwd: "/workspace", mcpServers: [] }))
    .sessionId;

const say = (client: Client, sessionId: string, text: string) =>
  client.agent.request(acp.methods.agent.session.prompt, {
    sessionId,
    prompt: [{ type: "text", text }],
  });

const choose =
  (optionId: string): Permission =>
  async () => ({ outcome: { outcome: "selected", optionId } });

const refuseToAnswer: Permission = () => new Promise(() => {});

/** What the corpus says a scenario sends, for a fixed way of answering. */
const expectedUpdates = async (scenario: Scenario, decide: () => Answer) => [
  ...(await collect(scenario, decide)).updates,
];

describe("a turn over the wire", () => {
  test("a tool that succeeds sends exactly the scripted updates, then ends the turn", async () => {
    const server = createFakeAcpServer();
    const expected = await expectedUpdates(toolSucceeds, () => "hold");
    await withClient(server, choose("allow_once"), async (client) => {
      const sessionId = await newSession(client);
      const done = await say(client, sessionId, toolSucceeds.prompt);
      await client.arrived(expected.length);
      expect(done.stopReason).toBe("end_turn");
      expect(client.updates.map((n) => n.sessionId)).toEqual(expected.map(() => sessionId));
      expect(client.updates.map((n) => n.update)).toEqual(expected);
    });
  });

  test("a tool that fails sends its failure and the answer that follows", async () => {
    const server = createFakeAcpServer();
    const expected = await expectedUpdates(toolFails, () => "hold");
    await withClient(server, choose("allow_once"), async (client) => {
      const sessionId = await newSession(client);
      await say(client, sessionId, toolFails.prompt);
      await client.arrived(expected.length);
      expect(client.updates.map((n) => n.update)).toEqual(expected);
    });
  });
});

describe("permission over the wire", () => {
  test("the turn waits for the answer, then runs the tool it was granted", async () => {
    const server = createFakeAcpServer();
    const asked = Promise.withResolvers<acp.RequestPermissionRequest>();
    const answer = Promise.withResolvers<acp.RequestPermissionResponse>();
    const expected = await expectedUpdates(permissionRequired, () => ({ optionId: "allow_once" }));

    await withClient(
      server,
      (request) => {
        asked.resolve(request);
        return answer.promise;
      },
      async (client) => {
        const sessionId = await newSession(client);
        let finished = false;
        const turn = say(client, sessionId, permissionRequired.prompt).then((done) => {
          finished = true;
          return done;
        });

        const request = await asked.promise;
        expect(request.toolCall.toolCallId).toBe("call_conclude");
        expect(request.options.map((o) => o.optionId)).toEqual([
          "allow_once",
          "allow_always",
          "reject_once",
          "reject_always",
        ]);
        await Bun.sleep(50);
        expect(finished).toBe(false);

        answer.resolve({ outcome: { outcome: "selected", optionId: "allow_once" } });
        const done = await turn;
        await client.arrived(expected.length);
        expect(done.stopReason).toBe("end_turn");
        expect(client.updates.map((n) => n.update)).toEqual(expected);
      },
    );
  });

  test("a refusal sends the refused path, and the turn still ends normally", async () => {
    const server = createFakeAcpServer();
    const expected = await expectedUpdates(permissionRequired, () => ({ optionId: "reject_once" }));
    await withClient(server, choose("reject_once"), async (client) => {
      const sessionId = await newSession(client);
      const done = await say(client, sessionId, permissionRequired.prompt);
      await client.arrived(expected.length);
      expect(done.stopReason).toBe("end_turn");
      expect(client.updates.map((n) => n.update)).toEqual(expected);
    });
  });

  test("answering 'cancelled' ends the turn as cancelled", async () => {
    const server = createFakeAcpServer();
    await withClient(
      server,
      async () => ({ outcome: { outcome: "cancelled" } }),
      async (client) => {
        const sessionId = await newSession(client);
        const done = await say(client, sessionId, permissionRequired.prompt);
        expect(done.stopReason).toBe("cancelled");
      },
    );
  });

  test("session/cancel while a request is open ends the turn, whatever the client does with it", async () => {
    const server = createFakeAcpServer();
    const asked = Promise.withResolvers<void>();
    await withClient(
      server,
      (request) => {
        asked.resolve();
        return refuseToAnswer(request);
      },
      async (client) => {
        const sessionId = await newSession(client);
        const turn = say(client, sessionId, permissionRequired.prompt);
        await asked.promise;
        await client.agent.notify(acp.methods.agent.session.cancel, { sessionId });
        expect((await turn).stopReason).toBe("cancelled");
      },
    );
  });
});

describe("reopening", () => {
  test("session/load on a new connection replays the person's prompt and the agent's updates", async () => {
    const server = createFakeAcpServer();
    const expected = await expectedUpdates(toolSucceeds, () => "hold");

    const sessionId = await withClient(server, choose("allow_once"), async (client) => {
      const id = await newSession(client);
      await say(client, id, toolSucceeds.prompt);
      await client.arrived(expected.length);
      return id;
    });

    await withClient(server, choose("allow_once"), async (client) => {
      await client.agent.request(acp.methods.agent.session.load, {
        sessionId,
        cwd: "/workspace",
        mcpServers: [],
      });
      await client.arrived(expected.length + 1);
      const [first, ...rest] = client.updates.map((n) => n.update);
      expect(first).toMatchObject({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: toolSucceeds.prompt },
      });
      expect(rest).toEqual(expected);
    });
  });

  test("a reopened session reduces to the same blocks as the live one", async () => {
    const server = createFakeAcpServer();
    const sent = (await expectedUpdates(toolSucceeds, () => "hold")).length;
    const live: ViewEvent[] = [];
    const sessionId = await withClient(server, choose("allow_once"), async (client) => {
      const id = await newSession(client);
      live.push({ type: "prompt_started", content: [{ type: "text", text: toolSucceeds.prompt }] });
      await say(client, id, toolSucceeds.prompt);
      await client.arrived(sent);
      for (const n of client.updates) live.push({ type: "update", update: n.update });
      live.push({ type: "prompt_ended", stopReason: "end_turn" });
      return id;
    });

    const reopened: ViewEvent[] = [];
    await withClient(server, choose("allow_once"), async (client) => {
      await client.agent.request(acp.methods.agent.session.load, {
        sessionId,
        cwd: "/workspace",
        mcpServers: [],
      });
      await client.arrived(sent + 1);
      for (const n of client.updates) reopened.push({ type: "update", update: n.update });
    });

    const shape = (events: ViewEvent[]) => replay(events, initialState).blocks.map((b) => b.kind);
    expect(shape(reopened)).toEqual(shape(live));
  });
});

describe("choosing a scenario", () => {
  test("a prompt naming a scenario, a scenario's own prompt, and any other prompt in turn", () => {
    expect(pickScenario(SCENARIOS, "/scenario tool-fails please", 0).id).toBe("tool-fails");
    expect(pickScenario(SCENARIOS, toolSucceeds.prompt, 0).id).toBe("tool-succeeds");
    const first = pickScenario(SCENARIOS, "anything", 0);
    const second = pickScenario(SCENARIOS, "anything", 1);
    expect(first.id).not.toBe(second.id);
  });
});
