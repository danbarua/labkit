/**
 * The HTTP bridge to an agent on stdio, with the fake agent run as a child process: a session
 * through the bridge reduces to what the corpus says, as it does against the fake agent's own
 * HTTP server.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { connectSession, type SessionClient } from "@labkit/acp-client";
import type { Duration } from "effect";
import { type Fixture, FIXTURES } from "@labkit/acp-scenarios";
import { replay, type ViewEvent } from "@labkit/view-model";
import { eventsOfFixture, stateOfFixture } from "@labkit/view-model/fixtures";
import { type StdioAgentHttp, stdioAgentHttp } from "../src/infra/stdio-agent-http";

const URL = "http://bridge.test/acp";
const TOKEN = "t".repeat(40);
const FAKE_AGENT = path.join(import.meta.dir, "support/stdio-fake-agent.ts");

const fixtureNamed = (id: string): Fixture => {
  const found = FIXTURES.find((f) => f.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
};

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(10);
  }
}

const updatesIn = (events: readonly ViewEvent[]): number =>
  events.filter((e) => e.type === "update").length;

const bridges: StdioAgentHttp[] = [];
afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
});

function bridgeTo(
  command: readonly [string, ...string[]],
  env: Record<string, string> = {},
  abandonedAfter?: Duration.Input,
) {
  const bridge = stdioAgentHttp({
    command,
    cwd: import.meta.dir,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    token: TOKEN,
    ...(abandonedAfter === undefined ? {} : { abandonedAfter }),
  });
  bridges.push(bridge);
  return bridge;
}

/** A `fetch` that delivers to `bridge` in this process, with the token the dev server's proxy adds. */
const fetchVia = (bridge: StdioAgentHttp, token = TOKEN): typeof fetch =>
  Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input instanceof Request ? input : String(input), init);
      request.headers.set("authorization", `Bearer ${token}`);
      return bridge.fetch(request);
    },
    { preconnect: () => {} },
  );

/** Connects through `bridge`, answering permission requests the way the fixture says the person does. */
async function open(bridge: StdioAgentHttp, fixture: Fixture) {
  const events: ViewEvent[] = [];
  const holder: { client?: SessionClient } = {};
  const client = await connectSession({
    url: URL,
    fetch: fetchVia(bridge),
    onEvent: (event) => {
      events.push(event);
      if (event.type !== "permission_requested" || fixture.decide === undefined) return;
      const answer = fixture.decide(event.request);
      if (answer === "hold") return;
      // A fixture's "cancel" is the person cancelling the turn while the request is open.
      queueMicrotask(() =>
        answer === "cancel"
          ? void holder.client?.cancel()
          : holder.client?.answerPermission(event.requestId, {
              outcome: "selected",
              optionId: answer.optionId,
            }),
      );
    },
  });
  holder.client = client;
  return { client, events };
}

// Each one sends messages in a different direction: updates from the agent, an agent's request
// answered by the client, a failed turn, and a turn the agent ends as cancelled.
const RELAYED = [
  "plain-answer",
  "tool-succeeds",
  "permission-granted",
  "turn-fails",
  "turn-cancelled",
];

describe("a session through the bridge reduces to what the corpus says", () => {
  for (const id of RELAYED) {
    test(id, async () => {
      const fixture = fixtureNamed(id);
      const bridge = bridgeTo(["bun", FAKE_AGENT]);
      const expected = updatesIn(await eventsOfFixture(fixture));
      const { client, events } = await open(bridge, fixture);
      await client.prompt(fixture.scenario.prompt);
      await until(() => updatesIn(events) >= expected, "the agent's updates to arrive");
      expect(replay(events)).toEqual(await stateOfFixture(fixture));
      await client.close();
    });
  }
});

describe("the agent process", () => {
  test("has its stdin closed and exits when the client closes the connection", async () => {
    const exitFile = path.join(mkdtempSync(path.join(tmpdir(), "stdio-agent-http-")), "exited");
    const bridge = bridgeTo(["bun", FAKE_AGENT], { FAKE_AGENT_EXIT_FILE: exitFile });
    const { client } = await open(bridge, fixtureNamed("plain-answer"));
    expect(existsSync(exitFile)).toBe(false);

    await client.close();

    await until(() => existsSync(exitFile), "the agent process to see its stdin close");
  });

  test("that cannot be started makes connecting reject", async () => {
    const bridge = bridgeTo(["/no/such/agent"]);
    await expect(
      connectSession({ url: URL, fetch: fetchVia(bridge), onEvent: () => {} }),
    ).rejects.toBeInstanceOf(Error);
  });
});

