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
import { anthropicMessagesV3, openaiChatV2 } from "../core-agent/providers/index.ts";
import { streamResponse, streamVector } from "../core-agent/providers/testing/stream-vectors.ts";
import { acpHttpHandler } from "./http.ts";
import { answer, configurable, tools } from "./testing/fixtures.ts";
import { setup } from "./testing/harness.ts";

const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const url = "http://acp.test/acp";

/**
 * What a reader sees: every block, and every tool card whole. `_meta` is left out: after
 * `session/load` it carries `labkit.dev/reconstructed`, which marks a card as restored; nothing else
 * may differ.
 */
function seen(state: ReturnType<typeof reduce>) {
  return {
    blocks: state.blocks,
    toolCalls: Object.fromEntries(
      Object.entries(state.toolCalls).map(([id, { _meta, ...card }]) => [id, card]),
    ),
  };
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

/** Follows one prompt live, answering every permission request with the first option of `kind`. */
async function answering(fetcher: typeof fetch, kind: "allow_once" | "reject_once") {
  let state = initialState;
  const client = await connectSession({
    url,
    fetch: fetcher,
    onEvent: (event) => {
      state = reduce(state, event);
      if (event.type === "permission_requested") {
        const option = event.request.options.find((candidate) => candidate.kind === kind);
        void client.answerPermission(event.requestId, {
          outcome: "selected",
          optionId: option!.optionId,
        });
      }
    },
  });
  await client.prompt("Go");
  const id = client.sessionId;
  await client.close();
  return { id, state };
}

async function reopen(fetcher: typeof fetch, id: string, blocks: number) {
  const reopened = await open(fetcher, id);
  await until(() => reopened.state().blocks.length >= blocks);
  await reopened.client.close();
  return reopened.state();
}

test("a plain answer is the same live and after session/load", async () => {
  const { options } = setup();
  const { handler, fetch } = host(options);
  const { id, state } = await answering(fetch, "allow_once");
  expect(state.blocks.map((block) => block.kind)).toEqual(["user", "assistant"]);
  expect(seen(await reopen(fetch, id, state.blocks.length))).toEqual(seen(state));
  await handler.close();
});

test("a refused tool call and the reply after it are the same live and after session/load", async () => {
  let completions = 0;
  const { options } = setup({
    complete: () => (++completions === 1 ? tools : answer),
    tools: new Map([
      ["echo", defineTool({ input: z.object({ text: z.string() }), run: () => "must not run" })],
    ]),
  });
  const { handler, fetch } = host(options);
  const { id, state } = await answering(fetch, "reject_once");
  expect(state.blocks.map((block) => block.kind)).toEqual([
    "user",
    "assistant",
    "tool",
    "assistant",
  ]);
  expect(Object.values(state.toolCalls)).toMatchObject([
    { status: "failed", rawOutput: { refused: true } },
  ]);
  expect(seen(await reopen(fetch, id, state.blocks.length))).toEqual(seen(state));
  await handler.close();
});

test("a located read and a failed call are the same live and after session/load", async () => {
  let completions = 0;
  const base = setup({
    complete: () =>
      ++completions === 1
        ? {
            kind: "tools",
            text: "Looking",
            calls: [
              { id: "one", name: "look", args: { path: "/workspace/notes.md" } },
              { id: "two", name: "boom", args: {} },
            ],
          }
        : answer,
    tools: new Map([
      [
        "look",
        defineTool({
          input: z.object({ path: z.string() }),
          kind: "read",
          locations: ({ path }) => [{ path, line: 3 }],
          run: () => "contents",
        }),
      ],
      [
        "boom",
        defineTool({
          input: z.object({}),
          run: () => {
            throw new Error("disk on fire");
          },
        }),
      ],
    ]),
  });
  const options: typeof base.options = {
    ...base.options,
    sessionOptions: async (context) => {
      const original = await base.options.sessionOptions(context);
      return {
        ...original,
        configuration: {
          ...original.configuration,
          agents: new Map([["a", { model: "m", tools: ["look", "boom"] }]]),
          policy: { toolFailure: "return-error-and-continue" },
        },
      };
    },
  };
  const { handler, fetch } = host(options);
  const { id, state } = await answering(fetch, "allow_once");
  expect(Object.values(state.toolCalls)).toMatchObject([
    { kind: "read", status: "completed", locations: [{ path: "/workspace/notes.md", line: 3 }] },
    { status: "failed", rawOutput: { error: "disk on fire" } },
  ]);
  expect(seen(await reopen(fetch, id, state.blocks.length))).toEqual(seen(state));
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

for (const profile of [openaiChatV2, anthropicMessagesV3]) {
  test(`${profile.id}: streamed thinking and answer are the same live and after session/load`, async () => {
    const base = setup();
    const options: typeof base.options = {
      ...base.options,
      sessionOptions: async (context) => {
        const original = await base.options.sessionOptions(context);
        return {
          ...original,
          configuration: {
            ...original.configuration,
            policy: {
              provider: profile.id,
              model: "m",
              stream: true,
              thinking: profile.capabilities.thinking.mode === "budget" ? "budget" : "high",
              thinkingBudgetTokens: profile.capabilities.thinking.mode === "budget" ? 1024 : null,
              maxOutputTokens: 4096,
            },
          },
          bindings: {
            ...original.bindings,
            complete: undefined,
            providers: new Map([
              [
                profile.id,
                {
                  profile,
                  transport: {
                    baseUrl: "https://example.invalid",
                    fetch: (async () =>
                      streamResponse(streamVector(profile))) as unknown as typeof fetch,
                  },
                },
              ],
            ]),
          },
        };
      },
    };
    const { handler, fetch } = host(options);
    const { id, state } = await answering(fetch, "allow_once");
    expect(state.blocks.map((block) => block.kind)).toEqual(["user", "thought", "assistant"]);
    expect(seen(await reopen(fetch, id, state.blocks.length))).toEqual(seen(state));
    await handler.close();
  });
}
