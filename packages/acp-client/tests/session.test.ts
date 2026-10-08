/**
 * The client against the fake agent over the real transport: what a session's view ends up
 * holding, compared with what the shared corpus says it should. A different agent behind the same
 * URL is meant to pass the same tests.
 */

import { describe, expect, test } from "bun:test";
import * as acp from "@agentclientprotocol/sdk";
import { AcpServer } from "@agentclientprotocol/sdk/experimental/server";
import { createFakeAcpServer, inProcessFetch } from "@labkit/acp-fake";
import { type Fixture, FIXTURES } from "@labkit/acp-scenarios";
import {
  initialState,
  pendingPermissions,
  phase,
  replay,
  type ViewEvent,
} from "@labkit/view-model";
import { eventsOfFixture, stateOfFixture } from "@labkit/view-model/fixtures";
import { connectSession, listSessions, type SessionClient, sessionHistory } from "../index";

const URL = "http://fake.test/acp";

const fixtureNamed = (id: string): Fixture => {
  const found = FIXTURES.find((f) => f.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
};

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(5);
  }
}

const updatesIn = (events: readonly ViewEvent[]): number =>
  events.filter((e) => e.type === "update").length;

interface Live {
  readonly client: SessionClient;
  readonly events: ViewEvent[];
}

/** Connects, answering permission requests and questions the way the fixture says the person does. */
async function open(
  server: ReturnType<typeof createFakeAcpServer>,
  decide: Fixture["decide"] | undefined,
  sessionId?: string,
  answerQuestion?: Fixture["answer"],
): Promise<Live> {
  const events: ViewEvent[] = [];
  const holder: { client?: SessionClient } = {};
  const client = await connectSession({
    url: URL,
    fetch: inProcessFetch(server),
    ...(sessionId === undefined ? {} : { sessionId }),
    onEvent: (event) => {
      events.push(event);
      if (event.type === "elicitation_requested" && answerQuestion !== undefined) {
        const answer = answerQuestion(event.request);
        if (answer !== "hold")
          queueMicrotask(() => holder.client?.answerQuestion(event.requestId, answer));
        return;
      }
      if (event.type !== "permission_requested" || decide === undefined) return;
      const answer = decide(event.request);
      if (answer === "hold") return;
      queueMicrotask(() =>
        holder.client?.answerPermission(
          event.requestId,
          answer === "cancel"
            ? { outcome: "cancelled" }
            : { outcome: "selected", optionId: answer.optionId },
        ),
      );
    },
  });
  holder.client = client;
  return { client, events };
}

/** Plays a fixture through the client, waiting for everything the corpus says the agent sends. */
async function playFixture(fixture: Fixture, server = createFakeAcpServer()) {
  const expected = updatesIn(await eventsOfFixture(fixture));
  const live = await open(server, fixture.decide, undefined, fixture.answer);
  await live.client.prompt(fixture.scenario.prompt);
  await until(() => updatesIn(live.events) >= expected, "the agent's updates to arrive");
  return { ...live, server };
}

const COMPLETED = [
  "plain-answer",
  "tool-succeeds",
  "tool-fails",
  "tool-image-result",
  "plan-and-diff",
  "notices-and-usage",
  "permission-granted",
  "permission-granted-for-session",
  "permission-refused",
  "permission-cancelled",
  "turn-fails",
  "answer-cut-short",
  "turn-cancelled",
  "question-answered",
];

/**
 * The events a live session gave, with each question's session id set to the corpus's own. The
 * fake agent asks under the live session's id, which the corpus cannot know; nothing else differs.
 */
const asInCorpus = (events: readonly ViewEvent[], fixture: Fixture): ViewEvent[] => {
  const placeholder = fixture.scenario.steps.flatMap((step) =>
    step.kind === "question" &&
    "sessionId" in step.request &&
    typeof step.request.sessionId === "string"
      ? [step.request.sessionId]
      : [],
  )[0];
  return events.map((event) =>
    event.type === "elicitation_requested" && placeholder !== undefined
      ? { ...event, request: { ...event.request, sessionId: placeholder } as typeof event.request }
      : event,
  );
};