/** Sends `initialize` and opens the connection's event stream, as a client does; returns the stream's reader. */
async function openRaw(bridge: StdioAgentHttp) {
  const send = fetchVia(bridge);
  const initialized = await send(URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {} },
    }),
  });
  const connectionId = initialized.headers.get("acp-connection-id");
  if (connectionId === null)
    throw new Error(`initialize answered ${initialized.status}, no connection id`);
  const stream = await send(URL, {
    headers: { accept: "text/event-stream", "acp-connection-id": connectionId },
  });
  if (stream.body === null)
    throw new Error(`the event stream answered ${stream.status} with no body`);
  const reader = stream.body.getReader();
  await reader.read();
  return reader;
}

describe("a connection whose client goes away without DELETE", () => {
  test("is ended, and its agent process exits, once no event stream has been open for the set time", async () => {
    const exitFile = path.join(mkdtempSync(path.join(tmpdir(), "stdio-agent-http-")), "exited");
    const bridge = bridgeTo(["bun", FAKE_AGENT], { FAKE_AGENT_EXIT_FILE: exitFile }, "200 millis");
    const reader = await openRaw(bridge);

    await reader.cancel();

    await until(() => existsSync(exitFile), "the abandoned connection's agent process to exit");
  });

  test("is kept while one of its event streams is open", async () => {
    const exitFile = path.join(mkdtempSync(path.join(tmpdir(), "stdio-agent-http-")), "exited");
    const bridge = bridgeTo(["bun", FAKE_AGENT], { FAKE_AGENT_EXIT_FILE: exitFile }, "200 millis");
    const reader = await openRaw(bridge);

    await Bun.sleep(800);

    expect(existsSync(exitFile)).toBe(false);
    await reader.cancel();
  });
});

describe("a session asked for by a newer connection", () => {
  test("is taken from the older connection: its agent process exits before the load is relayed", async () => {
    const exitFile = path.join(mkdtempSync(path.join(tmpdir(), "stdio-agent-http-")), "exited");
    const bridge = bridgeTo(["bun", FAKE_AGENT], {
      FAKE_AGENT_EXIT_FILE: exitFile,
      FAKE_AGENT_SESSIONS: "fake-1",
    });
    const older = await connectSession({ url: URL, fetch: fetchVia(bridge), onEvent: () => {} });
    expect(older.sessionId).toBe("fake-1");

    const newer = await connectSession({
      url: URL,
      fetch: fetchVia(bridge),
      sessionId: older.sessionId,
      onEvent: () => {},
    });

    expect(existsSync(exitFile)).toBe(true);
    await newer.close();
  });
});

describe("a request without the bridge's token", () => {
  test("is answered 401 with WWW-Authenticate: Bearer", async () => {
    const bridge = bridgeTo(["bun", FAKE_AGENT]);
    const response = await fetchVia(bridge, "w".repeat(40))(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });
});

describe("a route served beside the transport", () => {
  test("is reached only with the bridge's token, by its path prefix", async () => {
    const bridge = stdioAgentHttp({
      command: ["bun", FAKE_AGENT],
      cwd: import.meta.dir,
      env: {},
      token: TOKEN,
      routes: {
        "/blob/": async (request) => new Response(new globalThis.URL(request.url).pathname),
      },
    });
    bridges.push(bridge);
    const at = "http://bridge.test/blob/abc.png";
    expect((await fetchVia(bridge, "w".repeat(40))(at)).status).toBe(401);
    const answered = await fetchVia(bridge)(at);
    expect(answered.status).toBe(200);
    expect(await answered.text()).toBe("/blob/abc.png");
  });
});

describe("the bridge's token", () => {
  test("shorter than 32 characters makes construction throw", () => {
    expect(() =>
      stdioAgentHttp({
        command: ["bun", FAKE_AGENT],
        cwd: import.meta.dir,
        env: {},
        token: "short",
      }),
    ).toThrow("at least 32");
  });
});
