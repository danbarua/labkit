/**
 * The MCP server, driven as a client drives it.
 *
 * Every harness here hands `buildServer` surfaces it built itself, so this file
 * covers the declarations and the handlers and nothing about how `surfacesOver`
 * assembles a write. Guard a change to that in `tests/mcp-stdio.test.ts`: a test
 * added here passes on a server that never made the call.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ReadSurface,
  ResearchSession,
  WriteSurface,
  inMemoryEventLog,
  type Clock,
} from "@labkit/core-domain";
import type { TenantGraph } from "@labkit/core-db/graph";
import { buildServer } from "@labkit/app-mcp/server";
import { TOOLS, WRITE_TOOLS } from "@labkit/app-mcp/tools";
import { explanationSchema } from "@labkit/app-mcp/schemas";
import { instructionsFor } from "@labkit/app-mcp/docs";
import { Command } from "commander";
import { globalOptions } from "@labkit/app-cli/program";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

/**
 * A handle out of a tool's reply.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);

/**
 * The composition `packages/app-mcp/server.ts` uses: one graph, one sink owned here, and handed to a
 * **scope** the server enters per tool call.
 */
async function connectServer(
  graph: TenantGraph,
  transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0],
) {
  const events = inMemoryEventLog();
  return buildServer((work) =>
    work({
      read: new ReadSurface(graph, { events }),
      write: new WriteSurface(graph, { events }),
    }),
  ).connect(transport);
}

/** Every tool the server registers. */
const WRITING = { reads: TOOLS, writes: WRITE_TOOLS };

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

const clock: Clock = (() => {
  let t = 0;
  return {
    now: () => new Date(Date.UTC(2026, 2, 1) + t++ * 60_000).toISOString(),
  };
})();

describe("structure", () => {
  test("every declared tool is registered, and only the reads claim to be read-only", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const graph = await scenario.begin();
    try {
      await connectServer(graph, serverSide);
      const client = new Client({ name: "test", version: "0" });
      await client.connect(clientSide);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [...TOOLS, ...WRITE_TOOLS].map((t) => t.name).sort(),
      );

      // Derived from which list a tool is in, not from a list of names here.
      const readNames = new Set(TOOLS.map((t) => t.name));
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint ?? false).toBe(readNames.has(t.name));
      }
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});

