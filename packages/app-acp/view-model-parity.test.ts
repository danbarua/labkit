/**
 * The session view against the real ACP host: a turn followed live, and the same session reopened
 * with `session/load`, must leave the view model showing the same conversation.
 */

import { connectSession } from "@labkit/acp-client";
import { defineTool } from "@labkit/core-agent";
import { expect, test } from "@logtape/testing-bun/autoload";
import { initialState, reduce, type ViewEvent } from "@labkit/view-model";
import { z } from "zod";

import { until } from "../core-agent/agent/test-support.ts";
import { acpHttpHandler } from "./http.ts";
import { answer, configurable, tools } from "./testing/fixtures.ts";
import { setup } from "./testing/harness.ts";

const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const url = "http://acp.test/acp";

/**
 * Whether a tool card's raw output says the call was refused. Live the output is an object and after
 * `session/load` it is the saved result text, with different wording for the reason, so only the
 * fact of refusal is comparable.
 */
function refusedIn(rawOutput: unknown): boolean | undefined {
  const value = typeof rawOutput === "string" ? safeParse(rawOutput) : rawOutput;
  if (value === null || typeof value !== "object") return undefined;
  return (value as { refused?: unknown }).refused === true;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** What a reader sees: block kinds and text, and each tool card's title, status and whether it was refused. */
function seen(state: ReturnType<typeof reduce>) {
  return state.blocks.map((block) => {
    if (block.kind === "tool") {
      const card = state.toolCalls[block.toolCallId];
      return {
        kind: "tool",
        title: card?.title,
        status: card?.status,
        refused: refusedIn(card?.rawOutput),
      };
    }
    if ("content" in block) {
      const text = block.content.map((part) => (part.type === "text" ? part.text : part.type));
      return { kind: block.kind, text: text.join("") };
    }
    return { kind: block.kind };
  });
}

function host(options: Parameters<typeof acpHttpHandler>[0]) {
  const handler = acpHttpHandler(options, { token });
  const fetchWithToken = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${token}`);
      const request =
        input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      for (const [name, value] of headers) request.headers.set(name, value);
      return handler.fetch(request);
    },
    { preconnect: () => {} },
  ) as typeof fetch;
  return { handler, fetch: fetchWithToken };
}

async function open(fetcher: typeof fetch, sessionId?: string) {
  let state = initialState;
  const events: ViewEvent[] = [];
  const client = await connectSession({
    url,
    fetch: fetcher,
    ...(sessionId === undefined ? {} : { sessionId }),
    onEvent: (event) => {
      events.push(event);
      state = reduce(state, event);
    },
  });
  return { client, state: () => state, events };
}

test("a plain answer looks the same live and after session/load", async () => {
  const { options } = setup();
  const { handler, fetch } = host(options);
  const live = await open(fetch);
  await live.client.prompt("Go");
  const before = seen(live.state());
  expect(before).toEqual([
    { kind: "user", text: "Go" },
    { kind: "assistant", text: "Hello 🌍" },
  ]);
  const id = live.client.sessionId;
  await live.client.close();

  const reopened = await open(fetch, id);
  await until(() => seen(reopened.state()).length >= before.length);
  expect(seen(reopened.state())).toEqual(before);
  await reopened.client.close();
  await handler.close();
});

test("a refused tool call and the reply after it look the same live and after session/load", async () => {
  let completions = 0;
  const { options } = setup({
    complete: () => (++completions === 1 ? tools : answer),
    tools: new Map([
      ["echo", defineTool({ input: z.object({ text: z.string() }), run: () => "must not run" })],
    ]),
  });
  const { handler, fetch } = host(options);

  let respond: (() => void) | undefined;
  let state = initialState;
  const client = await connectSession({
    url,
    fetch,
    onEvent: (event) => {
      state = reduce(state, event);
      if (event.type === "permission_requested") {
        const reject = event.request.options.find((option) => option.kind === "reject_once");
        respond = () =>
          client.answerPermission(event.requestId, {
            outcome: "selected",
            optionId: reject!.optionId,
          });
      }
    },
  });
  const turn = client.prompt("Go");
  await until(() => respond !== undefined);
  respond!();
  await turn;

  const live = seen(state);
  expect(live.map((item) => item.kind)).toEqual(["user", "assistant", "tool", "assistant"]);
  expect(live.find((item) => item.kind === "tool")).toMatchObject({
    status: "failed",
    refused: true,
  });
  const id = client.sessionId;
  await client.close();

  const reopened = await open(fetch, id);
  await until(() => seen(reopened.state()).length >= live.length);
  expect(seen(reopened.state())).toEqual(live);
  await reopened.client.close();
  await handler.close();
});

test("the options a session opens with are shown, a selection updates them, and a reopened session shows the selection", async () => {
  const { options } = configurable();
  const { handler, fetch } = host(options);

  const first = await open(fetch);
  const optionsOf = (state: ReturnType<typeof reduce>) =>
    Object.fromEntries((state.configOptions ?? []).map((option) => [option.id, option]));
  expect(optionsOf(first.state()).model).toMatchObject({ currentValue: "m" });

  await first.client.setConfigOption("model", "m2");
  expect(optionsOf(first.state()).model).toMatchObject({ currentValue: "m2" });
  const id = first.client.sessionId;
  await first.client.close();

  const reopened = await open(fetch, id);
  expect(optionsOf(reopened.state()).model).toMatchObject({ currentValue: "m2" });
  await reopened.client.close();
  await handler.close();
});
