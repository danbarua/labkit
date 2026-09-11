/**
 * Attribution: who ran a command, recorded beside when.
 */

import type { PoseCommand } from "../src/domain/commands";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  WriteSurface,
  UNATTRIBUTED,
  inMemoryEventLog,
  type AttributionContext,
  type Clock,
} from "../src/domain";
import {
  commandContext,
  mockGitContext,
  mockSessionContext,
  personContext,
  type GitContextProvider,
  type SessionContextProvider,
} from "../src/attribution";
import { openScenario, type Scenario } from "./helpers/scenario";
import type { TenantGraph } from "../src/db/graph";

let scenario: Scenario;
let graph: TenantGraph;

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  graph = await scenario.begin();
});
afterEach(async () => {
  await scenario.end();
});

const clock: Clock = { now: () => "2026-08-24T09:00:00.000Z" };

const agent = (label: string, id: string, head: string): AttributionContext =>
  commandContext(
    { head: () => head } satisfies GitContextProvider,
    {
      label: () => label,
      id: () => id,
      how: () => "claimed",
    } satisfies SessionContextProvider,
    clock,
  ).attribution;

describe("an event says who caused it", () => {
  test("an explicitly empty author label is rejected", () => {
    expect(() => personContext("")).toThrow("author label must not be empty");
  });
  test("a verb stamps the surface's attribution onto what it emits", async () => {
    const attribution = agent("claude-opus-5", "sess-1", "a".repeat(40));
    const events = inMemoryEventLog();
    const write = new WriteSurface(graph, { clock, attribution, events });

    await write.pose({ question: "does the coating slow corrosion?" });

    const [recorded] = await events.all();
    expect(recorded?.operation).toBe("pose");
    expect(recorded?.attribution).toEqual(attribution);
  });

  /**
   * The default is a **statement**, not an absence.
   */
  test("a surface given no attribution emits UNATTRIBUTED, not undefined", async () => {
    const events = inMemoryEventLog();
    const session = new ResearchSession(graph, { clock, events });

    await session.pose({ question: "is the solver faster?" });

    expect((await events.all())[0]?.attribution).toEqual(UNATTRIBUTED);
  });

  /**
   * The point of the feature, stated as the thing it makes possible.
   */
  test("two agents writing to one record stay distinguishable", async () => {
    const events = inMemoryEventLog();
    const dan = agent("dan", "human-1", "b".repeat(40));
    const claude = agent("claude-opus-5", "agent-1", "b".repeat(40));

    await new WriteSurface(graph, { clock, attribution: dan, events }).pose({
      question: "does the coating slow corrosion?",
    });
    await new WriteSurface(graph, { clock, attribution: claude, events }).pose({
      question: "is the solver faster?",
    });

    expect((await events.all()).map((e) => e.attribution.attribution_id)).toEqual([
      "human-1",
      "agent-1",
    ]);
  });

  /**
   * **The regression guard on the sink hoist**, and the reason it is here rather than in the
   * MCP tests.
   */
  test("surfaces built per command share the sink they were handed", async () => {
    const events = inMemoryEventLog();
    const ctx = commandContext(mockGitContext, mockSessionContext, clock);

    await new WriteSurface(graph, { ...ctx, events }).pose({ question: "first question" });
    await new WriteSurface(graph, { ...ctx, events }).pose({ question: "second question" });

    expect((await events.all()).map((e) => (e.command as PoseCommand).question)).toEqual([
      "first question",
      "second question",
    ]);
  });

  test("an uncaptured HEAD is stored as null, not a hex stand-in", async () => {
    expect(mockGitContext.head()).toBeNull();
    const events = inMemoryEventLog();
    const ctx = commandContext(mockGitContext, mockSessionContext, clock);
    expect(ctx.attribution.git_hash).toBeNull();
    await new WriteSurface(graph, { ...ctx, events }).pose({ question: "does the coating hold?" });
    expect((await events.all())[0]!.attribution.git_hash).toBeNull();
  });
});