describe("an agent can track work through the tools alone", () => {
  /**
   * The sentence this file exists to assert: **an agent with this server, handed the handles
   * the write tools take, can put a piece of research on the record and then ask about it.**
   * The enquiry, work, criterion and gate a test needs are seeded through the domain's write
   * surface; every act after that goes over the wire through `callTool`, and the reads at the
   * end see what the writes put there.
   */
  async function client() {
    const graph = await scenario.begin();
    const seed = new WriteSurface(graph, { clock, events: inMemoryEventLog() });
    const read = new ReadSurface(graph);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(graph, serverSide);
    const c = new Client({ name: "test", version: "0" });
    await c.connect(clientSide);
    return { c, seed, read };
  }

  const call = async (c: Client, name: string, args: Record<string, unknown>) => {
    const result = await c.callTool({ name, arguments: args });
    // The message, not just `true`. `expect(isError).toBe(false)` reported
    // "Expected: false / Received: true" and nothing about which tool or why,
    // which is a failing test that cannot name its own failure.
    if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    return result.structuredContent as Record<string, unknown>;
  };

  test("record, analyse, conclude — then why answers about it", async () => {
    const { c, seed } = await client();
    try {
      const { enquiry } = await seed.openEnquiry("does the pruning schedule move convergence?");

      const observations = await call(c, "record_observations", {
        enquiry,
        name: "sweep readings",
        finding: "twelve runs at five seeds",
        content_hash: "sha256:abc",
      });

      const analysis = await call(c, "record_analysis", {
        enquiry,
        method: "paired comparison",
        from: [id(observations)],
      });
      expect(analysis.analysis as string).toMatch(/^COMP_/);
      // Two calls, because the run and the finding are two acts.
      const concluded = await call(c, "conclude", {
        analysis: id(analysis),
        proposition: PROP,
        finding: "moves by ~3 steps",
      });
      const claimId = (concluded.claims as Array<{ claim: string; asserts: string }>).find(
        (x) => x.asserts === PROP,
      )!.claim;
      expect(claimId.startsWith("CLM_")).toBe(true);

      // Now the reads, which had nothing to say before any of the above.
      const why = await call(c, "why", { subject: claimId });
      expect(why.kind).toBe("claim");
      expect((why.report as Record<string, unknown>).verdict).toBe("supported");

      // The same claim, reached by its proposition rather than its handle.
      const byWording = await call(c, "why", { subject: PROP });
      expect(byWording.subject).toBe(claimId);

      const status = await call(c, "why", { subject: enquiry });
      expect(status.kind).toBe("enquiry");
      expect(
        ((status.report as Record<string, unknown>).enquiry as Record<string, unknown>).open,
      ).toBe(true);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("a gate is computed from its checks, not set", async () => {
    // The second loop worth having end to end: state a condition before running
    // anything, gate work on it, record an analysis held to it, then evaluate.
    // Nothing anywhere sets a gate to `satisfied` -- the read computes it.
    const { c, seed, read } = await client();
    try {
      const { criterion } = await seed.stateCriterion("the effect holds at five seeds");
      const { work } = await seed.planWork({
        objective: "publish the convergence result",
        acceptance: "the prespecified check passes",
      });
      const { gate } = await seed.declareGate({
        governedBy: [criterion],
        consequence: "whether the result may be published",
        protecting: [work],
      });
      const { enquiry } = await seed.openEnquiry("does it hold at five seeds?");

      const observations = await call(c, "record_observations", {
        enquiry,
        name: "seed sweep",
        finding: "five seeds, consistent",
      });
      const sweep = await call(c, "record_analysis", {
        enquiry,
        method: "seed sweep",
        from: [id(observations)],
        implementing: work,
        held_to: [criterion],
      });
      await call(c, "conclude", {
        analysis: id(sweep),
        proposition: HOLDS,
        finding: "holds at all five",
        standing: "confirmatory",
      });

      // Unmet before the check is run -- an unrun check counts against the
      // finding it qualifies, which is why the criterion is stated up front.
      const beforeCheck = await read.whySupported({ claim: await claimNamed(read, HOLDS) });
      expect(beforeCheck.unmet).not.toEqual([]);
      expect((await call(c, "why", { subject: gate })).is).not.toBe("satisfied");
      expect(
        ((await call(c, "work_list", { state: "blocked" })).work as Array<{ work: string }>).map(
          (w) => w.work,
        ),
      ).not.toContain(work);

      await call(c, "evaluate_criterion", {
        criterion,
        gate,
        value: "5/5 seeds",
        outcome: "pass",
      });

      const afterCheck = await read.whySupported({ claim: await claimNamed(read, HOLDS) });
      expect(afterCheck.unmet).toEqual([]);
      expect((await call(c, "why", { subject: gate })).is).toBe("satisfied");
      expect(
        (
          (await call(c, "work_list", { state: "carried-out" })).work as Array<{ work: string }>
        ).map((w) => w.work),
      ).toContain(work);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  const PROP = "the pruning schedule moves convergence";
  const HOLDS = "the effect holds at five seeds";
});

describe("the tool documentation resource", () => {
  /**
   * The property worth testing is not that the markdown looks right -- it is that it is
   * *derived*.
   */

  /** The one content block, narrowed to the text variant a markdown resource returns. */
  const markdown = (contents: ReadonlyArray<{ mimeType?: string } & Record<string, unknown>>) => {
    const first = contents[0];
    if (!first || typeof first.text !== "string") throw new Error("resource returned no text");
    return { mimeType: first.mimeType, text: first.text };
  };

  async function connected() {
    const graph = await scenario.begin();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(graph, serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  }

  test("the handshake names the registered tools, and nothing is served beside them", async () => {
    const client = await connected();
    try {
      expect(client.getInstructions()).toBe(instructionsFor(WRITING));
      expect(client.getServerCapabilities()?.resources).toBeUndefined();
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  /**
   * The flag says what `--reconstructed-from` is **not** for: a caller writing up yesterday's own
   * run would otherwise read it as an invitation, and an over-stamped act is indistinguishable
   * downstream from a real transcription.
   */
  test("the reconstruction flag says what it is not for", () => {
    const cli = globalOptions(new Command("labkit"))
      .options.find((o) => o.long === "--reconstructed-from")!
      .description.toLowerCase();
    expect(cli).toContain("did not perform");
    expect(cli).toContain("not for your own results");
  });
});

describe("behaviour — the same answers, over the wire", () => {
  /**
   * One programme: a question asked, worked on, concluded and closed, plus a second question
   * nothing has touched, and one piece of planned work. Enough for every tool to have something
   * to say.
   */
  async function seeded() {
    const graph = await scenario.begin();
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    const { enquiry } = await s.writes.openEnquiry("does the pruning schedule move convergence?");
    await s.writes.pose({ question: "does depth move convergence?" });
    const { observations } = await s.writes.recordObservations({
      enquiry,
      name: "sweep readings",
      finding: "twelve runs at five seeds",
    });
    const { analysis, claims: analysisClaims } = await recordAnalysis(s.writes, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
    });
    await s.writes.closeEnquiry({
      enquiry,
      answeredBy: [claimOf(analysisClaims, PROP)],
    });
    await s.writes.planWork({
      objective: "publish the convergence result",
      acceptance: "the prespecified check passes",
    });

    const current = await scenario.current();
    const read = new ReadSurface(current);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(current, serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return { client, read, enquiry, analysis, analysisClaims, observations };
  }

  const PROP = "the pruning schedule moves convergence";

  const structured = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError ?? false).toBe(false);
    return result.structuredContent as Record<string, unknown>;
  };

  test("why, search and work_list agree with the read surface", async () => {
    const { client, read, enquiry } = await seeded();
    try {
      const claim = await claimNamed(read, PROP);
      expect(await structured(client, "why", { subject: claim })).toEqual(
        JSON.parse(JSON.stringify(await read.why({ subject: claim }))),
      );
      expect(await structured(client, "why", { subject: enquiry })).toEqual(
        JSON.parse(JSON.stringify(await read.why({ subject: enquiry }))),
      );
      expect(await structured(client, "search", { text: "convergence" })).toEqual(
        JSON.parse(JSON.stringify({ groups: await read.search({ text: "convergence" }) })),
      );
      expect(await structured(client, "work_list", {})).toEqual(
        JSON.parse(JSON.stringify({ work: await read.workList({}) })),
      );
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool's real output parses against its declared schema", async () => {
    // Runtime parse against the domain codec the tool advertises. The type is
    // `z.infer` of that codec. There is no second Exact<> list in mcp/schemas.ts.
    const { client, read, enquiry } = await seeded();
    try {
      const parsed = async (name: string, args: Record<string, unknown>) => {
        const schema = TOOLS.find((t) => t.name === name)?.outputSchema;
        if (!schema) throw new Error(`${name} declares no outputSchema`);
        const result = await schema.safeParseAsync(await structured(client, name, args));
        if (!result.success) throw new Error(`${name}: ${JSON.stringify(result.error.issues)}`);
      };

      await parsed("search", { text: "convergence" });
      await parsed("work_list", {});

      // `why` is the one tool with no declared schema -- the SDK cannot carry
      // `explanationSchema`'s discriminated union (see packages/app-mcp/tools.ts).
      // Its shapes are still checked, here, for both cases this test has a
      // handle for. `work`'s case is checked the same way in tests/mcp-smoke.test.ts.
      const claimWhy = explanationSchema.safeParse(
        await structured(client, "why", {
          subject: (await read.claimsAsserting({ proposition: PROP }))[0]!.claim,
        }),
      );
      expect(claimWhy.success).toBe(true);
      expect(claimWhy.success && claimWhy.data.kind).toBe("claim");
      const enquiryWhy = explanationSchema.safeParse(
        await structured(client, "why", { subject: enquiry }),
      );
      expect(enquiryWhy.success).toBe(true);
      expect(enquiryWhy.success && enquiryWhy.data.kind).toBe("enquiry");
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool but `why` declares an output schema", () => {
    // Derived, not listed: a tool added later without one fails here rather
    // than shipping unvalidated. `why`'s reason is on its own definition in
    // `packages/app-mcp/tools.ts`: the SDK cannot carry `explanationSchema`'s
    // discriminated union.
    expect(TOOLS.filter((t) => !t.outputSchema).map((t) => t.name)).toEqual(["why"]);
  });

  test("a domain refusal arrives as an error, never as an empty success", async () => {
    const { client } = await seeded();
    try {
      const result = await client.callTool({
        name: "why",
        arguments: { subject: "LOE_does_not_exist" },
      });
      expect(result.isError).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});
