/**
 * Attribution: who ran a command, recorded beside when.
 *
 * Four tests, and each of them exists because a different thing could break
 * silently. The feature has no reader in the product yet — nothing queries an
 * event's attribution — so this file *is* the only thing standing between the
 * field and a regression nobody would notice.
 *
 * It lives outside `tests/scenarios/` on purpose. A scenario asserts that a
 * researcher's intent can be carried out through research verbs alone; this
 * asserts something about the *execution context* a verb runs in, which is not
 * a research question and does not belong in a research conversation.
 */

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
  type GitContextProvider,
  type SessionContextProvider,
} from "../src/attribution";
import { openScenario, type Scenario } from "./helpers/scenario";
import type { TenantGraph } from "../src/db/graph";

let scenario: Scenario;
let graph: TenantGraph;

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => { graph = await scenario.begin(); });
afterEach(async () => { await scenario.end(); });

const clock: Clock = { now: () => "2026-08-24T09:00:00.000Z" };

const agent = (label: string, id: string, head: string): AttributionContext =>
  commandContext(
    { head: () => head } satisfies GitContextProvider,
    { label: () => label, id: () => id } satisfies SessionContextProvider,
    clock,
  ).attribution;

describe("an event says who caused it", () => {
  test("a verb stamps the surface's attribution onto what it emits", async () => {
    const attribution = agent("claude-opus-5", "sess-1", "a".repeat(40));
    const events = inMemoryEventLog();
    const write = new WriteSurface(graph, { clock, attribution, events });

    await write.pose("does the coating slow corrosion?");

    const [recorded] = (await events.all());
    expect(recorded?.operation).toBe("pose");
    expect(recorded?.attribution).toEqual(attribution);
  });

  /**
   * The default is a **statement**, not an absence.
   *
   * `tests/domain-session.test.ts` constructs `new ResearchSession(graph)` bare
   * and every scenario passes only a clock, so the unattributed path is the one
   * most of the suite runs. It has to produce a value a reader can act on: an
   * event carrying three empty strings under a named constant says nobody
   * claimed this, where an absent key would leave a reader unable to tell that
   * from a writer that forgot.
   */
  test("a surface given no attribution emits UNATTRIBUTED, not undefined", async () => {
    const events = inMemoryEventLog();
    const session = new ResearchSession(graph, { clock, events });

    await session.pose("is the solver faster?");

    expect((await events.all())[0]?.attribution).toEqual(UNATTRIBUTED);
  });

  /**
   * The point of the feature, stated as the thing it makes possible.
   *
   * Two surfaces over one graph and one sink, differing only in who is
   * running them, produce a stream in which the two authors are separable —
   * which is the question "who did this?" answered, and the reason
   * `attribution_id` is a field of its own rather than a label. The labels here
   * would be enough; they are not asserted on, because a label is renameable
   * and an id is what a later reader would actually group by.
   */
  test("two agents writing to one record stay distinguishable", async () => {
    const events = inMemoryEventLog();
    const dan = agent("dan", "human-1", "b".repeat(40));
    const claude = agent("claude-opus-5", "agent-1", "b".repeat(40));

    await new WriteSurface(graph, { clock, attribution: dan, events })
      .pose("does the coating slow corrosion?");
    await new WriteSurface(graph, { clock, attribution: claude, events })
      .pose("is the solver faster?");

    expect((await events.all()).map((e) => e.attribution.attribution_id)).toEqual([
      "human-1",
      "agent-1",
    ]);
  });

  /**
   * **The regression guard on the sink hoist**, and the reason it is here
   * rather than in the MCP tests.
   *
   * `src/mcp/server.ts` builds a `WriteSurface` per tool call so each one can
   * carry its own attribution. That is only safe because the sink is
   * constructed by `main()` and passed in. If it ever goes back to being
   * defaulted per surface — `new WriteSurface(graph)` — every call gets a
   * private log, the read half holds whichever one was built first, and the
   * event stream fragments with nothing failing. This test fails in exactly
   * that case, one layer below where the mistake would be made.
   */
  test("surfaces built per command share the sink they were handed", async () => {
    const events = inMemoryEventLog();
    const ctx = commandContext(mockGitContext, mockSessionContext, clock);

    await new WriteSurface(graph, { ...ctx, events }).pose("first question");
    await new WriteSurface(graph, { ...ctx, events }).pose("second question");

    expect((await events.all()).map((e) => e.detail?.question)).toEqual([
      "first question",
      "second question",
    ]);
  });
});
