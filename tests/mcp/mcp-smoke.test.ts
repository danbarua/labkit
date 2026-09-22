/**
 * **Every tool, called once, over the wire.**
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  type ClaimRef,
  type EventSink,
  ReadSurface,
  WriteSurface,
  inMemoryEventLog,
} from "@labkit/core-domain";
import {
  commandContext,
  mockGitContext,
  mockSessionContext,
  sessionRegistry,
} from "@labkit/core-domain/context";
import type { TenantGraph } from "@labkit/core-db/graph";
import { buildServer } from "@labkit/app-mcp/server";
import { DOCS_TOOL, META_TOOLS } from "@labkit/app-mcp/docs";
import { SESSION_TOOLS, TOOLS, WRITE_TOOLS } from "@labkit/app-mcp/tools";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/** Every tool this file has actually called, accumulated across the sessions below. */
const called = new Set<string>();

/**
 * The composition `packages/app-mcp/server.ts` uses: one graph and one sink owned here, handed to a
 * **scope** the server enters per tool call.
 */
async function connectServer(
  graph: TenantGraph,
  transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0],
): Promise<EventSink> {
  const events = inMemoryEventLog();
  // Deliberately *not* pre-registered. Each session below calls
  // `register_session` over the wire, which is what an agent actually does —
  // and it means the write gate is exercised implicitly by every write in this
  // file rather than only by the one test that names it.
  const session = sessionRegistry();
  await buildServer(
    (work) =>
      work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(mockGitContext, mockSessionContext),
          events,
        }),
      }),
    session,
  ).connect(transport);
  return events;
}

/**
 * A client, the sink its server writes through, and a domain write surface over the same graph
 * for the records the tools take as arguments but cannot mint themselves. The seed surface has
 * its own sink, so `events` holds only what went over the wire.
 */
async function client(): Promise<{ client: Client; events: EventSink; seed: WriteSurface }> {
  const graph = await scenario.begin();
  const seed = new WriteSurface(graph, { events: inMemoryEventLog() });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const events = await connectServer(graph, serverSide);
  const c = new Client({ name: "smoke", version: "0" });
  await c.connect(clientSide);
  // The first two things an agent does, and the first two this file does: read
  // what the server is for, then say who it is. Every write below would be
  // refused without the second, so a broken handshake fails these tests loudly
  // rather than leaving one assertion red somewhere else.
  await call(c, DOCS_TOOL.name, {});
  await call(c, "register_session", { id: "smoke-agent-0", label: "smoke agent" });
  return { client: c, events, seed };
}

type Json = Record<string, unknown>;

/** A raw call, recorded. A failure names the tool and says why — see tests/mcp.test.ts. */
async function rawCall(c: Client, name: string, args: Json) {
  called.add(name);
  const result = await c.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
  return result;
}

/** One call, recorded. A failure names the tool and says why — see tests/mcp.test.ts. */
async function call(c: Client, name: string, args: Json): Promise<Json> {
  return (await rawCall(c, name, args)).structuredContent as Json;
}

