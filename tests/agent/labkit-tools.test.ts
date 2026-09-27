/**
 * The research verbs as tools the agent calls itself: built from the MCP declarations, run against
 * a real graph, and attributed to the ACP session that called them.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { labkitTools, LABKIT_TOOL_PREFIX } from "@labkit/app-acp";
import type { WithSurfaces } from "@labkit/app-mcp/server";
import { TOOLS, WRITE_TOOLS, SESSION_TOOLS } from "@labkit/app-mcp/tools";
import { ReadSurface, WriteSurface, inMemoryEventLog } from "@labkit/core-domain";
import {
  commandContext,
  mockGitContext,
  registeredSession,
  type SessionRegistry,
} from "@labkit/core-domain/context";
import type { TenantGraph } from "@labkit/core-db/graph";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

const clock = { now: () => new Date(Date.UTC(2026, 2, 1)).toISOString() };

/** Surfaces over one graph that stamp each write with whoever the tool set's registry names. */
function over(graph: TenantGraph, events = inMemoryEventLog()) {
  return {
    events,
    surfaces:
      (session: SessionRegistry): WithSurfaces =>
      async (work) => {
        const attribution = commandContext(
          mockGitContext,
          registeredSession(session),
          clock,
        ).attribution;
        return work({
          read: new ReadSurface(graph, { events }),
          write: new WriteSurface(graph, { clock, attribution, events }),
        });
      },
  };
}

const context = (sessionId: string | undefined) => ({
  toolCallId: "batch/call",
  ...(sessionId === undefined ? {} : { sessionId }),
});

const run = (
  tools: ReturnType<typeof labkitTools>,
  name: string,
  args: unknown,
  sessionId: string | undefined,
) => tools.get(name)!.run(args, new AbortController().signal, context(sessionId));

describe("the tools an agent is offered", () => {
  test("every read and write verb is offered under the prefix, and the session tools are not", () => {
    const tools = labkitTools({ tenant: "unused" });
    expect([...tools.keys()].sort()).toEqual(
      [...TOOLS, ...WRITE_TOOLS].map((t) => LABKIT_TOOL_PREFIX + t.name).sort(),
    );
    for (const session of SESSION_TOOLS) {
      expect(tools.has(LABKIT_TOOL_PREFIX + session.name)).toBe(false);
    }
  });

  test("reads are read tools and writes are not, so a write goes through the permission policy", () => {
    const tools = labkitTools({ tenant: "unused" });
    for (const read of TOOLS) expect(tools.get(LABKIT_TOOL_PREFIX + read.name)?.kind).toBe("read");
    for (const write of WRITE_TOOLS) {
      expect(tools.get(LABKIT_TOOL_PREFIX + write.name)?.kind).toBe("other");
    }
  });

  test("a tool describes itself with the MCP declaration's description and input schema", () => {
    const tools = labkitTools({ tenant: "unused" });
    const why = TOOLS.find((t) => t.name === "why")!;
    const offered = tools.get(`${LABKIT_TOOL_PREFIX}why`)!;
    expect(offered.description).toBe(why.description);
    expect(offered.parameters).toMatchObject({ properties: { subject: { type: "string" } } });
  });

  test("input that the declaration refuses is refused before anything runs", async () => {
    const tools = labkitTools({ tenant: "unused" });
    await expect(tools.get(`${LABKIT_TOOL_PREFIX}why`)!.parseInput({})).rejects.toThrow();
  });
});

describe("a call against a record", () => {
  test("a write lands on the record, is attributed to the calling ACP session, and a read sees it", async () => {
    const graph = await scenario.begin();
    try {
      const { events, surfaces } = over(graph);
      const tools = labkitTools({ tenant: "unused", surfaces });

      await run(
        tools,
        `${LABKIT_TOOL_PREFIX}note`,
        { text: "the sweep looks flat" },
        "acp-session-1",
      );
      const [recorded] = await events.all();
      expect(recorded?.operation).toBe("note");
      expect(recorded?.attribution.attribution_id).toBe("acp-session-1");

      const found = (await run(
        tools,
        `${LABKIT_TOOL_PREFIX}search`,
        { text: "sweep looks flat" },
        "acp-session-1",
      )) as { groups: unknown[] };
      expect(JSON.stringify(found.groups)).toContain("the sweep looks flat");
    } finally {
      await scenario.end();
    }
  });

  test("a second session using the same set is attributed to itself", async () => {
    const graph = await scenario.begin();
    try {
      const { events, surfaces } = over(graph);
      const tools = labkitTools({ tenant: "unused", surfaces });
      await run(tools, `${LABKIT_TOOL_PREFIX}note`, { text: "first" }, "acp-a");
      await run(tools, `${LABKIT_TOOL_PREFIX}note`, { text: "second" }, "acp-b");
      expect((await events.all()).map((e) => e.attribution.attribution_id)).toEqual([
        "acp-a",
        "acp-b",
      ]);
    } finally {
      await scenario.end();
    }
  });

  test("a write with no ACP session id is refused and writes nothing", async () => {
    const graph = await scenario.begin();
    try {
      const { events, surfaces } = over(graph);
      const tools = labkitTools({ tenant: "unused", surfaces });
      await expect(
        run(tools, `${LABKIT_TOOL_PREFIX}note`, { text: "nobody" }, undefined),
      ).rejects.toThrow(/without an ACP session id/);
      expect(await events.all()).toEqual([]);
    } finally {
      await scenario.end();
    }
  });
});