describe("a live session reduces to what the corpus says", () => {
  for (const id of COMPLETED) {
    test(`${id}`, async () => {
      const fixture = fixtureNamed(id);
      const { events, client } = await playFixture(fixture);
      expect(replay(asInCorpus(events, fixture))).toEqual(await stateOfFixture(fixture));
      await client.close();
    });
  }
});

describe("a turn that stops short", () => {
  test("carries the agent's reason from the answer's _meta to the prompt_ended event", async () => {
    const fixture = fixtureNamed("answer-cut-short");
    const { events, client } = await playFixture(fixture);
    expect(events.filter((event) => event.type === "prompt_ended")).toEqual([
      { type: "prompt_ended", stopReason: "max_tokens", reason: fixture.scenario.stopDetail },
    ]);
    await client.close();
  });
});

describe("a turn waiting on the person", () => {
  test("holds until answered, then finishes as if it had been granted", async () => {
    const server = createFakeAcpServer();
    const { client, events } = await open(server, undefined);
    const turn = client.prompt(fixtureNamed("permission-pending").scenario.prompt);

    await until(() => events.some((e) => e.type === "permission_requested"), "the request");
    const waiting = replay(events, initialState);
    expect(phase(waiting)).toBe("awaiting_permission");
    expect(pendingPermissions(waiting)).toHaveLength(1);

    const asked = events.find((e) => e.type === "permission_requested");
    if (asked?.type !== "permission_requested") throw new Error("no request");
    client.answerPermission(asked.requestId, { outcome: "selected", optionId: "allow_once" });
    await turn;

    const granted = await stateOfFixture(fixtureNamed("permission-granted"));
    await until(
      () => replay(events).toolCalls.call_conclude?.status === "completed",
      "the tool to finish",
    );
    await until(() => updatesIn(events) >= 4, "the rest of the updates");
    expect(replay(events)).toEqual(granted);
    await client.close();
  });

  test("cancel stops the turn while the request is open", async () => {
    const server = createFakeAcpServer();
    const { client, events } = await open(server, undefined);
    const turn = client.prompt(fixtureNamed("permission-pending").scenario.prompt);
    await until(() => events.some((e) => e.type === "permission_requested"), "the request");

    await client.cancel();
    await turn;

    const state = replay(events);
    expect(state.stopReason).toBe("cancelled");
    expect(state.running).toBe(false);
    await client.close();
  });

  test("closing the client answers what is still open as cancelled", async () => {
    const server = createFakeAcpServer();
    const { client, events } = await open(server, undefined);
    void client.prompt(fixtureNamed("permission-pending").scenario.prompt);
    await until(() => events.some((e) => e.type === "permission_requested"), "the request");

    await client.close();

    // Once: answered on close, and not again when the closed connection ends the request.
    expect(events.filter((e) => e.type === "permission_answered")).toEqual([
      { type: "permission_answered", requestId: "permission-1", outcome: { outcome: "cancelled" } },
    ]);
  });
});

describe("reopening a session", () => {
  test("replays into the same blocks the live session had", async () => {
    const fixture = fixtureNamed("tool-succeeds");
    const played = await playFixture(fixture);
    const live = replay(played.events);

    // Reopening completes once the replayed history has been handled: nothing is left to wait for.
    const reopened = await open(played.server, undefined, played.client.sessionId);
    expect(updatesIn(reopened.events)).toBe(updatesIn(played.events) + 1);
    const replayed = replay(reopened.events);

    expect(replayed.blocks.map((b) => b.kind)).toEqual(live.blocks.map((b) => b.kind));
    expect(replayed.toolCalls.call_why?.status).toBe("completed");
    await played.client.close();
    await reopened.client.close();
  });
});