/**
 * A handle out of a tool's reply.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);
const claimIn = (r: Json, asserts: string) =>
  (r.claims as Array<{ claim: string; asserts: string }>).find((c) => c.asserts === asserts)!.claim;

describe("every tool answers when an agent actually calls it", () => {
  test("note, measure, conclude, evaluate — then why, work_list and search", async () => {
    const { client: c, events, seed } = await client();
    try {
      const { enquiry } = await seed.openEnquiry("is the solver faster on sparse instances?");
      const { work } = await seed.planWork({
        objective: "time the solver on the sparse set",
        acceptance: "every instance timed three times",
        mayRead: ["the sparse instance set"],
      });
      const { criterion } = await seed.stateCriterion("median speedup above 1.2x");
      const { gate } = await seed.declareGate({
        governedBy: [criterion],
        consequence: "the speedup claim is not made",
        protecting: [work],
      });

      const hunch = await call(c, "note", {
        text: "something about how the edge is handled matters — I keep seeing it",
      });
      expect(id(hunch)).toMatch(/^NOTE_/);
      await call(c, "note", {
        text: "worth checking the sparse generator is deterministic before trusting a paired run",
        on: enquiry,
      });

      const observations = await call(c, "record_observations", {
        enquiry,
        name: "sparse timings",
        finding: "three runs per instance",
        content_hash: "sha256:sparse",
      });
      const analysisResult = await rawCall(c, "record_analysis", {
        enquiry,
        method: "paired timing",
        from: [id(observations)],
        implementing: work,
        held_to: [criterion],
      });
      const analysis = analysisResult.structuredContent as Json;
      expect(analysis.heldTo as string[]).toEqual([criterion]);
      const analysisText = (analysisResult.content as Array<{ type: string; text?: string }>)[0];
      if (analysisText?.type !== "text" || analysisText.text === undefined)
        throw new Error("record_analysis returned no text result");
      expect(JSON.parse(analysisText.text)).toEqual(analysis);
      // The run, then the finding: two acts, two calls.
      const concluded = await call(c, "conclude", {
        analysis: id(analysis.analysis as Json),
        proposition: SPARSE,
        finding: "median speedup 1.4x",
      });
      const claim = claimIn(concluded, SPARSE);

      await call(c, "evaluate_criterion", {
        criterion,
        value: "1.4",
        outcome: "pass",
        gate,
        citing: [claim],
      });

      // The `Gate` case of `why`. Every check passed, so the cause cites the
      // one condition that did, not an absence.
      const gateWhy = await call(c, "why", { subject: gate });
      expect(gateWhy.kind).toBe("gate");
      expect(gateWhy.is).toBe("satisfied");
      expect(gateWhy.because as unknown[]).toHaveLength(1);

      const workRows = await call(c, "work_list", { state: "carried-out" });
      // The task above was implemented by the analysis, and its gate is
      // satisfied, so nothing is blocking it.
      expect((workRows.work as Array<{ work: string }>).map((w) => w.work)).toContain(work);

      // `why` dispatches on the handle's own kind. This task was implemented
      // (and never named a question), so the `Work` case leads with that
      // state rather than the planning sentence it used to print for every
      // unstopped task.
      const taskWhy = await call(c, "why", { subject: work });
      expect(taskWhy.kind).toBe("work");
      expect(taskWhy.is).toBe("carried-out");
      expect((taskWhy.because as Array<{ handle: string }>).map((c) => c.handle)).toContain(
        id(analysis.analysis as Json),
      );

      // The claim case, reached by the claim's own handle.
      const claimWhy = await call(c, "why", { subject: claim });
      expect(claimWhy.kind).toBe("claim");
      expect((claimWhy.report as Json).verdict).toBe("supported");

      // A note has no report of its own and is answered by walking the record.
      const noteWhy = await call(c, "why", { subject: id(hunch) });
      expect(noteWhy.kind).toBe("note");
      expect(noteWhy.report).toBeUndefined();
      // Each cause says how it is joined, in words rather than an edge label.
      for (const cause of noteWhy.because as Json[]) {
        expect(cause.wording as string).not.toMatch(/[A-Z]{4,}/);
      }

      const searched = await call(c, "search", { text: "how the edge is handled" });
      const noteGroup = (
        searched.groups as Array<{ label: string; matches: Array<{ handle: string }> }>
      ).find((g) => g.label === "Note");
      expect(noteGroup?.matches.map((m) => m.handle)).toEqual([id(hunch)]);

      // Attribution over the full MCP path, not just a direct surface call. The server builds a
      // fresh `WriteSurface` per tool call, so this also checks the sink survived that: every
      // write in this session landed in one log, each stamped by the mock providers.
      const expected = commandContext(mockGitContext, mockSessionContext).attribution;
      const written = await events.all();
      expect(written.length).toBeGreaterThan(1);
      expect(written.map((e) => e.attribution)).toEqual(written.map(() => expected));

      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("an enquiry answered over the wire, and why it says so", async () => {
    const { client: c, seed } = await client();
    try {
      const { enquiry } = await seed.openEnquiry("does the coating slow corrosion?");
      const observations = await call(c, "record_observations", {
        enquiry,
        name: "immersion series",
        finding: "mass loss at six intervals",
      });
      const first = await call(c, "record_analysis", {
        enquiry,
        method: "linear fit",
        from: [id(observations)],
      });
      const concluded = await call(c, "conclude", {
        analysis: id(first.analysis as Json),
        proposition: COATING,
        finding: "rate down 40%",
      });
      // A wire handle is a string; the domain verb wants the branded ref.
      await seed.closeEnquiry({ enquiry, answeredBy: claimIn(concluded, COATING) as ClaimRef });

      // `why`'s `LineOfEnquiry` case reports where this enquiry's own
      // question sits in the overall survey, one bucket rather than the
      // whole survey. Answered on a claim nothing here promoted, so it lands
      // in `provisional` -- "answered, but not something to build on yet".
      const enquiryWhy = await call(c, "why", { subject: enquiry });
      expect(enquiryWhy.kind).toBe("enquiry");
      expect(((enquiryWhy.report as Json).enquiry as Json).closure).toBe("answered");
      expect(enquiryWhy.because as unknown[]).toHaveLength(1);
      expect((enquiryWhy.because as Json[])[0]!.wording as string).toContain("provisional");
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  /**
   * The gate. It runs last because it reads what the tests above recorded.
   */
  test("no tool goes unexercised", () => {
    const all = [...META_TOOLS, ...TOOLS, ...WRITE_TOOLS, ...SESSION_TOOLS]
      .map((t) => t.name)
      .sort();
    expect([...called].sort()).toEqual(all);
  });

  const SPARSE = "the solver is faster on sparse instances";
  const COATING = "the coating slows corrosion";
});
