import { expect, test } from "@logtape/testing-bun/autoload";

import { until } from "../core-agent/agent/test-support.ts";
import type { PlanEntries } from "./plan.ts";
import { answer, prompt } from "./testing/fixtures.ts";
import { harness, setup } from "./testing/harness.ts";

test("plan notifications replace the complete list, clear explicitly, and use the ordinary journaled tool path", async () => {
  const { planTool } = await import("./plan.ts");
  const { SessionIdSchema } = await import("@labkit/core-agent/types");
  const plans: PlanEntries[] = [
    [
      { content: "Inspect files", priority: "high", status: "in_progress" },
      { content: "Summarize", priority: "medium", status: "pending" },
    ],
    [{ content: "Inspect files", priority: "high", status: "completed" }],
    [],
  ];
  let calls = 0;
  const base = setup({
    complete: () =>
      calls < plans.length
        ? {
            kind: "tools",
            text: "Update plan",
            calls: [
              { id: `plan-${calls}`, name: "update_plan", args: { entries: plans[calls++] } },
            ],
          }
        : answer,
  });
  const h = harness({
    ...base.options,
    sessionOptions: async (context) => {
      const original = await base.options.sessionOptions(context);
      return {
        ...original,
        configuration: {
          ...original.configuration,
          steps: 5,
          agents: new Map([["a", { model: "m", tools: ["update_plan"] }]]),
        },
        bindings: {
          ...original.bindings,
          tools: new Map([["update_plan", planTool(context.publishPlan!)]]),
        },
      };
    },
  });
  try {
    await h.initialize();
    const id = await h.newSession();
    const turn = await h.start("session/prompt", prompt(id));
    for (let index = 0; index < plans.length; index++) {
      await until(
        () =>
          h.messages.filter((message) => message.method === "session/request_permission").length >
          index,
      );
      expect(h.updates().filter((message) => message.update.sessionUpdate === "plan")).toHaveLength(
        index,
      );
      const permission = h.messages.filter(
        (message) => message.method === "session/request_permission",
      )[index]!;
      expect(permission.params.toolCall.kind).toBe("think");
      const allow = permission.params.options.find((value: any) => value.kind === "allow_once");
      await h.send({
        jsonrpc: "2.0",
        id: permission.id,
        result: { outcome: { outcome: "selected", optionId: allow.optionId } },
      });
    }
    expect((await h.response(turn)).result.stopReason).toBe("end_turn");
    expect(
      h
        .updates()
        .filter((message) => message.update.sessionUpdate === "plan")
        .map((message) => message.update),
    ).toEqual(plans.map((entries) => ({ sessionUpdate: "plan", entries })));
    const journal = await base.persistence.load(
      SessionIdSchema.parse(id),
      new AbortController().signal,
    );
    expect(JSON.stringify(journal)).toContain("Inspect files");
  } finally {
    await h.close();
  }
});

test("load replays each saved plan where it was published, after its tool result", async () => {
  const { planTool } = await import("./plan.ts");
  const { readFile } = await import("node:fs/promises");
  const { resolve, join } = await import("node:path");
  const { withFixtureDiagnostics } = await import("../core-agent/logging/fixture-capture.ts");
  const plans: PlanEntries[] = [
    [
      { content: "Inspect files", priority: "high", status: "in_progress" },
      { content: "Summarize", priority: "medium", status: "pending" },
    ],
    [
      { content: "Inspect files", priority: "high", status: "completed" },
      { content: "Summarize", priority: "medium", status: "in_progress" },
    ],
  ];
  let calls = 0;
  const base = setup({
    complete: () =>
      calls < plans.length
        ? {
            kind: "tools",
            text: "Update plan",
            calls: [
              { id: `plan-${calls}`, name: "update_plan", args: { entries: plans[calls++] } },
            ],
          }
        : answer,
  });
  const options = {
    ...base.options,
    sessionOptions: async (context: Parameters<typeof base.options.sessionOptions>[0]) => {
      const original = await base.options.sessionOptions(context);
      return {
        ...original,
        configuration: {
          ...original.configuration,
          steps: 5,
          agents: new Map([["a", { model: "m", tools: ["update_plan"] }]]),
          policy: { ...original.configuration.policy, permissions: "off" as const },
        },
        bindings: {
          ...original.bindings,
          tools: new Map([["update_plan", planTool(context.publishPlan!)]]),
        },
      };
    },
  };
  const directory = resolve(`.session-artifacts/acp-plan-replay/${crypto.randomUUID()}`);
  await withFixtureDiagnostics(directory, {}, async () => {
    const first = harness(options);
    let id: string;
    try {
      await first.initialize();
      id = await first.newSession();
      expect((await first.request("session/prompt", prompt(id))).result.stopReason).toBe(
        "end_turn",
      );
    } finally {
      await first.close();
    }
    const second = harness(options);
    try {
      await second.initialize();
      expect(
        (await second.request("session/load", { sessionId: id, cwd: "/tmp", mcpServers: [] }))
          .result,
      ).toEqual({});
      const replayed = second.updates().map((message) => message.update);
      expect(replayed.filter((update) => update.sessionUpdate === "plan")).toEqual(
        plans.map((entries) => ({ sessionUpdate: "plan", entries })),
      );
      replayed.forEach((update, index) => {
        if (update.sessionUpdate !== "plan") return;
        expect(replayed[index - 1]).toMatchObject({
          sessionUpdate: "tool_call_update",
          status: "completed",
          _meta: { "labkit.dev/reconstructed": true },
        });
      });
    } finally {
      await second.close();
    }
  });
  const events = (await readFile(join(directory, "diagnostics.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const replayedEvents = events.filter((event) => event.event === "acp.plan.replayed");
  expect(replayedEvents.map((event) => event.count)).toEqual([2, 2]);
  expect(events.filter((event) => event.level === "warning")).toEqual([]);
});