describe("a prompt with files", () => {
  test("is drawn with its files in the person's message, and reopening replays the same message", async () => {
    const server = createFakeAcpServer();
    const live = await open(server, undefined);
    expect(live.client.promptCapabilities).toEqual({ image: true, embeddedContext: true });

    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", {
      type: "image/png",
    });
    await live.client.prompt("/scenario plain-answer", [png, new File(["x,y\n"], "runs.csv")]);
    const said = (events: readonly ViewEvent[]) => {
      const first = replay(events).blocks[0];
      return first?.kind === "user" ? first.content : undefined;
    };
    expect(said(live.events)?.map((c) => c.type)).toEqual(["text", "image", "resource"]);

    const reopened = await open(server, undefined, live.client.sessionId);
    expect(said(reopened.events)).toEqual(said(live.events));
    await live.client.close();
    await reopened.client.close();
  });

  test("a file the agent does not take fails the prompt, naming the file, and nothing is sent", async () => {
    let prompted = false;
    const server = new AcpServer({
      createAgent: () =>
        acp
          .agent({ name: "text-only" })
          .onRequest(acp.methods.agent.initialize, () => ({
            protocolVersion: acp.PROTOCOL_VERSION,
            agentCapabilities: {},
          }))
          .onRequest(acp.methods.agent.session.new, () => ({ sessionId: "text-only-1" }))
          .onRequest(acp.methods.agent.session.prompt, () => {
            prompted = true;
            return { stopReason: "end_turn" as const };
          }),
    });
    const live = await open(server, undefined);
    expect(live.client.promptCapabilities).toEqual({});
    await live.client.prompt("look", [
      new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
    ]);
    expect(live.events.filter((e) => e.type === "prompt_started")).toEqual([]);
    expect(live.events).toContainEqual({
      type: "failed",
      message: expect.stringContaining("a.png (image/png) was not sent"),
    });
    expect(prompted).toBe(false);
    await live.client.close();
  });
});

describe("a session's history", () => {
  test("is what reopening it sends, complete, with the connection closed after", async () => {
    const fixture = fixtureNamed("tool-succeeds");
    const played = await playFixture(fixture);
    const history = await sessionHistory({
      url: URL,
      fetch: inProcessFetch(played.server),
      sessionId: played.client.sessionId,
    });
    expect(updatesIn(history)).toBe(updatesIn(played.events) + 1);
    expect(replay(history).blocks.map((b) => b.kind)).toEqual(
      replay(played.events).blocks.map((b) => b.kind),
    );
    await played.client.close();
  });
});

describe("listing sessions", () => {
  test("lists the sessions the agent keeps, for one directory when asked", async () => {
    const server = createFakeAcpServer();
    const fetch = inProcessFetch(server);
    const here = await connectSession({ url: URL, fetch, cwd: "/work", onEvent: () => {} });
    const there = await connectSession({ url: URL, fetch, cwd: "/elsewhere", onEvent: () => {} });

    const all = await listSessions({ url: URL, fetch });
    expect(all?.map((s) => s.sessionId)).toEqual([here.sessionId, there.sessionId]);
    const listed = await listSessions({ url: URL, fetch, cwd: "/work" });
    expect(listed).toEqual([{ sessionId: here.sessionId, cwd: "/work" }]);
    await here.close();
    await there.close();
  });

  test("is undefined from an agent that does not list its sessions", async () => {
    const server = new AcpServer({
      createAgent: () =>
        acp.agent({ name: "no-list" }).onRequest(acp.methods.agent.initialize, () => ({
          protocolVersion: acp.PROTOCOL_VERSION,
          agentCapabilities: { loadSession: true },
        })),
    });
    expect(await listSessions({ url: URL, fetch: inProcessFetch(server) })).toBeUndefined();
  });
});

describe("when the agent cannot be reached or refuses", () => {
  test("connecting to an endpoint that errors rejects", async () => {
    const down = Object.assign(async () => new Response("unavailable", { status: 503 }), {
      preconnect: () => {},
    });
    await expect(
      connectSession({ url: URL, fetch: down, onEvent: () => {} }),
    ).rejects.toBeInstanceOf(Error);
  });

  test("reopening a session the agent does not know rejects", async () => {
    const server = createFakeAcpServer();
    await expect(
      connectSession({
        url: URL,
        fetch: inProcessFetch(server),
        sessionId: "no-such-session",
        onEvent: () => {},
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
