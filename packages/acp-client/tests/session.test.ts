/**
 * The client against the fake agent over the real transport: what a session's view ends up
 * holding, compared with what the shared corpus says it should. A different agent behind the same
 * URL is meant to pass the same tests.
 */

import { describe, expect, test } from "bun:test";
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
import { connectSession, type SessionClient } from "../index";

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

/** Connects, answering permission requests the way the fixture says the person does. */
async function open(
  server: ReturnType<typeof createFakeAcpServer>,
  decide: Fixture["decide"] | undefined,
  sessionId?: string,
): Promise<Live> {
  const events: ViewEvent[] = [];
  const holder: { client?: SessionClient } = {};
  const client = await connectSession({
    url: URL,
    fetch: inProcessFetch(server),
    ...(sessionId === undefined ? {} : { sessionId }),
    onEvent: (event) => {
      events.push(event);
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
  const live = await open(server, fixture.decide);
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
];

describe("a live session reduces to what the corpus says", () => {
  for (const id of COMPLETED) {
    test(`${id}`, async () => {
      const fixture = fixtureNamed(id);
      const { events, client } = await playFixture(fixture);
      expect(replay(events)).toEqual(await stateOfFixture(fixture));
      await client.close();
    });
  }
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

    expect(events).toContainEqual({
      type: "permission_answered",
      requestId: "permission-1",
      outcome: { outcome: "cancelled" },
    });
  });
});

describe("reopening a session", () => {
  test("replays into the same blocks the live session had", async () => {
    const fixture = fixtureNamed("tool-succeeds");
    const played = await playFixture(fixture);
    const live = replay(played.events);

    const reopened = await open(played.server, undefined, played.client.sessionId);
    await until(
      () => updatesIn(reopened.events) >= updatesIn(played.events) + 1,
      "the replay to arrive",
    );
    const replayed = replay(reopened.events);

    expect(replayed.blocks.map((b) => b.kind)).toEqual(live.blocks.map((b) => b.kind));
    expect(replayed.toolCalls.call_why?.status).toBe("completed");
    await played.client.close();
    await reopened.client.close();
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
